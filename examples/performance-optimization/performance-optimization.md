# Performance Optimization Tutorial

A comprehensive guide to maximizing performance with caching strategies for your GraphQL query builder.

---

## Introduction

Building optimized queries is great, but there's more we can do. If your resolvers handle the same query patterns repeatedly, you're rebuilding identical query strings over and over.

This tutorial shows you how to use caching to:

- Avoid regenerating the same query strings
- Skip re-parsing GraphQL ASTs
- Warm up caches at startup
- Monitor cache effectiveness

---

## Prerequisites

- Completed the [Basic Usage](../basic-usage/basic-usage.md) tutorial
- Understanding of caching concepts

---

## What You'll Learn

1. Query string caching
2. AST (Abstract Syntax Tree) caching
3. Cache warmup strategies
4. Monitoring cache performance
5. Cache configuration for different environments

---

## The Performance Opportunity

```
Without Caching:
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Request 1  │────▶│ Build Query  │────▶│   Execute    │
│              │     │   (5ms)      │     │              │
└──────────────┘     └──────────────┘     └──────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Request 2  │────▶│ Build Query  │────▶│   Execute    │
│ (same fields)│     │   (5ms)      │     │              │
└──────────────┘     └──────────────┘     └──────────────┘

With Caching:
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Request 1  │────▶│ Build Query  │────▶│   Execute    │
│              │     │   (5ms)      │     │              │
└──────────────┘     └──────────────┘     └──────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Request 2  │────▶│ Cache Hit!   │────▶│   Execute    │
│ (same fields)│     │   (0.1ms)    │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
```

---

## Step 1: Initialize Query String Cache

Set up the query cache at application startup:

```typescript
import { initializeQueryCache } from 'graphql-query-builder';

// Initialize at startup
initializeQueryCache({
  maxSize: 1000, // Cache up to 1000 unique query structures
  ttl: 300000, // 5 minute TTL (time-to-live)
  trackStats: true, // Enable statistics for monitoring
});

console.log('Query cache initialized');
```

### Configuration Options

| Option       | Description                  | Default        |
| ------------ | ---------------------------- | -------------- |
| `maxSize`    | Maximum cached entries       | 500            |
| `ttl`        | Time-to-live in milliseconds | 300000 (5 min) |
| `trackStats` | Enable hit/miss statistics   | true           |

---

## Step 2: Using Cached Query Building

Replace `buildQuery` with `buildQueryCached`:

```typescript
import {
  extractFieldsFromInfo,
  buildQueryCached, // Use the cached version
} from 'graphql-query-builder';

async function resolver(parent, args, context, info) {
  const extracted = extractFieldsFromInfo(info);

  // First call: builds and caches the query string
  const result1 = buildQueryCached('user', extracted.fields, {
    operationName: 'GetUser',
    variables: { id: args.id },
  });

  return executeUpstream(result1);
}
```

### How Caching Works

The cache key is based on:

- Root field name
- Field selection structure (not variable values)
- Build options

This means:

```typescript
// These two calls return the SAME cached query string
const query1 = buildQueryCached('user', fields, { variables: { id: '123' } });
const query2 = buildQueryCached('user', fields, { variables: { id: '456' } });

// Same query structure, different variables
console.log(query1.query === query2.query); // true
```

---

## Step 3: Building from Paths (Cached)

When you know exact field paths:

```typescript
import { buildQueryFromPathsCached } from 'graphql-query-builder';

const paths = ['id', 'email', 'profile.firstName', 'profile.lastName', 'profile.avatar.url'];

// Cached version
const result = buildQueryFromPathsCached('user', paths, {
  operationName: 'GetUserProfile',
  variables: { id: '123' },
});
```

---

## Step 4: Initialize AST Cache

AST caching speeds up query parsing and validation:

```typescript
import { initializeASTCache } from 'graphql-query-builder';

initializeASTCache({
  maxSize: 500, // Cache up to 500 parsed ASTs
  ttl: 600000, // 10 minute TTL
  trackStats: true,
});

console.log('AST cache initialized');
```

---

## Step 5: Preload Common Queries (Warmup)

At application startup, preload frequently used queries:

```typescript
import { preloadQueries } from 'graphql-query-builder';

async function warmupCaches() {
  const commonQueries = [
    `query GetUser($id: ID!) {
      user(id: $id) { id name email createdAt }
    }`,
    `query ListUsers($first: Int, $after: String) {
      users(first: $first, after: $after) {
        edges { node { id name } cursor }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    `mutation UpdateUser($id: ID!, $input: UserInput!) {
      updateUser(id: $id, input: $input) { id name email updatedAt }
    }`,
    `query GetUserProfile($id: ID!) {
      user(id: $id) {
        id name email
        profile { firstName lastName avatar { url } }
        settings { notifications theme }
      }
    }`,
  ];

  const result = preloadQueries(commonQueries);
  console.log(`Preloaded ${result.success} queries, ${result.failed} failed`);
}

// Call at startup
warmupCaches();
```

---

## Step 6: Parse Queries with Caching

For validating or analyzing queries:

```typescript
import { parseQueryCached } from 'graphql-query-builder';

const query = `query { user { id name email } }`;

// First parse: creates AST and caches it
const ast1 = parseQueryCached(query);

// Second parse: returns cached AST (same reference)
const ast2 = parseQueryCached(query);

console.log(ast1 === ast2); // true - same object!
```

---

## Step 7: Validate Built Queries

Validate generated queries before sending:

```typescript
import { buildQueryCached, validateBuiltQuerySyntax } from 'graphql-query-builder';

async function safeResolver(parent, args, context, info) {
  const extracted = extractFieldsFromInfo(info);

  const builtQuery = buildQueryCached('user', extracted.fields, {
    operationName: 'GetUser',
  });

  // Validate the generated query
  const validation = validateBuiltQuerySyntax(builtQuery);

  if (!validation.valid) {
    console.error('Invalid query generated:', validation.errors);
    throw new Error(`Query validation failed: ${validation.errors.join(', ')}`);
  }

  return executeUpstream(builtQuery);
}
```

---

## Step 8: Monitor Cache Performance

Track cache effectiveness:

```typescript
import { getQueryCacheStats, getASTCacheStats } from 'graphql-query-builder';

function logCacheStats() {
  const queryStats = getQueryCacheStats();
  console.log('Query Cache Statistics:');
  console.log(`  Hits: ${queryStats.hits}`);
  console.log(`  Misses: ${queryStats.misses}`);
  console.log(`  Hit Ratio: ${(queryStats.hitRatio * 100).toFixed(1)}%`);
  console.log(`  Size: ${queryStats.size}`);

  const astStats = getASTCacheStats();
  console.log('AST Cache Statistics:');
  console.log(`  Hits: ${astStats.hits}`);
  console.log(`  Misses: ${astStats.misses}`);
  console.log(`  Hit Ratio: ${(astStats.hitRatio * 100).toFixed(1)}%`);
  console.log(`  Size: ${astStats.size}`);
  console.log(`  Parse Errors: ${astStats.parseErrors}`);
}

// Log periodically
setInterval(logCacheStats, 60000); // Every minute
```

### Interpreting Statistics

| Metric           | Good Value | Action if Low                        |
| ---------------- | ---------- | ------------------------------------ |
| Hit Ratio        | > 80%      | Increase `maxSize`                   |
| Size at capacity | N/A        | Increase `maxSize` or decrease `ttl` |
| Parse Errors     | 0          | Check query generation logic         |

---

## Step 9: Clear Caches When Needed

Clear caches after schema changes or for testing:

```typescript
import { clearQueryCache } from 'graphql-query-builder';

// After schema changes
function onSchemaUpdate() {
  clearQueryCache();
  console.log('Query cache cleared');
}

// For testing
beforeEach(() => {
  clearQueryCache();
});
```

---

## Step 10: Environment-Specific Configuration

Configure differently for development vs production:

```typescript
import { initializeQueryCache, initializeASTCache } from 'graphql-query-builder';

const isDevelopment = process.env.NODE_ENV !== 'production';

initializeQueryCache({
  maxSize: isDevelopment ? 100 : 1000,
  ttl: isDevelopment ? 60000 : 300000, // 1 min dev, 5 min prod
  trackStats: isDevelopment, // Only track in dev
});

initializeASTCache({
  maxSize: isDevelopment ? 50 : 500,
  ttl: isDevelopment ? 60000 : 600000, // 1 min dev, 10 min prod
  trackStats: isDevelopment,
});
```

---

## Complete Performance Setup

Here's a production-ready initialization:

```typescript
import {
  initializeQueryCache,
  initializeASTCache,
  preloadQueries,
  getQueryCacheStats,
  getASTCacheStats,
} from 'graphql-query-builder';

export async function initializePerformanceOptimizations() {
  const isProduction = process.env.NODE_ENV === 'production';

  // 1. Initialize query string cache
  initializeQueryCache({
    maxSize: isProduction ? 1000 : 100,
    ttl: isProduction ? 300000 : 60000,
    trackStats: !isProduction, // Disable stats tracking in prod for performance
  });

  // 2. Initialize AST cache
  initializeASTCache({
    maxSize: isProduction ? 500 : 50,
    ttl: isProduction ? 600000 : 60000,
    trackStats: !isProduction,
  });

  // 3. Preload common queries (non-blocking)
  setImmediate(async () => {
    const queries = [
      'query GetUser($id: ID!) { user(id: $id) { id name email } }',
      'query ListUsers { users { id name } }',
      'mutation UpdateUser($id: ID!, $input: UserInput!) { updateUser(id: $id, input: $input) { id } }',
    ];

    const result = preloadQueries(queries);
    console.log(`Cache warmup: ${result.success}/${queries.length} queries preloaded`);
  });

  // 4. Set up monitoring (in production, send to your metrics system)
  if (!isProduction) {
    setInterval(() => {
      const qStats = getQueryCacheStats();
      const aStats = getASTCacheStats();

      if (qStats.hitRatio < 0.5 && qStats.misses > 100) {
        console.warn('Low query cache hit ratio:', qStats.hitRatio);
      }
    }, 60000);
  }

  console.log('Performance optimizations initialized');
}
```

---

## Performance Tips

### 1. Cache Size Tuning

```typescript
// Start with these and adjust based on monitoring
initializeQueryCache({
  maxSize: 500, // Start here
  // If hit ratio < 80% and size is at capacity, increase
});
```

### 2. TTL Tuning

```typescript
// Longer TTL = higher hit ratio, but stale data risk
initializeQueryCache({
  ttl: 300000, // 5 minutes is a good default
  // Decrease if you have frequent schema changes
  // Increase if queries are very stable
});
```

### 3. Disable Stats in Production

```typescript
// Stats tracking has a small overhead
initializeQueryCache({
  trackStats: process.env.NODE_ENV !== 'production',
});
```

### 4. Warmup Critical Paths

```typescript
// Preload queries for your most common operations
preloadQueries([
  yourMostCommonQuery1,
  yourMostCommonQuery2,
  // ...
]);
```

---

## Benchmarking Results

Typical improvements with caching enabled:

| Metric             | Without Cache | With Cache | Improvement |
| ------------------ | ------------- | ---------- | ----------- |
| Query build time   | 5ms           | 0.1ms      | 50x faster  |
| AST parse time     | 2ms           | 0.05ms     | 40x faster  |
| Memory per request | N/A           | Shared     | Less GC     |

---

## Summary

| Function                      | Purpose                       |
| ----------------------------- | ----------------------------- |
| `initializeQueryCache()`      | Set up query string caching   |
| `initializeASTCache()`        | Set up AST caching            |
| `buildQueryCached()`          | Build with caching            |
| `buildQueryFromPathsCached()` | Build from paths with caching |
| `parseQueryCached()`          | Parse with caching            |
| `preloadQueries()`            | Warmup cache at startup       |
| `getQueryCacheStats()`        | Monitor query cache           |
| `getASTCacheStats()`          | Monitor AST cache             |
| `clearQueryCache()`           | Clear query cache             |

---

## Next Steps

- **[Configuration](../configuration/configuration.md)** - Advanced configuration options
- **[Use Cases](../use-cases/use-cases.md)** - Real-world patterns

---

_Speed up your GraphQL APIs! ⚡_
