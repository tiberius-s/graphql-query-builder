# Examples

These examples demonstrate the graphql-query-builder library for proxying GraphQL queries between servers.

## Use Case

When your GraphQL server needs to forward queries to an upstream GraphQL service while preserving the client's field selection, this library extracts the requested fields and builds properly formatted upstream queries.

## Files

- **[basic-usage.ts](./basic-usage.ts)** - Complete resolver example showing the core workflow
- **[caching.ts](./caching.ts)** - Cache configuration and monitoring for repeated query patterns
- **[validation.ts](./validation.ts)** - Field validation and sanitization to protect against abuse

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
const fields = extractFieldsFromInfo(info);
const { query, variables } = buildQuery('upstreamType', fields, { variables: { id } });
```

## API Summary

### Field Extraction

- `extractFieldsFromInfo(info)` - Extract field selections from GraphQL resolver info

### Query Building

- `buildQuery(typeName, fields, options?)` - Build a query string from field selections
- `buildQueryCached(typeName, fields, options?)` - Same as above, with caching
- `buildQueryFromPaths(typeName, paths, options?)` - Build from dot-notation paths
- `buildQueryFromPathsCached(typeName, paths, options?)` - Same as above, with caching

### Configuration & Validation

- `configure(options)` - Set depth limits and allowed fields
- `validateFields(fields)` - Check fields against configured limits
- `assertValid(fields)` - Throw if fields exceed limits
- `sanitizeFields(fields)` - Remove fields exceeding depth limits

### Caching

- `initializeCache(options?)` - Enable caching with size and TTL limits
- `clearCache()` - Remove all cached queries
- `disableCache()` - Turn off caching
- `getCacheStats()` - Get hit/miss statistics
