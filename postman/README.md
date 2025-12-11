# Harper Edge AI - Postman Collection

This collection provides examples for testing the Harper Edge AI MLOps REST API.

## Setup

1. Import `Harper-Edge-AI-MLOps.postman_collection.json` into Postman
2. Ensure Harper is running: `npm run dev`
3. Update `baseUrl` variable if needed (default: `http://localhost:9926`)

## Usage

### Model Management

1. **Upload Model** - Upload an ONNX or TensorFlow model
   - Update the `file` field with path to your ONNX model
   - Modify `inputSchema` and `outputSchema` to match your model

2. **Get Model Info** - Retrieve model metadata

3. **List Model Versions** - Get all versions of a model

### Inference

1. **Predict** - Run inference with uploaded model
   - Update `features` to match your model's input schema
   - Save the `inferenceId` from response for feedback

2. **Personalize Products** - Test existing TensorFlow.js endpoint

### Observability

1. **Record Feedback** - Add ground truth for an inference
   - Use `inferenceId` from Predict response
   - Set `correct: true/false` or provide `outcome`

2. **Get Inference Events** - Query recent inference events

3. **Get Model Metrics** - View aggregate metrics (latency, confidence, accuracy)

## Example Workflow

1. Upload a model via **Upload Model**
2. Run inference via **Predict** (save the `inferenceId`)
3. Check metrics via **Get Model Metrics**
4. When you learn the actual outcome, use **Record Feedback**
5. View updated metrics including accuracy

## Notes

- Model files must be ONNX format for ONNX Runtime backend
- TensorFlow.js models not yet supported via upload (use existing PersonalizationEngine)
- Feedback loop enables accuracy tracking over time
