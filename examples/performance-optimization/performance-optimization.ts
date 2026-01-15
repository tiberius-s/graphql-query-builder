/**
 * Performance Optimization Examples - graphql-query-builder
 * 
 * See performance-optimization.md for the full tutorial.
 */

import type { GraphQLResolveInfo } from 'graphql';
import {
  initializeQueryCache,
  clearQueryCache,
  getQueryCacheStats,
  buildQueryCached,
  buildQueryFromPathsCached,
  initializeASTCache,
  getASTCacheStats,
  parseQueryCached,
  validateQuerySyntax,
  validateBuiltQuerySyntax,
  preloadQueries,
  extractFieldsFromInfo,
} from 'graphql-query-builder';

// Initialize query cache
export function setupQueryCache() {
  initializeQueryCache({
    maxSize: 1000,
    ttl: 300000,
    trackStats: true,
  });
}

// Cached query building
export function buildQueriesWithCache(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);
  return buildQueryCached('user', extracted.fields, {
    operationName: 'GetUser',
    variables: { id: '123' },
  });
}

// Build from paths (cached)
export function buildFromPathsCached() {
  return buildQueryFromPathsCached('user', [
    'id', 'email', 'profile.firstName', 'profile.lastName', 'profile.avatar.url'
  ], {
    operationName: 'GetUserProfile',
    variables: { id: '123' },
  });
}

// Monitor cache performance
export function monitorCachePerformance() {
  const stats = getQueryCacheStats();
  console.log('Query Cache:', {
    hits: stats.hits,
    misses: stats.misses,
    hitRatio: `${(stats.hitRatio * 100).toFixed(1)}%`,
    size: stats.size,
  });
  return stats;
}

// Clear cache
export function clearCacheOnSchemaChange() {
  clearQueryCache();
}

// Initialize AST cache
export function setupASTCache() {
  initializeASTCache({
    maxSize: 500,
    ttl: 600000,
    trackStats: true,
  });
}

// Warmup AST cache
export function warmupASTCache() {
  const queries = [
    `query GetUser($id: ID!) { user(id: $id) { id name email createdAt } }`,
    `query ListUsers($first: Int, $after: String) { users(first: $first, after: $after) { edges { node { id name } cursor } pageInfo { hasNextPage endCursor } } }`,
    `mutation UpdateUser($id: ID!, $input: UserInput!) { updateUser(id: $id, input: $input) { id name email updatedAt } }`,
  ];
  return preloadQueries(queries);
}

// Parse with caching
export function parseQueriesEfficiently() {
  const query = `query { user { id name email } }`;
  const ast1 = parseQueryCached(query);
  const ast2 = parseQueryCached(query);
  console.log('Same reference:', ast1 === ast2);
  return ast1;
}

// Validate query syntax
export function validateBeforeSending(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);
  const builtQuery = buildQueryCached('user', extracted.fields, { operationName: 'GetUser' });
  const validation = validateBuiltQuerySyntax(builtQuery);
  if (!validation.valid) {
    throw new Error(`Query validation failed: ${validation.errors.join(', ')}`);
  }
  return builtQuery;
}

// Validate external query
export function validateExternalQuery(queryString: string) {
  const result = validateQuerySyntax(queryString);
  return result.valid ? { valid: true, ast: result.ast } : { valid: false, errors: result.errors };
}

// Monitor AST cache
export function monitorASTCache() {
  const stats = getASTCacheStats();
  console.log('AST Cache:', {
    hits: stats.hits,
    misses: stats.misses,
    hitRatio: `${(stats.hitRatio * 100).toFixed(1)}%`,
    size: stats.size,
    parseErrors: stats.parseErrors,
  });
  return stats;
}

// Full performance initialization
export function initializePerformanceOptimizations() {
  const isProduction = process.env.NODE_ENV === 'production';

  initializeQueryCache({
    maxSize: isProduction ? 1000 : 100,
    ttl: isProduction ? 300000 : 60000,
    trackStats: !isProduction,
  });

  initializeASTCache({
    maxSize: isProduction ? 500 : 50,
    ttl: isProduction ? 600000 : 60000,
    trackStats: !isProduction,
  });

  setImmediate(() => {
    const result = preloadQueries([
      'query GetUser($id: ID!) { user(id: $id) { id name email } }',
      'query ListUsers { users { id name } }',
    ]);
    console.log(`Cache warmup: ${result.success} queries preloaded`);
  });
}
