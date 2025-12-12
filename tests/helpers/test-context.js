import { BenchmarkEngine } from '../../src/core/BenchmarkEngine.js';
import { InferenceEngine } from '../../src/core/InferenceEngine.js';
import { cleanupBenchmarkResults, cleanupTestModels } from './benchmark-helpers.js';

export function createBenchmarkTestContext(options = {}) {
  const context = {
    cleanupIds: [],
    cleanupModelKeys: [],
    engine: null,
    inferenceEngine: null
  };

  return {
    async setup() {
      context.inferenceEngine = options.inferenceEngine || new InferenceEngine();
      await context.inferenceEngine.initialize();
      context.engine = new BenchmarkEngine(context.inferenceEngine);
    },

    async teardown() {
      await Promise.all([
        cleanupBenchmarkResults(context.cleanupIds),
        cleanupTestModels(context.cleanupModelKeys)
      ]);
      if (context.inferenceEngine) {
        await context.inferenceEngine.cleanup();
      }
    },

    get engine() { return context.engine; },
    get inferenceEngine() { return context.inferenceEngine; },

    trackModel(...models) {
      models.forEach(m => context.cleanupModelKeys.push(m.id || m));
    },

    trackResult(id) {
      context.cleanupIds.push(id);
    }
  };
}
