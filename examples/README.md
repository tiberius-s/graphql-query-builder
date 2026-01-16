# Examples

These examples demonstrate the graphql-query-builder library for proxying GraphQL queries between servers.

## Use Case

When your GraphQL server needs to forward queries to an upstream GraphQL service while preserving the client's field selection, this library extracts the requested fields and builds properly formatted upstream queries.

## Tutorials

### Getting Started

- **[Basic Usage](basic-usage/basic-usage.md)** - Core workflow for preventing overfetching
- **[Caching](caching/caching.md)** - Performance optimization with query caching
- **[Validation](validation/validation.md)** - Protect against abuse with field validation

### Schema Mapping

When your service schema differs from the upstream schema:

- **[Schema Mapping with Zod](./schema-mapping-zod/schema-mapping-zod.md)** - Using Zod 4 codecs for bidirectional translation
- **[Schema Mapping with Generic Functions](./schema-mapping-generic/schema-mapping-generic.md)** - Plain TypeScript without external dependencies

## Code Examples

- **[basic-usage.ts](basic-usage/basic-usage.ts)** - Complete resolver implementation
- **[caching.ts](caching/caching.ts)** - Cache configuration and monitoring
- **[validation.ts](validation/validation.ts)** - Field validation and sanitization

## Quick Reference

```typescript
import {
  extractFieldsFromInfo,
  buildQuery,
  buildQueryCached,
  configure,
  validateFields,
  initializeCache,
} from 'graphql-query-builder';

// In your resolver
const { fields } = extractFieldsFromInfo(info);
const { query, variables } = buildQuery('upstreamType', fields, {
  variables: { id },
  variableTypes: { id: 'ID!' },
  rootArguments: { id: { __variable: 'id' } },
});
```

## API Summary

### Field Extraction

- `extractFieldsFromInfo(info)` - Extract field selections from GraphQL resolver info

### Query Building

- `buildQuery(typeName, fields, options?)` - Build a query string from field selections
- `buildQueryCached(typeName, fields, options?)` - Same as above, with caching
- `buildQueryFromPaths(typeName, paths, options?)` - Build from dot-notation paths
- `buildQueryFromPathsCached(typeName, paths, options?)` - Same as above, with caching

### Configuration and Validation

- `configure(options)` - Set depth limits and allowed fields
- `validateFields(fields)` - Check fields against configured limits
- `assertValid(fields)` - Throw if fields exceed limits
- `sanitizeFields(fields)` - Remove blocked fields from a selection tree

### Caching

- `initializeCache(options?)` - Enable caching with size and TTL limits
- `clearCache()` - Remove all cached queries
- `disableCache()` - Turn off caching
- `getCacheStats()` - Get hit/miss statistics
