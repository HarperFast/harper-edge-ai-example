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

export default schema;