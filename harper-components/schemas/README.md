# Harper Edge AI GraphQL Schema

This directory contains the GraphQL schema definitions for the Harper Edge AI personalization system, following Harper's recommended schema definition approach.

## Schema Structure

### Main Schema File
- `schema.graphql` - Complete GraphQL schema with all table definitions and relationships

### Legacy Schema Files (Maintained for Backward Compatibility)
The individual `.schema.js` files are maintained for backward compatibility with existing code that may import them directly.

## GraphQL Schema Features

### Tables Defined

1. **Tenant** - Multi-tenant configuration and settings
2. **Session** - User session tracking and analytics  
3. **Statistic** - AI inference statistics and performance metrics
4. **UserProfile** - User preferences and behavioral data
5. **UserFeedback** - User feedback on AI recommendations
6. **RetrainingJob** - AI model retraining job management
7. **PerformanceMetric** - System performance monitoring
8. **Metric** - General metrics collection
9. **AIModelMetric** - AI model-specific performance metrics
10. **CacheMetadata** - Cache performance and metadata

### Key Features

- **Relationships**: Properly defined foreign key relationships between tables
- **Indexing**: Strategic indexing on frequently queried fields using `@indexed`
- **Primary Keys**: UUID-based primary keys using `@primaryKey`
- **JSON Fields**: Complex data structures stored as `Any` type for JSON data
- **Type Safety**: Proper GraphQL type definitions with required fields

### Usage

The schema is automatically exported from `index.js` and used by Harper to create the database tables and relationships.

```javascript
import { schema } from './schemas/index.js';

// Schema is automatically used by Harper framework
export { schema };
```

## Migration from JavaScript Schemas

This GraphQL schema replaces the previous JavaScript-based schema definitions while maintaining the same table structure and relationships. The migration provides:

- Better type safety
- Cleaner relationship definitions
- Improved performance through proper indexing
- Compatibility with Harper's native GraphQL features

## Development

When modifying the schema:

1. Update `schema.graphql` with your changes
2. Test with Harper's schema validation
3. Update any related code that depends on the schema structure
4. Run the test suite to ensure compatibility

## Schema Validation

The schema follows Harper's GraphQL specification:
- Uses `@table` directive for table definitions
- Uses `@primaryKey` for primary key fields
- Uses `@indexed` for secondary indexes
- Uses `@relationship` for foreign key relationships
- Uses `@export` to make tables available for queries