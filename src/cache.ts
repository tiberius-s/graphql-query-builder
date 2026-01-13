/**
 * graphql-query-builder
 *
 * Query Cache Module
 *
 * This module provides caching utilities to improve performance by avoiding
 * redundant query string generation for identical field selections.
 *
 * The cache uses a structural hash of field selections as the key, allowing
 * the same query structure to be reused across different requests.
 */

import type { BuiltQuery, QueryBuildOptions } from './builder.js';
import type { FieldSelection } from './extractor.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Configuration for the query cache.
 */
export interface QueryCacheConfig {
  /** Maximum number of cached queries */
  maxSize: number;
  /** Time-to-live in milliseconds (0 = no expiry) */
  ttl: number;
  /** Whether to track cache statistics */
  trackStats: boolean;
}

/**
 * Statistics about cache performance.
 */
export interface CacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Current number of cached items */
  size: number;
  /** Hit ratio (hits / (hits + misses)) */
  hitRatio: number;
}

/**
 * Internal cache entry structure.
 */
interface CacheEntry {
  /** The cached query */
  query: BuiltQuery;
  /** When the entry was created */
  timestamp: number;
  /** Number of times this entry was accessed */
  accessCount: number;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Default cache configuration.
 */
const DEFAULT_CACHE_CONFIG: QueryCacheConfig = {
  maxSize: 1000,
  ttl: 0, // No expiry by default
  trackStats: false,
};

/**
 * Global query cache instance.
 */
let queryCache: Map<string, CacheEntry> | null = null;

/**
 * Cache configuration.
 */
let cacheConfig: QueryCacheConfig = { ...DEFAULT_CACHE_CONFIG };

/**
 * Cache statistics.
 */
let cacheStats: CacheStats = {
  hits: 0,
  misses: 0,
  size: 0,
  hitRatio: 0,
};

/**
 * Initializes or reconfigures the query cache.
 *
 * @param config - Cache configuration options
 *
 * @example
 * ```typescript
 * initializeQueryCache({
 *   maxSize: 500,
 *   ttl: 60000, // 1 minute
 *   trackStats: true,
 * });
 * ```
 */
export function initializeQueryCache(config: Partial<QueryCacheConfig> = {}): void {
  cacheConfig = { ...DEFAULT_CACHE_CONFIG, ...config };
  queryCache = new Map();
  cacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    hitRatio: 0,
  };
}

/**
 * Clears the query cache.
 */
export function clearQueryCache(): void {
  if (queryCache) {
    queryCache.clear();
    cacheStats.size = 0;
  }
}

/**
 * Disables the query cache.
 */
export function disableQueryCache(): void {
  queryCache = null;
  cacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    hitRatio: 0,
  };
}

/**
 * Gets the current cache statistics.
 *
 * @returns The cache statistics
 */
export function getQueryCacheStats(): CacheStats {
  return { ...cacheStats };
}

/**
 * Generates a cache key from field selections and options.
 *
 * The key is based on a structural hash that ignores values but captures
 * the shape of the query (field names, nesting, arguments).
 *
 * @param rootType - The root type being queried
 * @param fields - The field selections
 * @param options - Query build options
 * @returns A string cache key
 */
export function generateCacheKey(
  rootType: string,
  fields: FieldSelection[],
  options: QueryBuildOptions = {},
): string {
  const structuralHash = hashFieldSelections(fields);
  const optionsHash = hashOptions(options);
  return `${rootType}:${structuralHash}:${optionsHash}`;
}

/**
 * Gets a cached query if available.
 *
 * @param key - The cache key
 * @returns The cached query or undefined
 */
export function getCachedQuery(key: string): BuiltQuery | undefined {
  if (!queryCache) {
    return undefined;
  }

  const entry = queryCache.get(key);

  if (!entry) {
    if (cacheConfig.trackStats) {
      cacheStats.misses++;
      updateHitRatio();
    }
    return undefined;
  }

  // Check TTL
  if (cacheConfig.ttl > 0 && Date.now() - entry.timestamp > cacheConfig.ttl) {
    queryCache.delete(key);
    cacheStats.size = queryCache.size;
    if (cacheConfig.trackStats) {
      cacheStats.misses++;
      updateHitRatio();
    }
    return undefined;
  }

  // Update access count
  entry.accessCount++;

  if (cacheConfig.trackStats) {
    cacheStats.hits++;
    updateHitRatio();
  }

  return entry.query;
}

/**
 * Caches a built query.
 *
 * @param key - The cache key
 * @param query - The built query to cache
 */
export function setCachedQuery(key: string, query: BuiltQuery): void {
  if (!queryCache) {
    return;
  }

  // Evict entries if at capacity
  if (queryCache.size >= cacheConfig.maxSize) {
    evictLeastRecentlyUsed();
  }

  queryCache.set(key, {
    query,
    timestamp: Date.now(),
    accessCount: 1,
  });

  cacheStats.size = queryCache.size;
}

/**
 * Checks if the query cache is enabled.
 *
 * @returns true if caching is enabled
 */
export function isQueryCacheEnabled(): boolean {
  return queryCache !== null;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Generates a structural hash of field selections.
 *
 * This hash captures the structure (field names, nesting) but ignores
 * actual argument values, allowing queries with different variables
 * but the same structure to be cached separately via the full options hash.
 */
function hashFieldSelections(fields: FieldSelection[]): string {
  const parts: string[] = [];

  for (const field of sortedFields(fields)) {
    parts.push(hashField(field));
  }

  return parts.join(',');
}

/**
 * Hashes a single field selection.
 */
function hashField(field: FieldSelection): string {
  let hash = field.name;

  if (field.alias) {
    hash = `${field.alias}:${hash}`;
  }

  if (field.arguments && Object.keys(field.arguments).length > 0) {
    const argKeys = Object.keys(field.arguments).sort().join('+');
    hash += `(${argKeys})`;
  }

  if (field.selections && field.selections.length > 0) {
    hash += `{${hashFieldSelections(field.selections)}}`;
  }

  return hash;
}

/**
 * Sorts fields by name for consistent hashing.
 */
function sortedFields(fields: FieldSelection[]): FieldSelection[] {
  return [...fields].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Hashes relevant options that affect query structure.
 */
function hashOptions(options: QueryBuildOptions): string {
  const parts: string[] = [];

  if (options.operationName) {
    parts.push(`op:${options.operationName}`);
  }

  if (options.requiredFields && options.requiredFields.length > 0) {
    parts.push(`req:${options.requiredFields.sort().join('+')}`);
  }

  if (options.fieldMappings && Object.keys(options.fieldMappings).length > 0) {
    const mappings = Object.entries(options.fieldMappings)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('+');
    parts.push(`map:${mappings}`);
  }

  // Include a hash of variable names (not values)
  if (options.variables && Object.keys(options.variables).length > 0) {
    const varNames = Object.keys(options.variables).sort().join('+');
    parts.push(`vars:${varNames}`);
  }

  return parts.length > 0 ? parts.join('|') : '_';
}

/**
 * Evicts the least recently used cache entry.
 */
function evictLeastRecentlyUsed(): void {
  if (!queryCache || queryCache.size === 0) {
    return;
  }

  let lruKey: string | null = null;
  let lruAccessCount = Number.POSITIVE_INFINITY;
  let lruTimestamp = Number.POSITIVE_INFINITY;

  for (const [key, entry] of queryCache.entries()) {
    // Prefer evicting entries with fewer accesses, then older entries
    if (
      entry.accessCount < lruAccessCount ||
      (entry.accessCount === lruAccessCount && entry.timestamp < lruTimestamp)
    ) {
      lruKey = key;
      lruAccessCount = entry.accessCount;
      lruTimestamp = entry.timestamp;
    }
  }

  if (lruKey) {
    queryCache.delete(lruKey);
  }
}

/**
 * Updates the hit ratio statistic.
 */
function updateHitRatio(): void {
  const total = cacheStats.hits + cacheStats.misses;
  cacheStats.hitRatio = total > 0 ? cacheStats.hits / total : 0;
}
