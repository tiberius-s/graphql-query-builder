# Caching

This guide explains how to use the built-in caching system to improve performance with repeated query patterns.

## Why Cache Queries?

In a GraphQL server, the same query structure often repeats with different variables:

```graphql
# Same structure, different IDs
query GetUser {
  user(id: "1") {
    id
    email
    name
  }
}
query GetUser {
  user(id: "2") {
    id
    email
    name
  }
}
query GetUser {
  user(id: "3") {
    id
    email
    name
  }
}
```

Building the query string is fast, but caching eliminates the work entirely for repeated patterns.

## Step 1: Initialize the Cache

Initialize at application startup:

```typescript
import { initializeCache } from 'graphql-query-builder';

initializeCache({
  maxSize: 1000, // Maximum cached queries
  ttl: 300000, // Time-to-live: 5 minutes (0 = no expiry)
});
```

## Step 2: Use Cached Query Building

Replace `buildQuery` with `buildQueryCached`:

```typescript
import { buildQueryCached } from 'graphql-query-builder';

const fields = [
  { name: 'id', path: ['id'], depth: 1 },
  { name: 'email', path: ['email'], depth: 1 },
];

// First call builds and caches the query
const result1 = buildQueryCached('user', fields, { variables: { id: '1' } });

// Second call retrieves from cache
const result2 = buildQueryCached('user', fields, { variables: { id: '2' } });

// Same query string, different variables
console.log(result1.query === result2.query); // true
console.log(result1.variables); // { id: '1' }
console.log(result2.variables); // { id: '2' }
```

## Cache Key Generation

The cache key is an MD5 hash of:

- Root field name
- Field structure (names, aliases, arguments)
- Options (operation name, required fields, field mappings)

Variables are NOT part of the cache key, so queries with different variable values share the same cached query string.

## Building from Paths

Use `buildQueryFromPathsCached` for dot-notation field paths:

```typescript
import { buildQueryFromPathsCached } from 'graphql-query-builder';

const result = buildQueryFromPathsCached('product', [
  'name',
  'price',
  'inventory.available',
  'inventory.reserved',
]);

console.log(result.query);
// query UpstreamQuery { product { id name price inventory { available reserved } } }
```

## Monitoring Cache Performance

```typescript
import { getCacheStats } from 'graphql-query-builder';

const stats = getCacheStats();

console.log(`Cache hits: ${stats.hits}`);
console.log(`Cache misses: ${stats.misses}`);
console.log(`Hit ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);
console.log(`Cached queries: ${stats.size}`);
```

## Cache Management

```typescript
import { clearCache, disableCache, isCacheEnabled } from 'graphql-query-builder';

// Check if caching is enabled
if (isCacheEnabled()) {
  console.log('Caching is active');
}

// Clear all cached queries
clearCache();

// Disable caching entirely
disableCache();
```

## When to Clear the Cache

Clear the cache when:

- Your upstream schema changes
- Field mappings are updated
- Required fields configuration changes

```typescript
import { clearCache, configure } from 'graphql-query-builder';

// Update configuration
configure({
  requiredFields: ['id', 'version'],
});

// Clear cache since configuration changed
clearCache();
```

## TTL Expiration

With TTL enabled, entries automatically expire:

```typescript
import { initializeCache } from 'graphql-query-builder';

// Cache entries expire after 5 minutes
initializeCache({
  maxSize: 1000,
  ttl: 300000, // 5 minutes in milliseconds
});

// With TTL of 0, entries never expire (until evicted by maxSize)
initializeCache({
  maxSize: 1000,
  ttl: 0,
});
```

## LRU Eviction

When the cache reaches `maxSize`, the least recently used entry is evicted:

```typescript
initializeCache({ maxSize: 3 });

buildQueryCached('user', fields1); // key1 added
buildQueryCached('product', fields2); // key2 added
buildQueryCached('order', fields3); // key3 added
buildQueryCached('cart', fields4); // key1 evicted, key4 added
```

## Complete Example

```typescript
import {
  initializeCache,
  buildQueryCached,
  getCacheStats,
  clearCache,
} from 'graphql-query-builder';

// Initialize at startup
initializeCache({ maxSize: 1000, ttl: 300000 });

// In your resolver
const userResolver = async (_parent, args, context, info) => {
  const { fields } = extractFieldsFromInfo(info);

  const { query, variables } = buildQueryCached('user', fields, {
    operationName: 'GetUser',
    variables: { id: args.id },
  });

  return context.upstream.query(query, variables);
};

// Monitor in health check endpoint
app.get('/health', (req, res) => {
  const stats = getCacheStats();
  res.json({
    cacheHitRatio: stats.hitRatio,
    cachedQueries: stats.size,
  });
});
```

## Next Steps

- [Validation](validation/validation.md) - Protect against abuse
- [Basic Usage](./basic-usage.md) - Core workflow
