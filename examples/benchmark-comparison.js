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
    console.log('(Models should be preloaded using: node scripts/preload-models.js)\n');

    const metadata = {
      taskType: 'text-embedding',
      equivalenceGroup: 'product-recommender',
      outputDimensions: [512],
      description: 'Product recommendation embeddings',
      useCase: 'E-commerce product search and recommendations',
    };

    // In real usage, models should be preloaded:
    // node scripts/preload-models.js
    //
    // Or manually upload:
    // await uploadModel('use-onnx', 'v1', 'onnx', './models/use.onnx', metadata);
    // await uploadModel('use-tfjs', 'v1', 'tensorflowjs', './models/use-tfjs.zip', metadata);

    // Example 2: Run benchmark with realistic product data
    console.log('\nStep 2: Run Benchmark Comparison with Product Data');

    // Realistic product descriptions for embedding
    const testData = [
      { prompt: 'trail running shoes lightweight breathable mesh upper cushioned sole' },
      { prompt: 'waterproof hiking boots winter insulated ankle support grip traction' },
      { prompt: 'camping tent 4 person family double wall weatherproof easy setup' },
      { prompt: 'sleeping bag 20 degree down fill mummy style compression sack' },
      { prompt: 'portable camping stove propane fuel compact design windscreen' },
      { prompt: 'backpacking water filter gravity system safe drinking purification' },
      { prompt: 'LED camping lantern rechargeable battery bright adjustable portable' },
      { prompt: 'camping hammock lightweight nylon tree straps included bug net' },
      { prompt: 'trekking poles adjustable aluminum lightweight collapsible cork grips' },
      { prompt: 'camping cookware set non-stick pots pans utensils compact storage' },
      { prompt: 'insulated water bottle stainless steel keeps cold hot leak proof' },
      { prompt: 'camping chair folding portable lightweight cup holder armrests' },
      { prompt: 'hiking backpack 65L internal frame hydration compatible rain cover' },
      { prompt: 'headlamp LED rechargeable waterproof adjustable brightness camping' },
      { prompt: 'multi-tool camping knife pliers screwdriver bottle opener compact' },
    ];

    const benchmarkResult = await runBenchmark(
      'text-embedding',
      'product-recommender',
      testData,
      100 // iterations
    );

    // Example 3: Analyze results
    console.log('\nStep 3: Analyze Results');
    const winner = analyzeResults(benchmarkResult);

    // Example 4: Use winning model for real product recommendations
    console.log('\nStep 4: Use Winning Model for Product Recommendations');

    // Realistic e-commerce product catalog
    const products = [
      {
        id: 'prod-001',
        name: 'Alpine Trail Runner Pro',
        description: 'Lightweight trail running shoes with breathable mesh and cushioned sole for long-distance comfort',
        category: 'Footwear',
        price: 129.99,
        tags: ['trail-running', 'lightweight', 'breathable'],
      },
      {
        id: 'prod-002',
        name: 'Summit Peak Hiking Boots',
        description: 'Waterproof insulated hiking boots with superior ankle support and grip for winter conditions',
        category: 'Footwear',
        price: 189.99,
        tags: ['hiking', 'winter', 'waterproof'],
      },
      {
        id: 'prod-003',
        name: 'Family Base Camp Tent',
        description: 'Spacious 4-person camping tent with double-wall construction and weatherproof design',
        category: 'Shelter',
        price: 299.99,
        tags: ['camping', 'family', 'weatherproof'],
      },
      {
        id: 'prod-004',
        name: 'Arctic Sleep Bag 20°F',
        description: 'Premium down-filled mummy sleeping bag rated for 20-degree weather with compression sack',
        category: 'Sleep Systems',
        price: 249.99,
        tags: ['sleeping-bag', 'down', 'cold-weather'],
      },
      {
        id: 'prod-005',
        name: 'TrekLite Backpacking Stove',
        description: 'Ultra-compact propane camping stove with windscreen, perfect for backpacking trips',
        category: 'Cooking',
        price: 49.99,
        tags: ['camping', 'stove', 'compact'],
      },
      {
        id: 'prod-006',
        name: 'PureFlow Gravity Filter',
        description: 'Reliable gravity-fed water filtration system for safe drinking water in the backcountry',
        category: 'Water Treatment',
        price: 89.99,
        tags: ['water-filter', 'backpacking', 'safety'],
      },
      {
        id: 'prod-007',
        name: 'LuminaCharge Camp Lantern',
        description: 'Rechargeable LED camping lantern with adjustable brightness and USB charging port',
        category: 'Lighting',
        price: 39.99,
        tags: ['lantern', 'LED', 'rechargeable'],
      },
      {
        id: 'prod-008',
        name: 'CloudRest Camping Hammock',
        description: 'Lightweight nylon camping hammock with integrated bug net and tree-friendly straps',
        category: 'Shelter',
        price: 79.99,
        tags: ['hammock', 'lightweight', 'camping'],
      },
    ];

    // User context for personalization
    const userContext = {
      searchQuery: 'looking for camping gear for weekend trip',
      recentViews: ['camping-tent', 'sleeping-bag', 'camp-stove'],
      activityType: 'camping',
      experienceLevel: 'intermediate',
      season: 'autumn',
      location: 'mountains',
      budget: 'mid-range',
      preferences: {
        brands: ['alpine', 'summit'],
        features: ['lightweight', 'weatherproof', 'durable'],
      },
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
      'product-recommender'
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
    console.log('\nNext steps:');
    console.log('  • Preload models: node scripts/preload-models.js');
    console.log('  • Run interactive benchmark: node scripts/run-benchmark.js');
    console.log('  • View results: Query BenchmarkResult table in Harper');
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('  • Ensure Harper is running: npm run dev');
    console.error('  • Preload models first: node scripts/preload-models.js');
    console.error('  • Check model metadata matches task type and equivalence group');
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { uploadModel, runBenchmark, analyzeResults, useWinningModel, getBenchmarkHistory };
