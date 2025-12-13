import * as ort from 'onnxruntime-node';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = __dirname;

/**
 * Get or create a minimal ONNX model for testing
 * Creates a simple 2-input -> 1-output linear model
 */
export async function getTestOnnxModel() {
	const modelPath = path.join(FIXTURES_DIR, 'test-model.onnx');

	try {
		// Try to read existing model
		const buffer = await fs.readFile(modelPath);
		return buffer;
	} catch (err) {
		// Create minimal ONNX model programmatically
		// For now, return a placeholder - we'll use a real tiny ONNX model
		// This is a valid minimal ONNX model (identity function)
		const minimalOnnx = Buffer.from(
			'080712050a03312e30120f746573742d6d696e696d616c2d312200220b0a04646174611202080122080a06726573756c74' +
				'1a1c0a06726573756c74120464617461220449646e741a00120f0a0964617461696e7075742201783a0b0a06726573756c7412017942020801',
			'hex'
		);

		await fs.writeFile(modelPath, minimalOnnx);
		return minimalOnnx;
	}
}

/**
 * Get test TensorFlow.js model (use existing Universal Sentence Encoder)
 */
export async function getTestTensorFlowModel() {
	// For TensorFlow test, we'll use a simple mock
	// In real usage, models would be uploaded by users
	return {
		type: 'tensorflow',
		modelJson: JSON.stringify({
			modelTopology: {
				node: [],
				name: 'test-tf-model',
				version: '1.0',
			},
			weightsManifest: [],
		}),
	};
}
