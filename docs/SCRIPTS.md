# Harper Edge AI - Script Reference

Four focused scripts for deployment, verification, benchmarking, and demonstration.

## Overview

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `deploy.sh` | Deploy code to Harper instance | Deploying new code or configuration |
| `verify.sh` | Verify deployed system | After deployment, in CI/CD, troubleshooting |
| `benchmark.sh` | Run performance benchmarks | Comparing backends, performance analysis |
| `demo.sh` | Interactive demonstrations | Showing features, learning the system |

**All scripts use `.env` configuration** - no hardcoded URLs or credentials.

## deploy.sh

Deploy code to local or remote Harper instances.

### Usage

```bash
# Full deployment (deploy + replicate + restart + verify)
./deploy.sh

# Deploy without restarting
./deploy.sh --no-restart

# Deploy without tests
./deploy.sh --no-tests

# Deploy to local instance (development)
./deploy.sh --local

# Preview what would be deployed
./deploy.sh --dry-run

# Check deployment status
./deploy.sh --status
```

### Configuration (.env)

```bash
# Remote instance
DEPLOY_REMOTE_HOST=ai-ops.example.com
DEPLOY_REMOTE_PORT=9925
DEPLOY_REMOTE_URL=https://ai-ops.example.com:9925
DEPLOY_USERNAME=HDB_ADMIN
DEPLOY_PASSWORD=your-password

# Deployment options
DEPLOY_REPLICATED=true           # Replicate across cluster
DEPLOY_RESTART=true              # Restart after deploy
DEPLOY_BACKENDS=onnx,transformers  # Auto-select backends (skip interactive)

# Authentication
MODEL_FETCH_TOKEN=your-token
```

### Features

- **Backend selection**: Choose which ML backends to deploy (ONNX, TensorFlow, Transformers.js)
- **Size optimization**: Automatically skips node_modules if deployment >800MB
- **Cluster replication**: Deploys across all nodes in cluster
- **Verification**: Runs basic health checks after deployment
- **Dry-run mode**: Preview deployment without executing

## verify.sh

Verify a deployed running system (integration/smoke testing).

### Usage

```bash
# Verify local instance
./verify.sh

# Quick smoke test
./verify.sh --quick

# Full verification (includes inference tests)
./verify.sh --full

# Verify remote instance
./verify.sh --remote

# Verify with specific profile
./verify.sh --profile testing --full
```

### Configuration (.env)

```bash
# Local instance (default)
HARPER_URL=http://localhost:9926

# Remote instance
DEPLOY_REMOTE_URL=https://your-instance.com:9926
DEPLOY_USERNAME=HDB_ADMIN
DEPLOY_PASSWORD=your-password
MODEL_FETCH_TOKEN=your-token

# Backend availability
OLLAMA_HOST=http://localhost:11434

# Test configuration
TEST_PROFILE=testing  # Which profile to test
```

### Verification Levels

**Quick** (`--quick`):
- Health check
- API endpoint accessibility
- ~5 seconds

**Standard** (default):
- Health check
- API endpoints
- Deployed models check
- Backend availability
- ~15 seconds

**Full** (`--full`):
- All standard checks
- Inference tests
- Profile-based integration tests
- ~60 seconds

### CI/CD Integration

```bash
# In GitHub Actions
- name: Verify deployment
  run: ./verify.sh --remote --full
  env:
    DEPLOY_REMOTE_URL: ${{ secrets.HARPER_URL }}
    DEPLOY_USERNAME: ${{ secrets.HARPER_USER }}
    DEPLOY_PASSWORD: ${{ secrets.HARPER_PASSWORD }}
```

## benchmark.sh

Run performance benchmarks on deployed models.

### Usage

```bash
# Run all benchmarks
./benchmark.sh

# Benchmark specific equivalence group
./benchmark.sh --group embeddings-384

# Custom iteration count
./benchmark.sh --iterations 1000

# Deploy benchmarking profile and run benchmarks
./benchmark.sh --deploy

# Benchmark remote instance
./benchmark.sh --remote --iterations 500
```

### Configuration (.env)

```bash
# Target instance
HARPER_URL=http://localhost:9926                           # Local
DEPLOY_REMOTE_URL=https://your-instance.com:9926          # Remote

# Benchmark settings
BENCHMARK_ITERATIONS=100        # Default iteration count
BENCHMARK_GROUP=embeddings-384  # Specific group to benchmark
BENCHMARK_PROFILE=benchmarking  # Profile to use

# Backend availability
OLLAMA_HOST=http://localhost:11434
```

### Equivalence Groups

Benchmarks compare models in the same equivalence group:

- **embeddings-384**: ONNX vs Transformers.js (all-MiniLM-L6-v2)
- **embeddings-768**: Ollama vs Transformers.js (nomic-embed-text)

Deploy benchmarking profile first:

```bash
npm run preload:benchmarking
./benchmark.sh
```

### Output

Results saved to `benchmark-*.json` with metrics:
- Average latency
- P50, P95, P99 latencies
- Min/max latency
- Error rates
- Winner determination

## demo.sh

Run interactive demonstrations of model inference.

### Usage

```bash
# Run all demos locally
./demo.sh

# Demo remote instance
./demo.sh --remote

# Use specific profile
./demo.sh --profile minimal
```

### Configuration (.env)

```bash
# Local instance (default)
HARPER_URL=http://localhost:9926

# Remote instance
DEPLOY_REMOTE_URL=https://your-instance.com:9926

# Demo settings
DEMO_PROFILE=development  # Profile to use for demo
```

### Demo Sequence

1. **Health Check**: Verify server is running
2. **Model Inventory**: List deployed models
3. **Text Embedding**: Run inference on available model
4. **Transformers.js**: Demo Transformers.js backend if available
5. **Metrics**: Show model inference metrics

## Common Workflows

### Local Development

```bash
# 1. Start Harper
npm run dev

# 2. Deploy testing models
npm run preload:testing

# 3. Verify everything works
./verify.sh --full

# 4. Run demo
./demo.sh
```

### Remote Deployment

```bash
# 1. Deploy code
./deploy.sh

# 2. Verify deployment
./verify.sh --remote --full

# 3. Run remote demo
./demo.sh --remote
```

### Performance Analysis

```bash
# 1. Deploy benchmarking models
npm run preload:benchmarking

# 2. Run benchmarks
./benchmark.sh --iterations 1000

# 3. Compare results
cat benchmark-*.json | jq '.winner'
```

### CI/CD Pipeline

```bash
# 1. Deploy
./deploy.sh --no-tests

# 2. Verify
./verify.sh --remote --full

# 3. Quick benchmark
./benchmark.sh --remote --iterations 50
```

## Environment Variables Reference

### Required

- `DEPLOY_PASSWORD` or `CLI_TARGET_PASSWORD`: Harper admin password

### Optional

| Variable | Default | Purpose |
|----------|---------|---------|
| `HARPER_URL` | `http://localhost:9926` | Local Harper URL |
| `DEPLOY_REMOTE_URL` | - | Remote Harper URL |
| `DEPLOY_USERNAME` | `HDB_ADMIN` | Harper admin username |
| `CLI_TARGET_USERNAME` | `$DEPLOY_USERNAME` | Override username |
| `CLI_TARGET_PASSWORD` | `$DEPLOY_PASSWORD` | Override password |
| `MODEL_FETCH_TOKEN` | - | Token for model fetch API |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama service URL |
| `TEST_PROFILE` | `testing` | Profile for verification |
| `BENCHMARK_PROFILE` | `benchmarking` | Profile for benchmarks |
| `BENCHMARK_ITERATIONS` | `100` | Benchmark iterations |
| `DEMO_PROFILE` | `development` | Profile for demos |

## Troubleshooting

### "Cannot connect to Harper"

**verify.sh fails with connection error**

```bash
# Check if Harper is running
curl http://localhost:9926/Status

# Or for remote
curl https://your-instance.com:9926/Status
```

### "No models deployed"

**demo.sh or verify.sh finds no models**

```bash
# Deploy models
npm run preload:testing

# Or specific profile
npm run preload:benchmarking
```

### "Deployment size exceeds 800MB"

**deploy.sh warns about size**

```bash
# Option 1: Select fewer backends (automatic prompt)
./deploy.sh

# Option 2: Set backends in .env
DEPLOY_BACKENDS=transformers  # Lightest (45 MB)
./deploy.sh

# Option 3: Deploy without node_modules (automatic if >800MB)
# Remote instance will run npm install after deployment
```

### "Ollama not available"

**verify.sh or benchmark.sh warns about Ollama**

```bash
# Start Ollama service
ollama serve

# Or set OLLAMA_HOST in .env to remote Ollama instance
OLLAMA_HOST=http://remote-ollama:11434
```

## Best Practices

1. **Always use .env**: Never hardcode credentials or URLs in scripts
2. **Verify after deploy**: Always run `./verify.sh --remote --full` after deployment
3. **Benchmark before production**: Use `./benchmark.sh` to choose best backend
4. **Demo for stakeholders**: Use `./demo.sh` to showcase capabilities
5. **Check script help**: All scripts have `--help` for detailed options
6. **Use profiles**: Leverage model profiles for consistent deployments

## Script Dependencies

All scripts require:
- `bash` 4.0+
- `curl`
- `jq` (for JSON parsing)
- Node.js 18+ (for Harper and npm scripts)

verify.sh additionally requires:
- Node.js test runner (built-in)
- Test files in `tests/integration/`

## Next Steps

- Configure `.env` file for your environment
- Run `./verify.sh --quick` to check local setup
- Deploy to remote with `./deploy.sh`
- See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment details
- See [PROFILE_TESTING.md](./PROFILE_TESTING.md) for testing details
