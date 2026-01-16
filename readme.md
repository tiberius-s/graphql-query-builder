# graphql-query-builder

[![Docs](https://img.shields.io/badge/docs-API-blue)](https://tiberius-s.github.io/graphql-query-builder/)

A TypeScript library for building optimized GraphQL queries between servers. Extract requested fields from resolver info and build queries that fetch only what the client needs.

## Table of Contents

- [Documentation](#documentation)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Caching](#caching)
- [Configuration & Validation](#configuration--validation)
- [API Overview](#api-overview)
- [Types](#types)
- [Examples](#examples)
- [License](#license)

## Documentation

📚 **Full API Documentation**: <https://tiberius-s.github.io/graphql-query-builder/>

To generate documentation locally:

```bash
npm run docs        # Generate docs in ./docs
npm run docs:serve  # View docs at http://localhost:3000
```

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

## Quick Start

```typescript
import { extractFieldsFromInfo, buildQuery, configure, assertValid } from 'graphql-query-builder';

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
      const { fields } = extractFieldsFromInfo(info);

      // Validate against configured limits
      assertValid(fields);

      // Build the upstream query
      const { query, variables } = buildQuery('user', fields, {
        operationName: 'GetUser',
        operationType: 'query',
        variables: { id },
        variableTypes: { id: 'ID!' },
        rootArguments: { id: { __variable: 'id' } },
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
const { query, variables } = buildQueryCached('user', fields, {
  variables: { id },
  variableTypes: { id: 'ID!' },
  rootArguments: { id: { __variable: 'id' } },
});

// Monitor performance
const stats = getCacheStats();
console.log(`Cache hit ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);
```

## Configuration & Validation

Global configuration is applied once at startup:

```typescript
import { configure } from 'graphql-query-builder';

configure({
  maxDepth: 10,
  maxFields: 100,
  blockedFields: ['password', 'ssn'],
  requiredFields: ['id'],
  fieldMappings: { email: 'emailAddress' },
});
```

Validation helpers:

```typescript
import { validateFields, assertValid, sanitizeFields } from 'graphql-query-builder';

const result = validateFields(fields);
if (!result.valid) {
  console.log(result.errors);
}

// Throwing variant
assertValid(fields);

// Remove blocked fields (does not enforce depth/field-count limits)
const sanitized = sanitizeFields(fields);
```

## API Overview

### Field Extraction

#### `extractFieldsFromInfo(info, options?)`

Extracts field selections from GraphQL resolver info.

```typescript
const { fields } = extractFieldsFromInfo(info, {
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
  variableTypes: { id: 'ID!' },
  rootArguments: { id: { __variable: 'id' } },
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
  blockedFields: ['password', 'ssn'], // Fields that should never be included
  requiredFields: ['id'], // Fields that should always be included
  fieldMappings: { email: 'emailAddress' }, // Local -> upstream mapping
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

Removes blocked fields recursively.

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
  ExtractedFields,
  ExtractionOptions,
  QueryBuildOptions,
  BuiltQuery,
  QueryBuilderConfig,
  ValidationOptions,
  ValidationResult,
  CacheConfig,
  CacheStats,
} from 'graphql-query-builder';
```

## Examples

See the [examples](./examples) directory:

- [Basic usage](examples/basic-usage/basic-usage.md) ([source](examples/basic-usage/basic-usage.ts))
- [Caching](examples/caching/caching.md) ([source](examples/caching/caching.ts))
- [Validation](examples/validation/validation.md) ([source](examples/validation/validation.ts))
- [Schema mapping (Zod)](examples/schema-mapping-zod/schema-mapping-zod.md) ([source](examples/schema-mapping-zod/schema-mapping-zod.ts))
- [Schema mapping (generic)](examples/schema-mapping-generic/schema-mapping-generic.md) ([source](examples/schema-mapping-generic/schema-mapping-generic.ts))

## License

MIT
