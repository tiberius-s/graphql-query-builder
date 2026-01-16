/**
 * graphql-query-builder
 *
 * Cache Module
 *
 * Provides LRU caching for built queries to avoid redundant string generation.
 * Uses MD5 hashing for efficient cache key generation.
 */

import { createHash } from 'node:crypto';
import type { BuiltQuery, QueryBuildOptions } from './builder.js';
import type { FieldSelection } from './extractor.js';

/**
 * Cache configuration options.
 */
export interface CacheConfig {
  /** Maximum number of queries to cache (default: 1000) */
  maxSize: number;
  /** Time-to-live in milliseconds, 0 for no expiry (default: 0) */
  ttl: number;
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRatio: number;
}

interface CacheEntry {
  query: BuiltQuery;
  timestamp: number;
}

const DEFAULT_CONFIG: CacheConfig = {
  maxSize: 1000,
  ttl: 0,
};

let cache: Map<string, CacheEntry> | null = null;
let config: CacheConfig = { ...DEFAULT_CONFIG };
let stats: CacheStats = { hits: 0, misses: 0, size: 0, hitRatio: 0 };

/**
 * Initializes the query cache.
 *
 * @example
 * ```typescript
 * initializeCache({ maxSize: 500, ttl: 60000 });
 * ```
 */
export function initializeCache(options: Partial<CacheConfig> = {}): void {
  config = { ...DEFAULT_CONFIG, ...options };
  cache = new Map();
  stats = { hits: 0, misses: 0, size: 0, hitRatio: 0 };
}

/**
 * Clears all cached queries.
 */
export function clearCache(): void {
  cache?.clear();
  stats.size = 0;
}

/**
 * Disables the query cache.
 */
export function disableCache(): void {
  cache = null;
  stats = { hits: 0, misses: 0, size: 0, hitRatio: 0 };
}

/**
 * Checks if caching is enabled.
 */
export function isCacheEnabled(): boolean {
  return cache !== null;
}

/**
 * Gets cache statistics.
 */
export function getCacheStats(): CacheStats {
  return { ...stats };
}

/**
 * Generates an MD5 hash for a cache key.
 */
function md5(input: string): string {
  return createHash('md5').update(input).digest('hex');
}

/**
 * Generates a cache key from field selections and options.
 * Uses MD5 hashing for efficient key generation and comparison.
 */
export function generateCacheKey(
  rootType: string,
  fields: FieldSelection[],
  options: QueryBuildOptions = {},
): string {
  const structure = serializeFields(fields);
  const optionsStr = serializeOptions(options);
  return md5(`${rootType}:${structure}:${optionsStr}`);
}

/**
 * Serializes field selections to a deterministic string.
 */
function serializeFields(fields: FieldSelection[]): string {
  const sorted = [...fields].sort((a, b) => a.name.localeCompare(b.name));
  return sorted.map(serializeField).join(',');
}

function serializeField(field: FieldSelection): string {
  let result = field.name;
  if (field.alias) result = `${field.alias}:${result}`;
  if (field.arguments) {
    const argKeys = Object.keys(field.arguments).sort().join('+');
    result += `(${argKeys})`;
  }
  if (field.selections?.length) {
    result += `{${serializeFields(field.selections)}}`;
  }
  return result;
}

function serializeOptions(options: QueryBuildOptions): string {
  const parts: string[] = [];
  if (options.operationName) parts.push(`op:${options.operationName}`);
  if (options.operationType) parts.push(`type:${options.operationType}`);
  if (options.requiredFields?.length) parts.push(`req:${options.requiredFields.sort().join('+')}`);
  if (options.variableTypes && Object.keys(options.variableTypes).length > 0) {
    const types = Object.entries(options.variableTypes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join('+');
    parts.push(`vars:${types}`);
  }
  if (options.rootArguments && Object.keys(options.rootArguments).length > 0) {
    parts.push(`root:${serializeArguments(options.rootArguments)}`);
  }
  if (options.fieldMappings && Object.keys(options.fieldMappings).length > 0) {
    const mappings = Object.entries(options.fieldMappings)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('+');
    parts.push(`map:${mappings}`);
  }
  return parts.length > 0 ? parts.join('|') : '_';
}

function serializeArguments(args: Record<string, unknown>): string {
  const entries = Object.entries(args).sort(([a], [b]) => a.localeCompare(b));
  return entries
    .map(([key, value]) => `${key}=${serializeArgumentValue(value)}`)
    .join(',');
}

function serializeArgumentValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(serializeArgumentValue).join(',')}]`;
  }

  if (typeof value === 'object' && value !== null) {
    if ('__variable' in value) {
      const v = value as { __variable: unknown };
      return typeof v.__variable === 'string' ? `$${v.__variable}` : '$';
    }

    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([k, v]) => `${k}:${serializeArgumentValue(v)}`).join(',')}}`;
  }

  return JSON.stringify(String(value));
}

/**
 * Gets a cached query if available.
 */
export function getCachedQuery(key: string): BuiltQuery | undefined {
  if (!cache) return undefined;

  const entry = cache.get(key);
  if (!entry) {
    stats.misses++;
    updateHitRatio();
    return undefined;
  }

  // Check TTL
  if (config.ttl > 0 && Date.now() - entry.timestamp > config.ttl) {
    cache.delete(key);
    stats.size = cache.size;
    stats.misses++;
    updateHitRatio();
    return undefined;
  }

  stats.hits++;
  updateHitRatio();
  return entry.query;
}

/**
 * Stores a query in the cache.
 */
export function setCachedQuery(key: string, query: BuiltQuery): void {
  if (!cache) return;

  // Evict oldest entry if at capacity
  if (cache.size >= config.maxSize) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  cache.set(key, { query, timestamp: Date.now() });
  stats.size = cache.size;
}

function updateHitRatio(): void {
  const total = stats.hits + stats.misses;
  stats.hitRatio = total > 0 ? stats.hits / total : 0;
}
