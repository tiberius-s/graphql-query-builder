# graphql-query-builder

A TypeScript library for building optimized GraphQL queries between servers. Extract requested fields from resolver info and build queries that fetch only what the client needs.

## Problem

When your GraphQL server proxies queries to an upstream GraphQL service, a naive approach fetches all fields:

```text
Client requests:          Upstream receives:
{ user { email } }   →    { user { id email name phone address ... } }
```

This wastes bandwidth and increases latency.

## Solution

This library extracts the exact fields requested by the client and builds a minimal query for the upstream service:

```text
Client requests:          Upstream receives:
{ user { email } }   →    { user { email } }
```

## Installation

```bash
npm install graphql-query-builder
```

## Usage

```typescript
import {
  extractFieldsFromInfo,
  buildQuery,
  configure,
  validateFields,
} from 'graphql-query-builder';

// Configure validation limits
configure({
  maxDepth: 10,
  maxFields: 100,
});

// In your resolver
const resolvers = {
  Query: {
    user: async (_, { id }, context, info) => {
      // Extract only the fields the client requested
      const fields = extractFieldsFromInfo(info);

      // Validate against configured limits
      validateFields(fields);

      // Build the upstream query
      const { query, variables } = buildQuery('user', fields, {
        variables: { id },
      });

      // Execute against upstream
      const response = await fetch('https://upstream.example.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });

      return response.json();
    },
  },
};
```

## Caching

Enable query caching for repeated patterns:

```typescript
import { initializeCache, buildQueryCached, getCacheStats } from 'graphql-query-builder';

// Initialize at startup
initializeCache({ maxSize: 1000, ttl: 300000 });

// Use cached version in resolvers
const { query, variables } = buildQueryCached('user', fields, { variables: { id } });

// Monitor performance
const stats = getCacheStats();
console.log(`Cache hit ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);
```

## API Reference

### Field Extraction

#### `extractFieldsFromInfo(info, options?)`

Extracts field selections from GraphQL resolver info.

```typescript
const fields = extractFieldsFromInfo(info, {
  maxDepth: 5, // Limit extraction depth
  includeTypename: false,
});
```

#### `getRequestedFieldNames(info)`

Returns a flat list of all requested field names.

```typescript
const names = getRequestedFieldNames(info);
// ['id', 'email', 'profile', 'firstName']
```

#### `isFieldRequested(info, path)`

Checks if a specific field path was requested.

```typescript
if (isFieldRequested(info, 'profile.avatar')) {
  // Load avatar data
}
```

### Query Building

#### `buildQuery(typeName, fields, options?)`

Builds a GraphQL query string from field selections.

```typescript
const { query, variables } = buildQuery('user', fields, {
  operationName: 'GetUser',
  variables: { id: '123' },
  requiredFields: ['id'],
});
```

#### `buildQueryCached(typeName, fields, options?)`

Same as `buildQuery`, but caches the result. Requires `initializeCache()`.

#### `buildQueryFromPaths(typeName, paths, options?)`

Builds a query from dot-notation field paths.

```typescript
const { query } = buildQueryFromPaths('user', [
  'id',
  'email',
  'profile.firstName',
  'profile.avatar.url',
]);
```

#### `buildQueryFromPathsCached(typeName, paths, options?)`

Same as `buildQueryFromPaths`, but caches the result.

### Configuration & Validation

#### `configure(options)`

Sets global configuration.

```typescript
configure({
  maxDepth: 10, // Maximum query depth
  maxFields: 100, // Maximum number of fields
  allowedRootFields: ['user', 'product'], // Allowed root types
});
```

#### `validateFields(fields)`

Validates fields against configured limits. Returns validation result.

```typescript
const result = validateFields(fields);
if (!result.valid) {
  console.log(result.errors);
}
```

#### `assertValid(fields)`

Validates fields and throws `QueryValidationError` if invalid.

```typescript
try {
  assertValid(fields);
} catch (error) {
  if (error instanceof QueryValidationError) {
    console.log(error.errors);
  }
}
```

#### `sanitizeFields(fields)`

Removes fields exceeding depth limits.

```typescript
const sanitized = sanitizeFields(fields);
```

### Caching

#### `initializeCache(options?)`

Initializes the query cache.

```typescript
initializeCache({
  maxSize: 1000, // Max cached queries
  ttl: 300000, // Time-to-live in ms (0 = no expiry)
});
```

#### `clearCache()`

Clears all cached queries.

#### `disableCache()`

Disables caching.

#### `isCacheEnabled()`

Returns whether caching is enabled.

#### `getCacheStats()`

Returns cache statistics.

```typescript
const { hits, misses, hitRatio, size } = getCacheStats();
```

## Types

```typescript
import type {
  FieldSelection,
  QueryBuildOptions,
  BuiltQuery,
  ValidationResult,
  Config,
  CacheOptions,
} from 'graphql-query-builder';
```

## Examples

See the [examples](./examples) directory:

- [basic-usage.ts](./examples/basic-usage.ts) - Complete resolver example
- [caching.ts](./examples/caching.ts) - Cache configuration and monitoring
- [validation.ts](./examples/validation.ts) - Field validation patterns

MIT
