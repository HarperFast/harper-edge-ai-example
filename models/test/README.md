# Test ONNX Models

This directory contains minimal ONNX models for testing the inference infrastructure.

## Available Models

### 1. identity.onnx
- **Purpose**: Infrastructure testing
- **Input**: `[1, 10]` float tensor
- **Output**: `[1, 10]` float tensor (same as input)
- **Use Case**: Testing model loading and inference without computation overhead

### 2. random-embeddings.onnx
- **Purpose**: Embedding benchmarks
- **Input**: `[1, sequence_length]` int64 tensor (token IDs)
- **Output**: `[1, 384]` float tensor (embeddings)
- **Use Case**: Testing embedding generation and benchmarking

### 3. simple-classifier.onnx
- **Purpose**: Classification benchmarks
- **Input**: `[1, 384]` float tensor (features)
- **Output**: `[1, 3]` float tensor (logits for 3 classes)
- **Use Case**: Testing classification and benchmarking

## Generating Models

The test models are generated using a Python script. To generate them:

### Prerequisites

```bash
# Install required Python packages
pip install onnx numpy onnxruntime
```

### Generate Models

```bash
# Run the generation script
cd models/test
python3 generate_test_models.py
```

Or use the Node.js wrapper:

```bash
npm run generate-test-models
```

## Using Real Models

For production use, consider these real ONNX models:

### Text Embeddings

**all-MiniLM-L6-v2** (Sentence Transformers)
```bash
# Install Optimum CLI
pip install optimum[exporters]

# Export to ONNX
optimum-cli export onnx \
  --model sentence-transformers/all-MiniLM-L6-v2 \
  --task feature-extraction \
  all-MiniLM-L6-v2/

# Copy to project
cp all-MiniLM-L6-v2/model.onnx models/test/all-MiniLM-L6-v2.onnx
```

**Source**: [Hugging Face - all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)

### Image Classification

**ResNet-50**
```bash
# Download from ONNX Model Zoo
wget https://github.com/onnx/models/raw/main/vision/classification/resnet/model/resnet50-v2-7.onnx \
  -O models/test/resnet50.onnx
```

**Source**: [ONNX Model Zoo](https://github.com/onnx/models)

## Model Metadata

When loading these models into Harper, use appropriate metadata:

```javascript
const metadata = {
  taskType: 'text-embedding',  // or 'classification', 'image-tagging'
  equivalenceGroup: 'test-models',
  outputDimensions: [384],  // or appropriate dimensions
  description: 'Test model for benchmarking',
  useCase: 'Testing and development'
};
```

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
