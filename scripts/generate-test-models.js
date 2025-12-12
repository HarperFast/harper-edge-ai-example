#!/usr/bin/env node
/**
 * Generate Test ONNX Models
 *
 * Generates minimal ONNX models for testing the inference infrastructure.
 * Creates simple test models that can be used for benchmarking without
 * requiring large downloads or conversions.
 *
 * Usage:
 *   node scripts/generate-test-models.js
 *
 * Output:
 *   - models/test/identity.onnx         Identity model for infrastructure testing
 *   - models/test/random-embeddings.onnx Random embedding model for benchmarks
 *   - models/test/simple-classifier.onnx Simple classifier for testing
 *   - models/test/README.md             Documentation for test models
 *
 * Note:
 *   This script documents how to create ONNX models. Actual model generation
 *   requires Python with onnx, numpy, and onnxruntime packages.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { log } from './lib/cli-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const MODELS_DIR = join(PROJECT_ROOT, 'models', 'test');

/**
 * Ensure models directory exists
 */
function ensureModelsDir() {
  if (!existsSync(MODELS_DIR)) {
    mkdirSync(MODELS_DIR, { recursive: true });
    log.success(`Created directory: ${MODELS_DIR}`);
  }
}

/**
 * Generate Python script for creating ONNX models
 */
function generatePythonScript() {
  const script = `#!/usr/bin/env python3
"""
Generate Test ONNX Models

Creates minimal ONNX models for testing inference infrastructure.
Requires: pip install onnx numpy onnxruntime
"""

import numpy as np
import onnx
from onnx import helper, TensorProto
import os


def create_identity_model():
    """
    Create a simple identity model that outputs its input unchanged.
    Useful for testing infrastructure without computation overhead.
    """
    # Define input and output
    input_tensor = helper.make_tensor_value_info(
        'input', TensorProto.FLOAT, [1, 10]
    )
    output_tensor = helper.make_tensor_value_info(
        'output', TensorProto.FLOAT, [1, 10]
    )

    # Identity node
    identity_node = helper.make_node(
        'Identity',
        inputs=['input'],
        outputs=['output'],
        name='identity'
    )

    # Create graph
    graph = helper.make_graph(
        [identity_node],
        'identity-model',
        [input_tensor],
        [output_tensor]
    )

    # Create model
    model = helper.make_model(graph, producer_name='test-model-generator')
    model.opset_import[0].version = 13

    # Validate and save
    onnx.checker.check_model(model)
    onnx.save(model, 'identity.onnx')
    print('✓ Created identity.onnx')


def create_random_embedding_model():
    """
    Create a simple embedding model with random weights.
    Input: [1, sequence_length] (token IDs)
    Output: [1, embedding_dim] (embeddings)
    """
    vocab_size = 1000
    embedding_dim = 384

    # Random embedding weights
    weights = np.random.randn(vocab_size, embedding_dim).astype(np.float32)
    weights_tensor = helper.make_tensor(
        'embedding_weights',
        TensorProto.FLOAT,
        [vocab_size, embedding_dim],
        weights.flatten().tolist()
    )

    # Define input (token IDs as int64)
    input_tensor = helper.make_tensor_value_info(
        'input_ids', TensorProto.INT64, [1, None]
    )

    # Define output (embeddings)
    output_tensor = helper.make_tensor_value_info(
        'embeddings', TensorProto.FLOAT, [1, embedding_dim]
    )

    # Gather node to lookup embeddings
    gather_node = helper.make_node(
        'Gather',
        inputs=['embedding_weights', 'input_ids'],
        outputs=['gathered'],
        axis=0
    )

    # ReduceMean to average embeddings
    reduce_node = helper.make_node(
        'ReduceMean',
        inputs=['gathered'],
        outputs=['embeddings'],
        axes=[1],
        keepdims=0
    )

    # Create graph
    graph = helper.make_graph(
        [gather_node, reduce_node],
        'random-embedding-model',
        [input_tensor],
        [output_tensor],
        [weights_tensor]
    )

    # Create model
    model = helper.make_model(graph, producer_name='test-model-generator')
    model.opset_import[0].version = 13

    # Validate and save
    onnx.checker.check_model(model)
    onnx.save(model, 'random-embeddings.onnx')
    print('✓ Created random-embeddings.onnx')


def create_simple_classifier():
    """
    Create a simple linear classifier.
    Input: [1, input_dim] (features)
    Output: [1, num_classes] (logits)
    """
    input_dim = 384
    num_classes = 3

    # Random weights and bias
    weights = np.random.randn(input_dim, num_classes).astype(np.float32)
    bias = np.random.randn(num_classes).astype(np.float32)

    weights_tensor = helper.make_tensor(
        'weights',
        TensorProto.FLOAT,
        [input_dim, num_classes],
        weights.flatten().tolist()
    )

    bias_tensor = helper.make_tensor(
        'bias',
        TensorProto.FLOAT,
        [num_classes],
        bias.flatten().tolist()
    )

    # Define input and output
    input_tensor = helper.make_tensor_value_info(
        'features', TensorProto.FLOAT, [1, input_dim]
    )
    output_tensor = helper.make_tensor_value_info(
        'logits', TensorProto.FLOAT, [1, num_classes]
    )

    # MatMul node
    matmul_node = helper.make_node(
        'MatMul',
        inputs=['features', 'weights'],
        outputs=['matmul_out']
    )

    # Add bias
    add_node = helper.make_node(
        'Add',
        inputs=['matmul_out', 'bias'],
        outputs=['logits']
    )

    # Create graph
    graph = helper.make_graph(
        [matmul_node, add_node],
        'simple-classifier',
        [input_tensor],
        [output_tensor],
        [weights_tensor, bias_tensor]
    )

    # Create model
    model = helper.make_model(graph, producer_name='test-model-generator')
    model.opset_import[0].version = 13

    # Validate and save
    onnx.checker.check_model(model)
    onnx.save(model, 'simple-classifier.onnx')
    print('✓ Created simple-classifier.onnx')


def main():
    print("Generating ONNX test models...")
    print()

    create_identity_model()
    create_random_embedding_model()
    create_simple_classifier()

    print()
    print("✓ All test models generated successfully!")
    print()
    print("Models created:")
    print("  • identity.onnx - Simple identity model for testing")
    print("  • random-embeddings.onnx - Random embedding model")
    print("  • simple-classifier.onnx - Simple linear classifier")
    print()
    print("File sizes:")
    for filename in ['identity.onnx', 'random-embeddings.onnx', 'simple-classifier.onnx']:
        if os.path.exists(filename):
            size = os.path.getsize(filename)
            print(f"  • {filename}: {size:,} bytes")


if __name__ == '__main__':
    main()
`;

  return script;
}

/**
 * Generate README for test models
 */
function generateReadme() {
  const readme = `# Test ONNX Models

This directory contains minimal ONNX models for testing the inference infrastructure.

## Available Models

### 1. identity.onnx
- **Purpose**: Infrastructure testing
- **Input**: \`[1, 10]\` float tensor
- **Output**: \`[1, 10]\` float tensor (same as input)
- **Use Case**: Testing model loading and inference without computation overhead

### 2. random-embeddings.onnx
- **Purpose**: Embedding benchmarks
- **Input**: \`[1, sequence_length]\` int64 tensor (token IDs)
- **Output**: \`[1, 384]\` float tensor (embeddings)
- **Use Case**: Testing embedding generation and benchmarking

### 3. simple-classifier.onnx
- **Purpose**: Classification benchmarks
- **Input**: \`[1, 384]\` float tensor (features)
- **Output**: \`[1, 3]\` float tensor (logits for 3 classes)
- **Use Case**: Testing classification and benchmarking

## Generating Models

The test models are generated using a Python script. To generate them:

### Prerequisites

\`\`\`bash
# Install required Python packages
pip install onnx numpy onnxruntime
\`\`\`

### Generate Models

\`\`\`bash
# Run the generation script
cd models/test
python3 generate_test_models.py
\`\`\`

Or use the Node.js wrapper:

\`\`\`bash
npm run generate-test-models
\`\`\`

## Using Real Models

For production use, consider these real ONNX models:

### Text Embeddings

**all-MiniLM-L6-v2** (Sentence Transformers)
\`\`\`bash
# Install Optimum CLI
pip install optimum[exporters]

# Export to ONNX
optimum-cli export onnx \\
  --model sentence-transformers/all-MiniLM-L6-v2 \\
  --task feature-extraction \\
  all-MiniLM-L6-v2/

# Copy to project
cp all-MiniLM-L6-v2/model.onnx models/test/all-MiniLM-L6-v2.onnx
\`\`\`

**Source**: [Hugging Face - all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)

### Image Classification

**ResNet-50**
\`\`\`bash
# Download from ONNX Model Zoo
wget https://github.com/onnx/models/raw/main/vision/classification/resnet/model/resnet50-v2-7.onnx \\
  -O models/test/resnet50.onnx
\`\`\`

**Source**: [ONNX Model Zoo](https://github.com/onnx/models)

## Model Metadata

When loading these models into Harper, use appropriate metadata:

\`\`\`javascript
const metadata = {
  taskType: 'text-embedding',  // or 'classification', 'image-tagging'
  equivalenceGroup: 'test-models',
  outputDimensions: [384],  // or appropriate dimensions
  description: 'Test model for benchmarking',
  useCase: 'Testing and development'
};
\`\`\`

## Notes

- Test models use random weights and are not trained
- They are suitable for infrastructure testing and benchmarking only
- For real applications, use pre-trained models from Hugging Face or ONNX Model Zoo
- Model files are small (~1-2 MB) for quick testing

## References

- [ONNX Documentation](https://onnx.ai/)
- [ONNX Model Zoo](https://github.com/onnx/models)
- [Hugging Face Models](https://huggingface.co/models)
- [Optimum CLI](https://huggingface.co/docs/optimum/exporters/onnx/usage_guides/export_a_model)
`;

  return readme;
}

/**
 * Main execution
 */
function main() {
  log.section('Harper Edge AI - Generate Test ONNX Models');

  try {
    // Ensure directory exists
    ensureModelsDir();

    // Generate Python script
    const pythonScript = generatePythonScript();
    const scriptPath = join(MODELS_DIR, 'generate_test_models.py');
    writeFileSync(scriptPath, pythonScript);
    log.success(`Created Python script: ${scriptPath}`);

    // Generate README
    const readme = generateReadme();
    const readmePath = join(MODELS_DIR, 'README.md');
    writeFileSync(readmePath, readme);
    log.success(`Created README: ${readmePath}`);

    // Instructions
    log.section('Next Steps');

    log.info('To generate the ONNX models:');
    console.log('');
    log.warn('1. Install Python dependencies:');
    console.log('   pip install onnx numpy onnxruntime');
    console.log('');
    log.warn('2. Run the Python script:');
    console.log(`   cd ${MODELS_DIR}`);
    console.log('   python3 generate_test_models.py');
    console.log('');
    log.warn('Or download real models:');
    console.log('   See models/test/README.md for instructions');
    console.log('');

    log.info('Files created:');
    console.log(`  • ${scriptPath}`);
    console.log(`  • ${readmePath}`);
    console.log('');

    log.success('Script generation complete!');
    console.log('');

    process.exit(0);
  } catch (error) {
    log.error(`\nFailed: ${error.message}`);
    if (error.stack) {
      console.log(error.stack);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generatePythonScript, generateReadme };
