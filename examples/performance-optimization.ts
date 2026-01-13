/**
 * graphql-query-builder Examples
 *
 * Performance Optimization Examples
 *
 * This file demonstrates the caching and performance optimization
 * features of the GraphQL Query Builder package.
 */

import type { GraphQLResolveInfo } from 'graphql';
import {
  // Query String Caching
  initializeQueryCache,
  clearQueryCache,
  getQueryCacheStats,
  buildQueryCached,
  buildQueryFromPathsCached,

  // AST Caching
  initializeASTCache,
  getASTCacheStats,
  parseQueryCached,
  validateQuerySyntax,
  validateBuiltQuerySyntax,
  preloadQueries,

  // Core functions
  extractFieldsFromInfo,
} from 'graphql-query-builder';

// ============================================================================
// Query String Caching
// ============================================================================

/**
 * Example 1: Initialize Query Cache
 *
 * Set up the query string cache at application startup for
 * optimal performance when building repeated query patterns.
 */
export function setupQueryCache() {
  // Initialize with custom settings
  initializeQueryCache({
    maxSize: 1000, // Cache up to 1000 unique query structures
    ttl: 300000, // 5 minute TTL
    trackStats: true, // Enable statistics for monitoring
  });

  console.log('Query cache initialized');
}

/**
 * Example 2: Using Cached Query Building
 *
 * Use buildQueryCached for automatic caching of query strings.
 * Identical field structures return cached query strings.
 */
export function buildQueriesWithCache(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);

  // First call: builds and caches the query
  const result1 = buildQueryCached('user', extracted.fields, {
    operationName: 'GetUser',
    variables: { id: '123' },
  });

  // Second call with same field structure: returns cached query
  const result2 = buildQueryCached('user', extracted.fields, {
    operationName: 'GetUser',
    variables: { id: '456' }, // Different variables, same structure
  });

  // The query string is the same (from cache), only variables differ
  console.log('Same query:', result1.query === result2.query);
  console.log('Different variables:', result1.variables.id !== result2.variables.id);

  // Check cache performance
  const stats = getQueryCacheStats();
  console.log(`Cache hit ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);
  console.log(`Cache size: ${stats.size} entries`);

  return result1;
}

/**
 * Example 3: Building Queries from Paths (Cached)
 *
 * When you know the exact fields you need, use buildQueryFromPathsCached.
 */
export function buildFromPathsCached() {
  // These paths will be converted to a field structure and cached
  const paths = ['id', 'email', 'profile.firstName', 'profile.lastName', 'profile.avatar.url'];

  const result = buildQueryFromPathsCached('user', paths, {
    operationName: 'GetUserProfile',
    variables: { id: '123' },
  });

  console.log('Generated query:', result.query);
  return result;
}

/**
 * Example 4: Monitoring Cache Performance
 *
 * Track cache statistics to optimize your caching configuration.
 */
export function monitorCachePerformance() {
  const stats = getQueryCacheStats();

  console.log('Query Cache Statistics:');
  console.log(`  Hits: ${stats.hits}`);
  console.log(`  Misses: ${stats.misses}`);
  console.log(`  Hit Ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);
  console.log(`  Size: ${stats.size}`);

  // If hit ratio is low, consider:
  // - Increasing maxSize if size is at capacity
  // - Increasing TTL if entries expire too quickly
  // - Analyzing query patterns for optimization opportunities

  return stats;
}

/**
 * Example 5: Clearing the Cache
 *
 * Clear the cache when needed (e.g., after schema changes).
 */
export function clearCacheOnSchemaChange() {
  // Clear all cached queries
  clearQueryCache();

  console.log('Query cache cleared');
  console.log('New cache size:', getQueryCacheStats().size); // 0
}

// ============================================================================
// AST Caching
// ============================================================================

/**
 * Example 6: Initialize AST Cache
 *
 * Set up the AST cache for faster query parsing and validation.
 */
export function setupASTCache() {
  initializeASTCache({
    maxSize: 500, // Cache up to 500 parsed ASTs
    ttl: 600000, // 10 minute TTL
    trackStats: true,
  });

  console.log('AST cache initialized');
}

/**
 * Example 7: Preload Common Queries
 *
 * At application startup, preload frequently used queries into
 * the AST cache for faster validation later.
 */
export function warmupASTCache() {
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

  return result;
}

/**
 * Example 8: Parse Queries with Caching
 *
 * Use parseQueryCached for efficient repeated parsing.
 */
export function parseQueriesEfficiently() {
  const query = `query { user { id name email } }`;

  // First parse: creates AST and caches it
  const ast1 = parseQueryCached(query);
  console.log('Parsed AST:', ast1.kind);

  // Second parse: returns cached AST (same reference)
  const ast2 = parseQueryCached(query);
  console.log('Same AST reference:', ast1 === ast2); // true

  return ast1;
}

/**
 * Example 9: Validate Query Syntax
 *
 * Validate built queries before sending them upstream.
 */
export function validateBeforeSending(info: GraphQLResolveInfo) {
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

  console.log('Query validation passed');
  return builtQuery;
}

/**
 * Example 10: Validating External Queries
 *
 * Validate queries from external sources (user input, files, etc.)
 */
export function validateExternalQuery(queryString: string) {
  const result = validateQuerySyntax(queryString);

  if (result.valid) {
    console.log('Valid query, AST:', result.ast?.kind);
    // Use result.ast for further processing
    return { valid: true, ast: result.ast };
  }

  console.error('Syntax errors:', result.errors);
  return { valid: false, errors: result.errors };
}

/**
 * Example 11: Monitoring AST Cache
 *
 * Track AST cache performance for optimization.
 */
export function monitorASTCache() {
  const stats = getASTCacheStats();

  console.log('AST Cache Statistics:');
  console.log(`  Hits: ${stats.hits}`);
  console.log(`  Misses: ${stats.misses}`);
  console.log(`  Hit Ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);
  console.log(`  Size: ${stats.size}`);
  console.log(`  Parse Errors: ${stats.parseErrors}`);

  return stats;
}

// ============================================================================
// Complete Performance Setup
// ============================================================================

/**
 * Example 12: Full Performance Initialization
 *
 * Set up all performance optimizations at application startup.
 */
export function initializePerformanceOptimizations() {
  // Initialize query string cache
  initializeQueryCache({
    maxSize: 1000,
    ttl: 300000, // 5 minutes
    trackStats: process.env.NODE_ENV !== 'production',
  });

  // Initialize AST cache
  initializeASTCache({
    maxSize: 500,
    ttl: 600000, // 10 minutes
    trackStats: process.env.NODE_ENV !== 'production',
  });

  // Preload common queries in non-blocking way
  setImmediate(() => {
    const queries = [
      'query GetUser($id: ID!) { user(id: $id) { id name email } }',
      'query ListUsers { users { id name } }',
      'mutation UpdateUser($id: ID!, $input: UserInput!) { updateUser(id: $id, input: $input) { id } }',
    ];
    preloadQueries(queries);
  });

  console.log('Performance optimizations initialized');
}

/**
 * Example 13: Graceful Shutdown
 *
 * Clean up caches on application shutdown.
 */
export function shutdownPerformanceOptimizations() {
  // Log final stats before shutdown
  const queryStats = getQueryCacheStats();
  const astStats = getASTCacheStats();

  console.log('Final Query Cache Stats:', queryStats);
  console.log('Final AST Cache Stats:', astStats);

  // Clear caches
  clearQueryCache();

  console.log('Performance caches cleared');
}
