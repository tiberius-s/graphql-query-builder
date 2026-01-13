# graphql-query-builder Examples

This folder contains comprehensive examples demonstrating how to use the graphql-query-builder library.

## Examples Overview

### [basic-usage.ts](./basic-usage.ts)

Core functionality examples including:

- Extracting fields from GraphQL resolve info
- Building GraphQL queries from field selections
- Using field path strings

### [datasource-integration.ts](./datasource-integration.ts)

Data source patterns including:

- Using `GraphQLDataSource` base class
- Creating custom data sources
- Service configuration and registration

### [security-configuration.ts](./security-configuration.ts)

Security patterns including:

- Field blocking and sanitization
- Query depth and complexity limits
- Field validation

### [performance-optimization.ts](./performance-optimization.ts)

Performance patterns including:

- Query string caching setup
- AST caching setup
- Cache warmup strategies
- Monitoring cache statistics

### [configuration.ts](./configuration.ts)

Configuration patterns including:

- Environment variable configuration
- Custom configuration providers
- AWS Parameter Store integration
- Node-config integration
- Dynamic service registration

### [use-cases.ts](./use-cases.ts)

Real-world use case examples including:

- Apollo Federation subgraph optimization
- BFF (Backend for Frontend) pattern
- Multi-tenant SaaS applications
- Rate-limited external APIs
- Schema stitching gateways
- Event-sourced microservices
- Security-first APIs
- Field-based response caching
- Testing and mocking
- Performance monitoring

### [framework-integration.ts](./framework-integration.ts)

Framework integration patterns including:

- Apollo Server 4
- Express GraphQL
- NestJS
- GraphQL Yoga
- Mercurius (Fastify)
- AWS AppSync Lambda
- Testing with Jest/Vitest
- DataDog APM integration
- Prometheus metrics

## Quick Start

```typescript
import {
  extractFieldsFromInfo,
  buildQuery,
  SimpleGraphQLDataSource,
  setConfig,
  initializeQueryCache,
} from 'graphql-query-builder';
import type { GraphQLResolveInfo } from 'graphql';

// 1. Initialize caching
initializeQueryCache({ maxSize: 500, ttl: 300000 });

// 2. Configure services
setConfig({
  maxDepth: 10,
  maxFields: 100,
  upstreamServices: {
    userService: {
      endpoint: 'http://localhost:4001/graphql',
      timeout: 5000,
    },
  },
});

// 3. Create data source
const dataSource = new SimpleGraphQLDataSource('userService');

// 4. Use in resolver
async function userResolver(
  parent: unknown,
  args: { id: string },
  context: unknown,
  info: GraphQLResolveInfo,
) {
  return dataSource.executeQuery('user', { id: args.id }, info);
}
```

## Running Examples

These examples are TypeScript files that demonstrate API usage patterns. They're designed to be read and referenced, not executed directly.

To use these patterns in your project:

1. Install the library:

   ```bash
   npm install graphql-query-builder
   ```

2. Copy relevant patterns from these examples into your codebase

3. Adapt the patterns to your specific use case

## Key Concepts

### Field Extraction

The `extractFieldsFromInfo` function analyzes the GraphQL resolve info to determine exactly which fields were requested by the client. This is the foundation for preventing over-fetching.

### Query Building

The `buildQuery` and `buildQueryCached` functions construct GraphQL query strings from field selections. The cached version provides significant performance benefits for repeated queries.

### Data Sources

Data source classes encapsulate the logic for communicating with upstream GraphQL services. They handle authentication, error handling, and query execution.

### Caching

Two levels of caching are available:

- **Query String Cache**: Caches the generated GraphQL query strings
- **AST Cache**: Caches parsed GraphQL ASTs for validation

### Security

Built-in security features include:

- Field blocking (preventing access to sensitive fields)
- Depth limiting (preventing deeply nested queries)
- Field count limiting (preventing overly broad queries)
- Field validation and sanitization
