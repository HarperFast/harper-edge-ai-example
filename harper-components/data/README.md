# Harper Edge AI Data Files

This directory contains seed data and sample responses for the Harper Edge AI personalization system.

## GraphQL Seed Files

### `seed-tenants.graphql`
Contains GraphQL mutations to create the primary tenant configuration (Alpine Gear Co). This includes:
- Tenant configuration and API settings
- Personalization and categorization weights
- Rate limiting and endpoint configuration
- Content personalization rules

### `seed-data.graphql`
Comprehensive sample data including:
- **Tenant**: Alpine Gear Co configuration
- **UserProfile**: Sample outdoor enthusiast profile with preferences
- **Session**: Sample user session data
- **Statistic**: AI inference statistics and performance metrics  
- **UserFeedback**: User feedback on AI recommendations

## Legacy JSON Files

### `seed-tenants.json`
Legacy JSON format tenant data (maintained for backward compatibility)

### `alpine-gear-mock-responses.json`
Mock API responses from the Alpine Gear Co API for testing and development

## Usage

Load the GraphQL seed data using Harper's CLI:

```bash
# Load tenant configuration
harper-fabric graphql --file data/seed-tenants.graphql

# Load comprehensive sample data
harper-fabric graphql --file data/seed-data.graphql
```

Or use the JSON files if needed:
```bash
# Legacy JSON format
harper-fabric db seed --file data/seed-tenants.json
```

## Data Structure

The seed data creates a realistic outdoor gear e-commerce scenario with:
- **Multi-tenant configuration** for Alpine Gear Co
- **User segmentation** based on outdoor activity preferences
- **AI model performance tracking** with real inference metrics
- **Personalization data** for hiking, camping, and outdoor activities
- **Feedback loops** for continuous model improvement

This data supports all the AI personalization features including:
- Product recommendations based on activity type
- Seasonal gear suggestions
- Experience-level appropriate recommendations
- Price sensitivity analysis
- A/B testing scenarios