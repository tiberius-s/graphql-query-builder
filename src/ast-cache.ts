/**
 * graphql-query-builder
 *
 * AST Cache Module
 *
 * This module provides caching for parsed GraphQL ASTs to avoid
 * repeatedly parsing the same query strings. Parsing GraphQL is expensive
 * and caching parsed ASTs significantly improves performance for
 * repeated query validation or transformation.
 *
 * @example
 * ```typescript
 * import { initializeASTCache, parseQueryCached, validateQuerySyntax } from 'graphql-query-builder';
 *
 * // Initialize the cache (optional - provides statistics tracking)
 * initializeASTCache({ maxSize: 500, trackStats: true });
 *
 * // Parse a query (cached on subsequent calls)
 * const ast = parseQueryCached('query GetUser { user { id } }');
 *
 * // Validate a built query before sending
 * const result = validateQuerySyntax('query { user { id } }');
 * if (!result.valid) {
 *   console.error('Syntax errors:', result.errors);
 * }
 * ```
 */

import { type DocumentNode, parse } from 'graphql';
import type { BuiltQuery } from './builder.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Configuration for the AST cache.
 */
export interface ASTCacheConfig {
  /**
   * Maximum number of ASTs to cache.
   * When exceeded, least recently used entries are evicted.
   * @default 500
   */
  maxSize?: number;

  /**
   * Time-to-live for cached entries in milliseconds.
   * Entries older than this are considered stale.
   * @default 600000 (10 minutes)
   */
  ttl?: number;

  /**
   * Whether to track cache statistics (hits, misses, etc.)
   * @default false
   */
  trackStats?: boolean;
}

/**
 * Statistics about AST cache performance.
 */
export interface ASTCacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Current number of cached entries */
  size: number;
  /** Cache hit ratio (0-1) */
  hitRatio: number;
  /** Number of parse errors encountered */
  parseErrors: number;
}

/**
 * Result of query syntax validation.
 */
export interface SyntaxValidationResult {
  /** Whether the query is syntactically valid */
  valid: boolean;
  /** The parsed AST if valid, undefined otherwise */
  ast?: DocumentNode;
  /** Array of error messages if invalid */
  errors: string[];
}

/**
 * Cached AST entry with metadata.
 */
interface CacheEntry {
  /** The parsed AST */
  ast: DocumentNode;
  /** Timestamp when the entry was created */
  createdAt: number;
  /** Timestamp when the entry was last accessed */
  lastAccessedAt: number;
  /** Number of times this entry was accessed */
  accessCount: number;
}

// ============================================================================
// Module State
// ============================================================================

/** Default configuration values */
const DEFAULT_AST_CACHE_CONFIG: Required<ASTCacheConfig> = {
  maxSize: 500,
  ttl: 600000, // 10 minutes
  trackStats: false,
};

/** The AST cache */
let astCache: Map<string, CacheEntry> | null = null;

/** Current cache configuration */
let cacheConfig: Required<ASTCacheConfig> = { ...DEFAULT_AST_CACHE_CONFIG };

/** Cache statistics */
let stats: ASTCacheStats = {
  hits: 0,
  misses: 0,
  size: 0,
  hitRatio: 0,
  parseErrors: 0,
};

// ============================================================================
// Cache Management Functions
// ============================================================================

/**
 * Initializes the AST cache with optional configuration.
 *
 * Call this to enable caching with custom settings. If not called,
 * the cache will still work but without statistics tracking by default.
 *
 * @param config - Optional cache configuration
 *
 * @example
 * ```typescript
 * // Initialize with default settings
 * initializeASTCache();
 *
 * // Initialize with custom settings
 * initializeASTCache({
 *   maxSize: 1000,
 *   ttl: 300000, // 5 minutes
 *   trackStats: true,
 * });
 * ```
 */
export function initializeASTCache(config: ASTCacheConfig = {}): void {
  cacheConfig = { ...DEFAULT_AST_CACHE_CONFIG, ...config };
  astCache = new Map();
  stats = {
    hits: 0,
    misses: 0,
    size: 0,
    hitRatio: 0,
    parseErrors: 0,
  };
}

/**
 * Clears all entries from the AST cache.
 *
 * Use this to free memory or reset the cache state.
 *
 * @example
 * ```typescript
 * // Clear the cache
 * clearASTCache();
 *
 * // Verify it's empty
 * console.log(getASTCacheStats().size); // 0
 * ```
 */
export function clearASTCache(): void {
  if (astCache) {
    astCache.clear();
    stats.size = 0;
  }
}

/**
 * Disables the AST cache entirely.
 *
 * After calling this, `parseQueryCached` will always parse fresh.
 * Call `initializeASTCache()` to re-enable.
 *
 * @example
 * ```typescript
 * // Disable caching
 * disableASTCache();
 *
 * // Check if disabled
 * console.log(isASTCacheEnabled()); // false
 * ```
 */
export function disableASTCache(): void {
  astCache = null;
  stats = {
    hits: 0,
    misses: 0,
    size: 0,
    hitRatio: 0,
    parseErrors: 0,
  };
}

/**
 * Returns current AST cache statistics.
 *
 * @returns Cache statistics including hits, misses, and hit ratio
 *
 * @example
 * ```typescript
 * initializeASTCache({ trackStats: true });
 *
 * // After some operations
 * const stats = getASTCacheStats();
 * console.log(`Hit ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);
 * console.log(`Cache size: ${stats.size}`);
 * ```
 */
export function getASTCacheStats(): ASTCacheStats {
  return { ...stats };
}

/**
 * Checks if the AST cache is currently enabled.
 *
 * @returns true if caching is enabled, false otherwise
 *
 * @example
 * ```typescript
 * if (isASTCacheEnabled()) {
 *   console.log('AST caching is active');
 * }
 * ```
 */
export function isASTCacheEnabled(): boolean {
  return astCache !== null;
}

// ============================================================================
// Core Caching Functions
// ============================================================================

/**
 * Parses a GraphQL query string with caching.
 *
 * If the query has been parsed before and is still in the cache,
 * returns the cached AST. Otherwise, parses the query and caches
 * the result.
 *
 * @param query - The GraphQL query string to parse
 * @returns The parsed DocumentNode AST
 * @throws GraphQLError if the query has syntax errors
 *
 * @example
 * ```typescript
 * import { parseQueryCached } from 'graphql-query-builder';
 *
 * // First call: parses and caches
 * const ast1 = parseQueryCached('query { user { id name } }');
 *
 * // Second call: returns cached AST (much faster)
 * const ast2 = parseQueryCached('query { user { id name } }');
 *
 * console.log(ast1 === ast2); // true (same reference)
 * ```
 */
export function parseQueryCached(query: string): DocumentNode {
  // If cache is disabled, just parse directly
  if (!astCache) {
    return parse(query);
  }

  const normalizedQuery = normalizeQueryString(query);
  const now = Date.now();

  // Check cache
  const entry = astCache.get(normalizedQuery);

  if (entry) {
    // Check if entry is still valid (not expired)
    if (now - entry.createdAt < cacheConfig.ttl) {
      // Update access metadata
      entry.lastAccessedAt = now;
      entry.accessCount++;

      // Track stats
      if (cacheConfig.trackStats) {
        stats.hits++;
        updateHitRatio();
      }

      return entry.ast;
    }

    // Entry expired, remove it
    astCache.delete(normalizedQuery);
  }

  // Track miss
  if (cacheConfig.trackStats) {
    stats.misses++;
    updateHitRatio();
  }

  // Parse the query
  const ast = parse(query);

  // Add to cache
  setCachedAST(normalizedQuery, ast);

  return ast;
}

/**
 * Retrieves a cached AST if it exists and is not expired.
 *
 * @param query - The query string to look up
 * @returns The cached AST or undefined if not found/expired
 *
 * @example
 * ```typescript
 * const cachedAst = getCachedAST('query { user { id } }');
 * if (cachedAst) {
 *   console.log('Cache hit!');
 * }
 * ```
 */
export function getCachedAST(query: string): DocumentNode | undefined {
  if (!astCache) {
    return undefined;
  }

  const normalizedQuery = normalizeQueryString(query);
  const entry = astCache.get(normalizedQuery);

  if (!entry) {
    return undefined;
  }

  // Check if expired
  if (Date.now() - entry.createdAt >= cacheConfig.ttl) {
    astCache.delete(normalizedQuery);
    return undefined;
  }

  return entry.ast;
}

/**
 * Manually sets a cached AST for a query string.
 *
 * This is useful when you've already parsed a query elsewhere
 * and want to cache it for future use.
 *
 * @param query - The query string (used as cache key)
 * @param ast - The parsed AST to cache
 *
 * @example
 * ```typescript
 * import { parse } from 'graphql';
 * import { setCachedAST } from 'graphql-query-builder';
 *
 * const query = 'query { user { id } }';
 * const ast = parse(query);
 * setCachedAST(query, ast);
 * ```
 */
export function setCachedAST(query: string, ast: DocumentNode): void {
  if (!astCache) {
    return;
  }

  const normalizedQuery = normalizeQueryString(query);

  // Evict if at capacity
  if (astCache.size >= cacheConfig.maxSize && !astCache.has(normalizedQuery)) {
    evictLeastRecentlyUsed();
  }

  const now = Date.now();
  astCache.set(normalizedQuery, {
    ast,
    createdAt: now,
    lastAccessedAt: now,
    accessCount: 1,
  });

  stats.size = astCache.size;
}

// ============================================================================
// Query Validation Functions
// ============================================================================

/**
 * Validates the syntax of a GraphQL query string.
 *
 * Attempts to parse the query and returns validation result.
 * Uses caching if enabled.
 *
 * @param query - The query string to validate
 * @returns Validation result with success status and any errors
 *
 * @example
 * ```typescript
 * import { validateQuerySyntax } from 'graphql-query-builder';
 *
 * // Valid query
 * const result1 = validateQuerySyntax('query { user { id } }');
 * console.log(result1.valid); // true
 *
 * // Invalid query
 * const result2 = validateQuerySyntax('query { user { }');
 * console.log(result2.valid); // false
 * console.log(result2.errors); // ['Syntax Error: ...']
 * ```
 */
export function validateQuerySyntax(query: string): SyntaxValidationResult {
  try {
    const ast = parseQueryCached(query);
    return {
      valid: true,
      ast,
      errors: [],
    };
  } catch (error) {
    // Track parse error stats
    if (cacheConfig.trackStats) {
      stats.parseErrors++;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      errors: [errorMessage],
    };
  }
}

/**
 * Validates a built query object for syntax errors.
 *
 * Convenience function that extracts the query string from a BuiltQuery
 * and validates it.
 *
 * @param builtQuery - The built query to validate
 * @returns Validation result with success status and any errors
 *
 * @example
 * ```typescript
 * import { buildQuery, validateBuiltQuerySyntax } from 'graphql-query-builder';
 *
 * const builtQuery = buildQuery('user', fields, { operationName: 'GetUser' });
 *
 * const result = validateBuiltQuerySyntax(builtQuery);
 * if (!result.valid) {
 *   console.error('Invalid query generated:', result.errors);
 * }
 * ```
 */
export function validateBuiltQuerySyntax(builtQuery: BuiltQuery): SyntaxValidationResult {
  return validateQuerySyntax(builtQuery.query);
}

/**
 * Parses and validates a query, throwing on syntax errors.
 *
 * Similar to parseQueryCached but provides a clearer error message
 * context for debugging.
 *
 * @param query - The query string to parse
 * @param context - Optional context string for error messages
 * @returns The parsed DocumentNode AST
 * @throws Error with detailed message if parsing fails
 *
 * @example
 * ```typescript
 * import { parseQueryOrThrow } from 'graphql-query-builder';
 *
 * try {
 *   const ast = parseQueryOrThrow(query, 'UserService.getUser');
 *   // Use ast...
 * } catch (error) {
 *   // Error message includes context
 * }
 * ```
 */
export function parseQueryOrThrow(query: string, context?: string): DocumentNode {
  const result = validateQuerySyntax(query);

  if (!result.valid) {
    const contextStr = context ? ` (${context})` : '';
    throw new Error(`GraphQL syntax error${contextStr}: ${result.errors.join(', ')}`);
  }

  return result.ast!;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalizes a query string for consistent cache keys.
 *
 * Removes extra whitespace and normalizes formatting to ensure
 * equivalent queries share the same cache entry.
 */
function normalizeQueryString(query: string): string {
  return query
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/\s*{\s*/g, ' { ') // Normalize braces
    .replace(/\s*}\s*/g, ' } ')
    .replace(/\s*:\s*/g, ': ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .trim();
}

/**
 * Updates the hit ratio statistic.
 */
function updateHitRatio(): void {
  const total = stats.hits + stats.misses;
  stats.hitRatio = total > 0 ? stats.hits / total : 0;
}

/**
 * Evicts the least recently used cache entry.
 */
function evictLeastRecentlyUsed(): void {
  if (!astCache || astCache.size === 0) {
    return;
  }

  let lruKey: string | null = null;
  let lruAccessCount = Number.POSITIVE_INFINITY;
  let lruTimestamp = Number.POSITIVE_INFINITY;

  for (const [key, entry] of astCache.entries()) {
    // Prefer evicting entries with fewer accesses, then older entries
    if (
      entry.accessCount < lruAccessCount ||
      (entry.accessCount === lruAccessCount && entry.lastAccessedAt < lruTimestamp)
    ) {
      lruKey = key;
      lruAccessCount = entry.accessCount;
      lruTimestamp = entry.lastAccessedAt;
    }
  }

  if (lruKey) {
    astCache.delete(lruKey);
    stats.size = astCache.size;
  }
}

/**
 * Preloads queries into the AST cache.
 *
 * Use this to warm up the cache with commonly used queries
 * at application startup.
 *
 * @param queries - Array of query strings to preload
 * @returns Object with counts of successful and failed parses
 *
 * @example
 * ```typescript
 * import { initializeASTCache, preloadQueries } from 'graphql-query-builder';
 *
 * // Initialize cache
 * initializeASTCache({ maxSize: 1000 });
 *
 * // Preload common queries at startup
 * const result = preloadQueries([
 *   'query GetUser($id: ID!) { user(id: $id) { id name email } }',
 *   'query ListUsers { users { id name } }',
 *   'mutation UpdateUser($id: ID!, $input: UserInput!) { updateUser(id: $id, input: $input) { id } }',
 * ]);
 *
 * console.log(`Preloaded ${result.success} queries, ${result.failed} failed`);
 * ```
 */
export function preloadQueries(queries: string[]): { success: number; failed: number } {
  let success = 0;
  let failed = 0;

  for (const query of queries) {
    const result = validateQuerySyntax(query);
    if (result.valid) {
      success++;
    } else {
      failed++;
    }
  }

  return { success, failed };
}
