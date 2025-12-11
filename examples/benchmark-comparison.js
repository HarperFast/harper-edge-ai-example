/**
 * Benchmark Comparison Example
 *
 * This script demonstrates how to:
 * 1. Upload equivalent models with metadata
 * 2. Run benchmark comparison
 * 3. Analyze results and select winner
 * 4. Use winning model for predictions
 *
 * Usage:
 *   node examples/benchmark-comparison.js
 */

const BASE_URL = 'http://localhost:9926';

/**
 * Upload a model with metadata
 */
async function uploadModel(modelId, version, framework, filePath, metadata) {
  const formData = new FormData();
  formData.append('modelId', modelId);
  formData.append('version', version);
  formData.append('framework', framework);
  formData.append('metadata', JSON.stringify(metadata));

  // Note: In real usage, add file: formData.append('file', fs.createReadStream(filePath))

  console.log(`Uploading ${modelId}:${version} (${framework})...`);

  const response = await fetch(`${BASE_URL}/model/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  console.log(`✓ ${modelId}:${version} uploaded`);
}

/**
 * Run benchmark comparison
 */
async function runBenchmark(taskType, equivalenceGroup, testData, iterations = 100) {
  console.log(`\nRunning benchmark for ${equivalenceGroup}...`);

  const response = await fetch(`${BASE_URL}/benchmark/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taskType,
      equivalenceGroup,
      testData,
      iterations,
      runBy: 'example-script',
      notes: 'Comparing model implementations',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Benchmark failed: ${error.error}`);
  }

  return await response.json();
}

/**
 * Analyze benchmark results
 */
function analyzeResults(result) {
  console.log('\n=== Benchmark Results ===\n');

  console.log(`Comparison ID: ${result.comparisonId}`);
  console.log(`Task Type: ${result.taskType}`);
  console.log(`Equivalence Group: ${result.equivalenceGroup}`);
  console.log(`Models Compared: ${result.modelIds.length}`);

  console.log('\n--- Per-Model Metrics ---\n');

  for (const [modelId, metrics] of Object.entries(result.results)) {
    console.log(`${modelId}:`);
    console.log(`  Average Latency: ${metrics.avgLatency.toFixed(2)}ms`);
    console.log(`  P50 Latency: ${metrics.p50Latency.toFixed(2)}ms`);
    console.log(`  P95 Latency: ${metrics.p95Latency.toFixed(2)}ms`);
    console.log(`  P99 Latency: ${metrics.p99Latency.toFixed(2)}ms`);
    console.log(`  Min Latency: ${metrics.minLatency.toFixed(2)}ms`);
    console.log(`  Max Latency: ${metrics.maxLatency.toFixed(2)}ms`);
    console.log(`  Error Rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
    console.log(`  Success: ${metrics.successCount} / ${metrics.successCount + metrics.errorCount}`);
    console.log('');
  }

  console.log('--- Winner ---\n');
  console.log(`Model: ${result.winner.modelId}`);
  console.log(`Framework: ${result.winner.framework}`);
  console.log(`Average Latency: ${result.winner.avgLatency.toFixed(2)}ms`);

  // Calculate speedup
  const latencies = Object.values(result.results).map((m) => m.avgLatency);
  const slowest = Math.max(...latencies);
  const speedup = ((slowest / result.winner.avgLatency - 1) * 100).toFixed(1);

  console.log(`Speedup: ${speedup}% faster than slowest`);

  return result.winner;
}

/**
 * Use winning model for personalization
 */
async function useWinningModel(winner, products, userContext) {
  console.log(`\n=== Using Winning Model ===\n`);

  const [modelId, version] = winner.modelId.split(':');

  const response = await fetch(
    `${BASE_URL}/personalize?modelId=${modelId}&version=${version}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products, userContext }),
    }
  );

  if (!response.ok) {
    throw new Error(`Personalization failed: ${response.statusText}`);
  }

  const result = await response.json();

  console.log(`Request ID: ${result.requestId}`);
  console.log(`Model: ${result.model}`);
  console.log(`Mode: ${result.mode}`);
  console.log(`Response Time: ${result.responseTime}ms`);

  console.log('\n--- Personalized Products ---\n');

  result.products.forEach((product, idx) => {
    console.log(
      `${idx + 1}. ${product.name} (score: ${product.personalizedScore.toFixed(3)})`
    );
  });

  return result;
}

/**
 * Query benchmark history
 */
async function getBenchmarkHistory(taskType, equivalenceGroup) {
  const params = new URLSearchParams();
  if (taskType) params.append('taskType', taskType);
  if (equivalenceGroup) params.append('equivalenceGroup', equivalenceGroup);

  const response = await fetch(`${BASE_URL}/benchmark/history?${params}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch history: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('=== Benchmark Comparison Example ===\n');

    // Example 1: Upload models (simulated)
    console.log('Step 1: Upload Models');
    console.log('(Simulated - in real usage, provide model files)\n');

    const metadata = {
      taskType: 'text-embedding',
      equivalenceGroup: 'universal-sentence-encoder',
      outputDimensions: [512],
      tags: ['nlp', 'semantic-similarity'],
    };

    // In real usage:
    // await uploadModel('use-onnx', 'v1', 'onnx', './models/use.onnx', metadata);
    // await uploadModel('use-tfjs', 'v1', 'tensorflowjs', './models/use-tfjs.zip', metadata);

    // Example 2: Run benchmark
    console.log('\nStep 2: Run Benchmark Comparison');

    const testData = [
      { texts: ['Hello world'] },
      { texts: ['Machine learning is amazing'] },
      { texts: ['Benchmarking models for production'] },
      { texts: ['Semantic search with embeddings'] },
      { texts: ['Natural language processing'] },
    ];

    const benchmarkResult = await runBenchmark(
      'text-embedding',
      'universal-sentence-encoder',
      testData,
      100 // iterations
    );

    // Example 3: Analyze results
    console.log('\nStep 3: Analyze Results');
    const winner = analyzeResults(benchmarkResult);

    // Example 4: Use winning model
    console.log('\nStep 4: Use Winning Model for Personalization');

    const products = [
      {
        name: 'Waterproof Tent',
        description: 'Durable 4-person camping tent',
        category: 'Shelter',
      },
      {
        name: 'Hiking Backpack',
        description: '50L backpack with rain cover',
        category: 'Gear',
      },
      {
        name: 'Sleeping Bag',
        description: 'Insulated sleeping bag for cold weather',
        category: 'Sleep',
      },
      {
        name: 'Camp Stove',
        description: 'Portable camping stove with fuel',
        category: 'Cooking',
      },
    ];

    const userContext = {
      activityType: 'camping',
      experienceLevel: 'intermediate',
      season: 'autumn',
      location: 'mountains',
    };

    const personalizationResult = await useWinningModel(
      winner,
      products,
      userContext
    );

    // Example 5: Query history
    console.log('\n\nStep 5: Query Benchmark History');
    const history = await getBenchmarkHistory(
      'text-embedding',
      'universal-sentence-encoder'
    );

    console.log(`\nFound ${history.count} historical benchmarks`);

    if (history.results.length > 0) {
      console.log('\nRecent benchmarks:');
      history.results.slice(0, 3).forEach((r, idx) => {
        const date = new Date(r.timestamp).toISOString();
        console.log(
          `  ${idx + 1}. ${r.id} - ${date} (${r.iterations} iterations)`
        );
      });
    }

    console.log('\n✓ Example completed successfully!');
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { uploadModel, runBenchmark, analyzeResults, useWinningModel, getBenchmarkHistory };
