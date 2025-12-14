#!/usr/bin/env node
/**
 * Verify singleton pattern for backends
 */

import { InferenceEngine } from '../src/core/InferenceEngine.js';

console.log('Testing singleton pattern...\n');

// Create two separate InferenceEngine instances
const engine1 = new InferenceEngine();
const engine2 = new InferenceEngine();

await engine1.initialize();
await engine2.initialize();

// Get ONNX backends from both engines
const backend1 = engine1.getBackend('onnx');
const backend2 = engine2.getBackend('onnx');

// Check if they're the SAME instance (singleton)
if (backend1 === backend2) {
	console.log('✅ PASSED: Both engines share the same OnnxBackend instance');
	console.log('   Backend 1:', backend1.name);
	console.log('   Backend 2:', backend2.name);
	console.log('   backend1 === backend2:', true);
	console.log('\n✅ Singleton pattern is working correctly!\n');
	process.exit(0);
} else {
	console.log('❌ FAILED: Engines have different OnnxBackend instances');
	console.log('   This means the singleton pattern is NOT working');
	process.exit(1);
}
