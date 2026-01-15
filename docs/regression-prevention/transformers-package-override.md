# Regression Prevention: Transformers.js Package Override

## Issue Summary

**Date**: 2026-01-14
**Severity**: Critical (breaks Transformers.js backend completely)
**Root Cause**: Package override replaced onnxruntime-web with onnxruntime-common

## What Happened

Commit `67c9d6e` (Jan 12, 2026) attempted to reduce node_modules size by overriding `onnxruntime-web` with `onnxruntime-common@1.14.0` in package.json:

```json
"overrides": {
  "onnxruntime-node": "1.20.1",
  "onnxruntime-web": "npm:onnxruntime-common@1.14.0"  // ❌ BREAKS Transformers.js
}
```

**Impact**:
- Saved 66MB of disk space
- **Broke all Transformers.js inference** with error: `"Tensor.data must be a typed array for numeric tensor"`
- Went undetected because no tests existed for Transformers.js backend at the time

## Why It Broke

1. **onnxruntime-common** is a types-only package with no runtime
2. **onnxruntime-web** includes the WebAssembly ONNX runtime needed by Transformers.js
3. @xenova/transformers depends on onnxruntime-web to execute models
4. When the runtime was replaced with types-only, tensor operations failed

## The Fix

Remove the `onnxruntime-web` override from package.json:

```json
"overrides": {
  "onnxruntime-node": "1.20.1"
  // onnxruntime-web override removed - let Transformers.js use what it needs
}
```

Then run:
```bash
rm -rf node_modules package-lock.json
npm install
```

## Prevention Strategy

### 1. Add Transformers.js Backend Tests

**Critical**: The regression went undetected because tests didn't cover this backend.

Required test coverage:
- [ ] Unit tests: `tests/unit/backends/Transformers.test.js`
- [ ] Integration tests: Model load + inference with real HuggingFace model
- [ ] CI: Run tests on all backends before merging package changes

### 2. Package Override Policy

**Rule**: Never override runtime dependencies without testing ALL affected backends.

Before adding any package override:
1. Identify which backends depend on the package (`npm ls <package>`)
2. Run full test suite including integration tests
3. Test each backend that uses the package manually
4. Document the override reason in package.json comments
5. Add tests if they don't exist

### 3. Required Package Change Checklist

For ANY change to dependencies or overrides in package.json:

```markdown
- [ ] Run full test suite: `npm run test:all`
- [ ] Test ONNX backend inference
- [ ] Test TensorFlow backend inference
- [ ] Test Transformers.js backend inference
- [ ] Test Ollama backend (if running)
- [ ] Run benchmark: `npm run benchmark:all`
- [ ] Check all model types load successfully
- [ ] Document any known breaking changes
```

### 4. CI/CD Requirements

Add to `.github/workflows/test.yml`:
```yaml
- name: Test all ML backends
  run: |
    npm run test:all
    npm run benchmark -- --quick  # Quick smoke test
```

## Detection Signals

If you see these errors after a package update, suspect a runtime dependency issue:

- `"Tensor.data must be a typed array"`
- `"Cannot read property 'data' of undefined"`
- Backend loads successfully but inference fails
- Model loading works but predict() throws errors

## Related Issues

- Original ONNX tokenizer fix: commit `c5d8385` (used `cpuData` instead of `data`)
- Model Fetch System implementation: Used lightweight config approach for Transformers models
- Similar issues can occur with:
  - tensorflow/tfjs packages (tfjs-node vs tfjs-core)
  - onnxruntime-node vs onnxruntime-web version mismatches

## Verification

After fixing, verify with:

```bash
# Start Harper
npm run dev

# In another terminal, test Transformers backend
curl -X POST http://localhost:9926/InspectModel?source=huggingface&sourceReference=Xenova/all-MiniLM-L6-v2

curl -X POST http://localhost:9926/FetchModel \
  -H "Content-Type: application/json" \
  -d '{
    "source": "huggingface",
    "sourceReference": "Xenova/all-MiniLM-L6-v2",
    "modelName": "test-transformers",
    "framework": "transformers"
  }'

# Wait for job to complete, then test inference
curl -X POST http://localhost:9926/Predict \
  -H "Content-Type: application/json" \
  -d '{
    "modelName": "test-transformers",
    "inputs": {
      "text": "This is a test sentence."
    }
  }'

# Should return embeddings without "Tensor.data" error
```

## Lessons Learned

1. **Disk space optimization should never break functionality**
   - The 66MB savings wasn't worth breaking a core backend
   - Better approach: Make ML backends optional (user chooses which to install)

2. **Test coverage prevents regressions**
   - Commit claimed "all 63 tests pass" but none covered Transformers.js
   - Tests must cover ALL backends, not just the easiest ones

3. **Package overrides are dangerous**
   - npm overrides bypass dependency resolution for a reason
   - Only use when absolutely necessary (e.g., security patches)
   - Never assume "common" package is a drop-in replacement for specific runtime

4. **Documentation isn't enough**
   - Commit message explained the change but tests would have caught it
   - Automated checks > manual verification

## Action Items

- [ ] Add Transformers.js backend unit tests
- [ ] Add integration tests for all backends
- [ ] Add package change checklist to CONTRIBUTING.md
- [ ] Add CI job that tests all backends
- [ ] Consider making backends optional (Phase 2)
- [ ] Add npm script: `npm run test:backends` for quick verification
