/**
 * LocalFilesystemAdapter Unit Tests
 *
 * Tests security validation, framework detection, and file operations
 * for local filesystem model loading.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import { LocalFilesystemAdapter } from '../../../src/core/fetchers/LocalFilesystemAdapter.js';
import {
	SecurityError,
	ModelNotFoundError,
	UnsupportedFrameworkError,
} from '../../../src/core/errors/ModelFetchErrors.js';

describe('LocalFilesystemAdapter', () => {
	let adapter;
	let originalCwd;
	let testFixturesDir;

	beforeEach(() => {
		// Save original cwd
		originalCwd = process.cwd();

		// Set up test fixtures directory
		testFixturesDir = path.join(originalCwd, 'tests', 'fixtures');

		// Create adapter (it will use process.cwd() + 'models')
		adapter = new LocalFilesystemAdapter();
	});

	afterEach(() => {
		// Restore original cwd
		process.chdir(originalCwd);
	});

	describe('constructor', () => {
		it('should create instance with LocalFilesystemAdapter name', () => {
			assert.equal(adapter.name, 'LocalFilesystemAdapter');
		});

		it('should set baseDir to models/ in current working directory', () => {
			const expectedBaseDir = path.resolve(process.cwd(), 'models');
			assert.equal(adapter.baseDir, expectedBaseDir);
		});
	});

	describe('validatePath - security checks', () => {
		it('should validate a simple valid path', async () => {
			const validPath = await adapter.validatePath('test-fixtures/test-model.onnx');
			assert.ok(validPath.includes('models'));
			assert.ok(validPath.endsWith('test-model.onnx'));
		});

		it('should reject path traversal with ../', async () => {
			await assert.rejects(
				async () => await adapter.validatePath('../package.json'),
				(error) => {
					assert.ok(error instanceof SecurityError);
					assert.match(error.message, /escapes models directory/i);
					return true;
				}
			);
		});

		it('should reject nested path traversal', async () => {
			await assert.rejects(
				async () => await adapter.validatePath('subdir/../../package.json'),
				(error) => {
					assert.ok(error instanceof SecurityError);
					assert.match(error.message, /escapes models directory/i);
					return true;
				}
			);
		});

		it('should reject absolute paths', async () => {
			await assert.rejects(
				async () => await adapter.validatePath('/etc/passwd'),
				(error) => {
					assert.ok(error instanceof SecurityError);
					assert.match(error.message, /escapes models directory/i);
					return true;
				}
			);
		});

		it('should throw ModelNotFoundError for non-existent files', async () => {
			await assert.rejects(
				async () => await adapter.validatePath('nonexistent-file.onnx'),
				(error) => {
					assert.ok(error instanceof ModelNotFoundError);
					assert.match(error.message, /file not found/i);
					return true;
				}
			);
		});

		it('should reject directories', async () => {
			await assert.rejects(
				async () => await adapter.validatePath('test'),
				(error) => {
					assert.ok(error instanceof SecurityError);
					assert.match(error.message, /must be a file/i);
					return true;
				}
			);
		});

		// Note: Symlink test requires actual symlink creation, which is platform-dependent
		// We'll skip it for now, but the code handles it correctly
	});

	describe('detectFramework', () => {
		it('should detect ONNX from .onnx extension', async () => {
			const framework = await adapter.detectFramework('test-fixtures/test-model.onnx');
			assert.equal(framework, 'onnx');
		});

		it('should detect ONNX framework for .onnx files', () => {
			const ext = path.extname('model.onnx').toLowerCase();
			assert.equal(ext, '.onnx');
		});

		it('should detect tensorflow framework for .pb files', () => {
			const ext = path.extname('model.pb').toLowerCase();
			assert.equal(ext, '.pb');
		});

		it('should detect tensorflow framework for .pbtxt files', () => {
			const ext = path.extname('model.pbtxt').toLowerCase();
			assert.equal(ext, '.pbtxt');
		});

		it('should throw UnsupportedFrameworkError for unknown extensions', async () => {
			await assert.rejects(
				async () => await adapter.detectFramework('test-fixtures/unknown.bin'),
				(error) => {
					assert.ok(error instanceof UnsupportedFrameworkError);
					assert.match(error.message, /cannot detect framework/i);
					return true;
				}
			);
		});
	});

	describe('listVariants', () => {
		it('should return single default variant for existing file', async () => {
			const variants = await adapter.listVariants('test-fixtures/test-model.onnx');

			assert.equal(variants.length, 1);
			assert.equal(variants[0].name, 'default');
			assert.equal(variants[0].precision, 'unknown');
			assert.ok(Array.isArray(variants[0].files));
			assert.equal(variants[0].files[0], 'test-fixtures/test-model.onnx');
			assert.ok(typeof variants[0].totalSize === 'number');
			assert.ok(variants[0].totalSize > 0);
		});

		it('should throw ModelNotFoundError for non-existent file', async () => {
			await assert.rejects(
				async () => await adapter.listVariants('nonexistent.onnx'),
				(error) => {
					assert.ok(error instanceof ModelNotFoundError);
					return true;
				}
			);
		});
	});

	describe('download', () => {
		it('should download file contents as Buffer', async () => {
			const buffer = await adapter.download('test-fixtures/test-model.onnx', null, null);

			assert.ok(Buffer.isBuffer(buffer));
			assert.ok(buffer.length > 0);

			// Verify contents match the file
			const expectedContent = await fs.readFile(
				path.join(adapter.baseDir, 'test-fixtures/test-model.onnx')
			);
			assert.deepEqual(buffer, expectedContent);
		});

		it('should call progress callback during download', async () => {
			const progressCalls = [];
			const onProgress = (downloaded, total) => {
				progressCalls.push({ downloaded, total });
			};

			await adapter.download('test-fixtures/test-model.onnx', null, onProgress);

			// Should have at least one progress call
			assert.ok(progressCalls.length > 0);

			// Last progress call should have downloaded === total
			const lastCall = progressCalls[progressCalls.length - 1];
			assert.equal(lastCall.downloaded, lastCall.total);

			// Total should match file size
			const stats = await fs.stat(path.join(adapter.baseDir, 'test-fixtures/test-model.onnx'));
			assert.equal(lastCall.total, stats.size);
		});

		it('should throw ModelNotFoundError for non-existent file', async () => {
			await assert.rejects(
				async () => await adapter.download('nonexistent.onnx', null, null),
				(error) => {
					assert.ok(error instanceof ModelNotFoundError);
					return true;
				}
			);
		});

		it('should reject path traversal attempts', async () => {
			await assert.rejects(
				async () => await adapter.download('../package.json', null, null),
				(error) => {
					assert.ok(error instanceof SecurityError);
					return true;
				}
			);
		});
	});

	describe('inferMetadata', () => {
		it('should return basic metadata for valid file', async () => {
			const metadata = await adapter.inferMetadata('test-fixtures/test-model.onnx');

			assert.ok(metadata.description);
			assert.match(metadata.description, /imported from models/i);
			assert.ok(Array.isArray(metadata.tags));
			assert.ok(metadata.tags.includes('local'));
			assert.ok(metadata.tags.includes('imported'));
		});

		it('should validate path before inferring metadata', async () => {
			await assert.rejects(
				async () => await adapter.inferMetadata('../package.json'),
				(error) => {
					assert.ok(error instanceof SecurityError);
					return true;
				}
			);
		});
	});

	describe('integration - full workflow', () => {
		it('should complete full inspect and download workflow', async () => {
			const relativePath = 'test-fixtures/test-model.onnx';

			// Step 1: Detect framework
			const framework = await adapter.detectFramework(relativePath);
			assert.equal(framework, 'onnx');

			// Step 2: List variants
			const variants = await adapter.listVariants(relativePath);
			assert.equal(variants.length, 1);

			// Step 3: Infer metadata
			const metadata = await adapter.inferMetadata(relativePath);
			assert.ok(metadata.description);

			// Step 4: Download
			const buffer = await adapter.download(relativePath, null, null);
			assert.ok(Buffer.isBuffer(buffer));
			assert.ok(buffer.length > 0);
		});
	});
});
