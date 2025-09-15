/**
 * Harper GraphQL Schema Export
 * GraphQL schema definitions for Harper Edge AI personalization
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Export the GraphQL schema as a string
export const schema = readFileSync(join(__dirname, 'schema.graphql'), 'utf-8');

// For backward compatibility, also export individual schema objects
// These are now derived from the GraphQL schema but maintain the old API
export { default as userProfilesSchema } from './user-profiles.schema.js';
export { default as metricsSchema } from './metrics.schema.js';
export { default as sessionsSchema } from './sessions.schema.js';
export { default as statisticsSchema } from './statistics.schema.js';
export { default as userFeedbackSchema } from './user-feedback.schema.js';
export { default as performanceMetricsSchema } from './performance-metrics.schema.js';
export { default as retrainingJobsSchema } from './retraining-jobs.schema.js';
export { default as tenantsSchema } from './tenants.schema.js';

export default schema;