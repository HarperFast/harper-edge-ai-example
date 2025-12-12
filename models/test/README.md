# Test ONNX Models

This directory contains real, pre-trained ONNX models for testing the inference infrastructure.

## Available Models

### all-MiniLM-L6-v2

**Source**: [sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)

- **Size**: ~90MB
- **Task**: Text embeddings / Sentence similarity
- **Input**: Tokenized text (input_ids, attention_mask)
- **Output**: 384-dimensional embeddings
- **Use Case**: Semantic search, text similarity, clustering

**Example usage:**
```javascript
// Upload to Harper
const modelBlob = fs.readFileSync('all-MiniLM-L6-v2.onnx');

await fetch('http://localhost:9926/Model', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: 'all-MiniLM-L6-v2:v1',
    modelId: 'all-MiniLM-L6-v2',
    version: 'v1',
    framework: 'onnx',
    stage: 'development',
    modelBlob: modelBlob.toString('base64'),
    metadata: JSON.stringify({
      taskType: 'text-embedding',
      equivalenceGroup: 'sentence-encoder',
      outputDimensions: [384]
    })
  })
});
```

## Downloading Models

Models are automatically downloaded when you run:

```bash
npm run generate-test-models
```

Or manually:

```bash
node scripts/generate-test-models.js
```

## Model Metadata

The `model-metadata.json` file contains structured metadata for each model:

- **taskType**: Type of ML task (e.g., "text-embedding")
- **equivalenceGroup**: Group of equivalent models for benchmarking
- **outputDimensions**: Shape of model output
- **description**: Human-readable description
- **useCase**: Intended use case

## Adding More Models

To add more models, edit `scripts/generate-test-models.js` and add to the `MODELS` array:

```javascript
{
  name: 'model-name',
  filename: 'model-name.onnx',
  url: 'https://example.com/model.onnx',
  size: '~XXmb',
  metadata: {
    taskType: 'classification',
    equivalenceGroup: 'image-classifiers',
    outputDimensions: [1000],
    // ...
  }
}
```

## Notes

- Models are downloaded from official Hugging Face repositories
- All models are pre-trained and production-ready
- Models are selected for small size (<100MB) for quick testing
- For larger models, consider downloading separately

## References

- [Hugging Face Models](https://huggingface.co/models)
- [ONNX Model Zoo](https://github.com/onnx/models)
- [Sentence Transformers](https://www.sbert.net/)
