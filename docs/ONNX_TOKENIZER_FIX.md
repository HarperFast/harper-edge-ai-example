# ONNX Tokenizer Data Access - CRITICAL FIX

## ⚠️ DO NOT REGRESS - This has broken multiple times

## Problem
When using Transformers.js AutoTokenizer with ONNX models, attempting to access tokenizer output via `tensor.data` fails because **the data is stored in `tensor.cpuData`**, not `tensor.data`.

## Symptoms
- Error: `Cannot read properties of undefined (reading 'length')`
- ONNX prediction tests fail for models like `all-MiniLM-L6-v2`
- Tokenization succeeds but data extraction fails

## Root Cause
```javascript
// ❌ WRONG - tensor.data is undefined
const data = encoded.input_ids.data;

// ✅ CORRECT - data is in cpuData property
const data = encoded.input_ids.cpuData;
```

## Solution Location
**File**: `src/core/backends/Onnx.js`
**Function**: `getTokenizerData()` inside `predict()` method
**Line**: ~183

```javascript
// Transformers.js Tensor objects have cpuData property
if (tensor.cpuData) {
    return Array.from(tensor.cpuData);  // cpuData contains BigInt values
}
```

## Important Notes
1. `cpuData` contains BigInt array values (e.g., `[101n, 3231n, 6251n, 102n]`)
2. The `convertToBigInt64Array()` function handles both BigInt and number types
3. This is NOT a version-specific issue - it's how Transformers.js Tensor objects work
4. The `.data` property exists on the object but is `undefined`

## Test Coverage
- **Test File**: `tests/integration/predict.test.js`
- **Test Case**: "should successfully predict with ONNX model"
- **Model**: `all-MiniLM-L6-v2:v1`
- **Input**: `{texts: ['test sentence']}`

## How to Verify Fix
```bash
npm run test:integration -- tests/integration/predict.test.js
```

Should show: `✔ should successfully predict with ONNX model`

## Regression Prevention
1. DO NOT change `tensor.cpuData` to `tensor.data`
2. DO NOT remove the cpuData check from `getTokenizerData()`
3. Always run integration tests before merging ONNX backend changes
4. If tokenizer tests fail, check this document first

## Related Files
- `src/core/backends/Onnx.js` - Main fix location
- `tests/integration/predict.test.js` - Test coverage
- `tests/integration/e2e-onnx-flow.test.js` - Additional ONNX tests

## Commit Reference
- Commit: `fix: ONNX tokenizer data access using cpuData property`
- All 35 integration tests pass with this fix
