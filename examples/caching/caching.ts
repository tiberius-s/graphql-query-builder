/**
 * Caching Example - graphql-query-builder
 *
 * Demonstrates how to use the built-in caching system
 * for improved performance with repeated query patterns.
 */

import {
  initializeCache,
  clearCache,
  disableCache,
  getCacheStats,
  buildQueryCached,
  buildQueryFromPathsCached,
} from 'graphql-query-builder';

// Initialize caching at application startup
initializeCache({
  maxSize: 1000, // Maximum number of cached queries
  ttl: 300000, // Time-to-live: 5 minutes (0 = no expiry)
});

// Build queries - identical structures will be cached
const fields = [
  { name: 'id', path: ['id'], depth: 1 },
  { name: 'email', path: ['email'], depth: 1 },
];

// First call builds and caches the query
const result1 = buildQueryCached('user', fields, { variables: { id: '1' } });

// Second call retrieves from cache (same structure, different variables)
const result2 = buildQueryCached('user', fields, { variables: { id: '2' } });

// Both have the same query string
console.log(result1.query === result2.query); // true

// But different variables
console.log(result1.variables); // { id: '1' }
console.log(result2.variables); // { id: '2' }

// Alternative: build from field paths
const pathResult = buildQueryFromPathsCached('product', [
  'name',
  'price',
  'inventory.available',
  'inventory.reserved',
]);

console.log(pathResult.query);
// query UpstreamQuery { product { id name price inventory { available reserved } } }

// Monitor cache performance
const stats = getCacheStats();
console.log(`Cache hits: ${stats.hits}, misses: ${stats.misses}`);
console.log(`Hit ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);
console.log(`Cached queries: ${stats.size}`);

// Clear cache when needed (e.g., schema changes)
clearCache();

// Disable caching entirely (e.g., during development)
disableCache();
