# Deploying Harper Edge AI Ops

This guide covers deploying your Harper Edge AI Ops application to remote Harper instances using the Harper CLI.

## Prerequisites

1. **Harper CLI installed locally**
   ```bash
   npm install -g harperdb
   ```

2. **Remote Harper instance running**
   - Instance URL (e.g., `https://ai-ops.irjudson-ai.harperfabric.com:9925`)
   - Admin credentials (username and password)

3. **Environment configured**
   - Local `.env` file with your desired configuration
   - `MODEL_FETCH_TOKEN` set for API authentication

## Environment Configuration

### Set Remote Target Credentials

Configure environment variables for your remote Harper instance:

```bash
# Remote Harper instance URL
export CLI_TARGET_URL=https://ai-ops.irjudson-ai.harperfabric.com:9925

# Remote Harper admin credentials
export CLI_TARGET_USERNAME=HDB_ADMIN
export CLI_TARGET_PASSWORD=your-admin-password
```

**Alternative:** Pass credentials directly in commands:
```bash
harperdb deploy \
  target=https://ai-ops.irjudson-ai.harperfabric.com:9925 \
  username=HDB_ADMIN \
  password=your-admin-password
```

**Recommended:** Use local `.env` file for deploy.sh script:

```bash
# Add to your local .env file (will be loaded by deploy.sh)
DEPLOY_REMOTE_HOST=ai-ops.irjudson-ai.harperfabric.com
DEPLOY_REMOTE_PORT=9925
DEPLOY_REMOTE_URL=https://ai-ops.irjudson-ai.harperfabric.com:9925
DEPLOY_USERNAME=HDB_ADMIN
DEPLOY_PASSWORD=your-admin-password
DEPLOY_REPLICATED=true        # Replicate across cluster nodes (default: true)
DEPLOY_RESTART=true            # Restart after deploy (default: true, options: true/false/rolling)
MODEL_FETCH_TOKEN=your-secret-token
```

**Deploy Options:**
- `DEPLOY_REPLICATED=true` - Replicates deployment across all cluster nodes
- `DEPLOY_RESTART=true` - Automatically restarts Harper after deployment
  - `true` - Standard restart
  - `false` - No restart (manual restart required)
  - `rolling` - Rolling restart (minimal downtime for clusters)

**Configuration priority:**
1. Environment variables (`CLI_TARGET_*`, `DEPLOY_*`)
2. `.env` file
3. Script defaults

### Configure Remote .env File

Before deploying, ensure your remote instance has the proper environment configuration. Create/edit `.env` on your remote Harper instance with:

```bash
# Model Fetch System Configuration
MODEL_FETCH_TOKEN=your-secret-token-here
MODEL_FETCH_WORKER_ENABLED=true
MODEL_FETCH_MAX_CONCURRENT=3
MODEL_FETCH_POLL_INTERVAL=5000
MODEL_FETCH_MAX_FILE_SIZE=5368709120
MODEL_FETCH_MAX_RETRIES=3
MODEL_FETCH_INITIAL_RETRY_DELAY=5000

# Ollama Configuration (if using Ollama backend)
OLLAMA_HOST=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama2

# Inference Engine
MODEL_CACHE_SIZE=10

# Debug (optional)
DEBUG=false
```

**Generate a secure token:**
```bash
# On macOS/Linux:
openssl rand -base64 32

# Or use Node.js:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Deployment Workflow

### Single Command Deployment (Recommended)

The `deploy.sh` script handles deployment, replication, and restart in a single command:

```bash
# Full deployment with restart and replication
./deploy.sh --full
```

By default (configured via `.env`):
- Automatically restarts Harper after deployment (`DEPLOY_RESTART=true`)
- Replicates across all cluster nodes (`DEPLOY_REPLICATED=true`)

**Customize deployment behavior in `.env`:**

```bash
# Standard restart after deploy
DEPLOY_RESTART=true

# Rolling restart (minimal downtime)
DEPLOY_RESTART=rolling

# No automatic restart (manual restart required)
DEPLOY_RESTART=false

# Disable replication (single node only)
DEPLOY_REPLICATED=false
```

### Manual Harper CLI Deployment

You can also use the Harper CLI directly with combined options:

```bash
# Deploy with automatic restart and replication
harperdb deploy \
  target=$CLI_TARGET_URL \
  replicated=true \
  restart=true

# Rolling restart for zero-downtime deployment
harperdb deploy \
  target=$CLI_TARGET_URL \
  replicated=true \
  restart=rolling
```

This single command will:
- Package your component code
- Upload to the remote instance
- Install dependencies
- Replicate across all cluster nodes
- Restart Harper automatically

### Verify Deployment

Check the remote instance status:

```bash
# Check Harper status
harperdb status target=$CLI_TARGET_URL

# View Harper logs (if available)
harperdb logs target=$CLI_TARGET_URL
```

## Testing the Deployment

Once deployed, test the Model Fetch System from your local machine:

### Set Up Local Environment

```bash
export HARPER_URL=https://ai-ops.irjudson-ai.harperfabric.com:9925
export MODEL_FETCH_TOKEN=your-secret-token
```

### Test 1: Inspect a Model

```bash
harper-ai model inspect huggingface Xenova/all-MiniLM-L6-v2 --variant quantized
```

Expected output:
- Framework: transformers
- Available variants: default, quantized
- Inferred metadata from HuggingFace

### Test 2: Fetch a Model

```bash
harper-ai model fetch huggingface Xenova/all-MiniLM-L6-v2 \
  --variant quantized \
  --modelName all-MiniLM-L6-v2 \
  --modelVersion v1
```

Expected output:
- Job created with jobId
- Status: queued

### Test 3: Watch Job Progress

```bash
harper-ai job watch <jobId>
```

Expected output:
- Live progress bar
- Status updates: queued → downloading → processing → completed
- Final resultModelId

### Test 4: List Downloaded Models

```bash
harper-ai model list
```

Expected output:
- Table showing all models including the newly fetched one

### Test 5: Run Inference

```bash
harper-ai model test all-MiniLM-L6-v2:v1 --input "Hello world"
```

Expected output:
- Embedding vector or model-specific output
- Inference latency

## Complete Deployment Script

Create a simple deployment script for convenience:

**deploy-remote.sh:**
```bash
#!/usr/bin/env bash
set -e

# Configuration
REMOTE_URL="${CLI_TARGET_URL:-https://ai-ops.irjudson-ai.harperfabric.com:9925}"

echo "Deploying to ${REMOTE_URL}..."

# Deploy code
echo "📦 Deploying code..."
harperdb deploy target="${REMOTE_URL}"

# Restart Harper
echo "🔄 Restarting Harper..."
harperdb restart target="${REMOTE_URL}"

# Wait for restart
echo "⏳ Waiting for Harper to restart..."
sleep 5

# Check status
echo "✅ Checking status..."
harperdb status target="${REMOTE_URL}"

echo ""
echo "Deployment complete!"
echo ""
echo "Test with:"
echo "  export HARPER_URL=${REMOTE_URL}"
echo "  export MODEL_FETCH_TOKEN=your-token"
echo "  harper-ai model list"
```

Make it executable:
```bash
chmod +x deploy-remote.sh
```

Run it:
```bash
./deploy-remote.sh
```

## Troubleshooting

### Authentication Errors

**Problem:** "Unauthorized" or connection refused

**Solution:**
- Verify CLI_TARGET_USERNAME and CLI_TARGET_PASSWORD are correct
- Check that remote Harper instance is running
- Verify firewall allows connections to port 9925
- Ensure HTTPS certificate is valid (or use `--insecure` flag for self-signed certs)

### Deployment Fails

**Problem:** Deployment command fails or times out

**Solution:**
- Check network connectivity to remote instance
- Verify you have admin permissions on remote Harper
- Check remote disk space is available
- Review remote Harper logs for errors

### Worker Not Starting

**Problem:** ModelFetchWorker doesn't process jobs

**Solution:**
- Verify `MODEL_FETCH_WORKER_ENABLED=true` in remote `.env`
- Check remote Harper logs for worker startup messages:
  ```bash
  harperdb logs target=$CLI_TARGET_URL | grep ModelFetchWorker
  ```
- Ensure database tables were created (check schema.graphql deployed)
- Restart Harper instance

### Model Fetch Fails

**Problem:** Jobs stay in "queued" or fail immediately

**Solution:**
- Check remote server has internet access (for HuggingFace downloads)
- Verify disk space available in models directory
- Check `MODEL_FETCH_MAX_FILE_SIZE` is sufficient
- Review job error in `harper-ai job get <jobId>`

### CLI Commands Return Errors

**Problem:** `harper-ai` commands fail with authentication errors

**Solution:**
- Verify `MODEL_FETCH_TOKEN` matches on client and remote server
- Check token is set in remote `.env` file
- Ensure no extra whitespace in token
- Try using Bearer format explicitly: `Authorization: Bearer your-token`

## Advanced: Clustered Deployments

For Harper clusters with multiple nodes:

```bash
# Deploy to cluster (replicates to all nodes)
harperdb deploy target=$CLI_TARGET_URL replicated=true

# Restart cluster
harperdb restart target=$CLI_TARGET_URL replicated=true

# Check cluster status
harperdb cluster_status target=$CLI_TARGET_URL
```

## Rollback

If a deployment causes issues, redeploy a previous version:

```bash
# Checkout previous version
git checkout <previous-commit-hash>

# Deploy
harperdb deploy target=$CLI_TARGET_URL

# Restart
harperdb restart target=$CLI_TARGET_URL

# Return to current branch
git checkout main
```

## Monitoring

Monitor your remote Harper instance:

```bash
# View recent logs
harperdb logs target=$CLI_TARGET_URL

# Check resource usage
harperdb system_information target=$CLI_TARGET_URL

# View active jobs
export HARPER_URL=$CLI_TARGET_URL
export MODEL_FETCH_TOKEN=your-token
harper-ai job list --status downloading
```

## Security Best Practices

1. **Never commit credentials**
   - Use environment variables
   - Add `.env` to `.gitignore`
   - Use secret management tools for production

2. **Use strong tokens**
   - Generate cryptographically secure tokens
   - Rotate tokens regularly
   - Use different tokens for dev/staging/production

3. **Secure network access**
   - Use HTTPS for remote instances
   - Restrict firewall rules to known IPs
   - Consider VPN for production deployments

4. **Monitor access logs**
   - Review Harper access logs regularly
   - Set up alerts for unauthorized access attempts
   - Track model fetch activity

## Next Steps

- Set up CI/CD pipeline for automated deployments
- Configure monitoring and alerting
- Set up log aggregation
- Implement backup strategy for models and database
- Load test the Model Fetch System with concurrent jobs
