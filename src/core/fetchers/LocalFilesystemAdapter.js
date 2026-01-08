/**
 * Local Filesystem Source Adapter
 *
 * Loads models from the local filesystem with strict security controls.
 * Only reads from the models/ directory to prevent path traversal attacks.
 *
 * Security features:
 * - Path validation (blocks ../, absolute paths, symlinks)
 * - Base directory restriction (models/ only)
 * - Symlink rejection (prevents directory escapes)
 * - File type validation
 *
 * This is the simplest adapter - used for testing worker patterns and
 * importing pre-downloaded models.
 */

import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { BaseSourceAdapter } from './BaseSourceAdapter.js';
import { SecurityError, ModelNotFoundError, UnsupportedFrameworkError } from '../errors/ModelFetchErrors.js';

export class LocalFilesystemAdapter extends BaseSourceAdapter {
	constructor() {
		super('LocalFilesystemAdapter');
		// Safe base directory - models/ in repo root
		this.baseDir = path.resolve(process.cwd(), 'models');
	}

	/**
	 * Validate and resolve safe file path
	 *
	 * Prevents security vulnerabilities:
	 * - Path traversal: ../, ../../../etc/passwd
	 * - Absolute paths: /etc/passwd
	 * - Symlinks: symlink -> /etc/passwd
	 *
	 * @param {string} relativePath - User-provided relative path
	 * @returns {Promise<string>} Validated absolute path
	 * @throws {SecurityError} On security violations
	 * @throws {ModelNotFoundError} If file doesn't exist
	 * @private
	 */
	async validatePath(relativePath) {
		// Resolve absolute path
		const absolutePath = path.resolve(this.baseDir, relativePath);

		// Check if path escapes base directory
		if (!absolutePath.startsWith(this.baseDir + path.sep) && absolutePath !== this.baseDir) {
			throw new SecurityError(`Path ${relativePath} escapes models directory`);
		}

		// Check file exists
		try {
			const stats = await fs.lstat(absolutePath); // lstat doesn't follow symlinks

			// Reject symlinks (security: could point outside models/)
			if (stats.isSymbolicLink()) {
				throw new SecurityError('Symlinks are not allowed for security reasons');
			}

			// Must be a file, not a directory
			if (!stats.isFile()) {
				throw new SecurityError('Path must be a file, not a directory');
			}

			return absolutePath;
		} catch (error) {
			if (error.code === 'ENOENT') {
				throw new ModelNotFoundError(`File not found in models directory: ${relativePath}`);
			}
			// Re-throw SecurityError or other errors
			throw error;
		}
	}

	/**
	 * Detect framework from file extension
	 *
	 * @param {string} relativePath - Relative path in models/ directory
	 * @param {string|null} variant - Not used for filesystem
	 * @returns {Promise<string>} Framework: 'onnx' | 'tensorflow' | 'unsupported'
	 */
	async detectFramework(relativePath, variant = null) {
		// Validate path first (security)
		await this.validatePath(relativePath);

		// Infer from file extension
		const ext = path.extname(relativePath).toLowerCase();

		if (ext === '.onnx') return 'onnx';
		if (ext === '.pb' || ext === '.pbtxt') return 'tensorflow';

		// Cannot detect from extension
		throw new UnsupportedFrameworkError(
			`Cannot detect framework from file extension '${ext}'. ` +
				'Please specify framework explicitly when fetching.'
		);
	}

	/**
	 * List available variants
	 *
	 * Filesystem models only have a single "default" variant.
	 *
	 * @param {string} relativePath - Relative path
	 * @returns {Promise<Array<Object>>} Single variant
	 */
	async listVariants(relativePath) {
		const safePath = await this.validatePath(relativePath);
		const stats = await fs.stat(safePath);

		return [
			{
				name: 'default',
				files: [relativePath],
				totalSize: stats.size,
				precision: 'unknown'
			}
		];
	}

	/**
	 * Download (read) model from local filesystem
	 *
	 * Streams file from models/ directory with progress tracking.
	 * Security: Path is validated to prevent traversal attacks.
	 *
	 * @param {string} relativePath - Relative path in models/ directory
	 * @param {string|null} variant - Not used for filesystem
	 * @param {Function} onProgress - Progress callback
	 * @returns {Promise<Buffer>} Model file contents
	 */
	async download(relativePath, variant, onProgress) {
		const safePath = await this.validatePath(relativePath);

		// Get file size for progress tracking
		const stats = await fs.stat(safePath);
		const totalBytes = stats.size;
		let downloadedBytes = 0;

		// Stream file in chunks
		const chunks = [];
		const stream = createReadStream(safePath, { highWaterMark: 64 * 1024 }); // 64KB chunks

		for await (const chunk of stream) {
			chunks.push(chunk);
			downloadedBytes += chunk.length;

			// Report progress
			if (onProgress) {
				onProgress(downloadedBytes, totalBytes);
			}
		}

		return Buffer.concat(chunks);
	}

	/**
	 * Infer metadata from local file
	 *
	 * Limited metadata available from filesystem - just file info.
	 * User should provide metadata explicitly when fetching.
	 *
	 * @param {string} relativePath - Relative path
	 * @param {string|null} variant - Not used
	 * @returns {Promise<Object>} Basic metadata
	 */
	async inferMetadata(relativePath, variant = null) {
		await this.validatePath(relativePath); // Validate for security

		return {
			description: `Model imported from models/${relativePath}`,
			tags: ['local', 'imported']
		};
	}
}
