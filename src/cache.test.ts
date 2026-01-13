/**
 * graphql-query-builder
 *
 * Unit tests for the cache module.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BuiltQuery } from './builder.js';
import { buildQueryCached, buildQueryFromPathsCached } from './builder.js';
import {
  clearQueryCache,
  disableQueryCache,
  generateCacheKey,
  getCachedQuery,
  getQueryCacheStats,
  initializeQueryCache,
  isQueryCacheEnabled,
  setCachedQuery,
} from './cache.js';
import type { FieldSelection } from './extractor.js';

describe('Query Cache Module', () => {
  beforeEach(() => {
    disableQueryCache();
  });

  afterEach(() => {
    disableQueryCache();
  });

  describe('initializeQueryCache', () => {
    it('should enable the cache', () => {
      expect(isQueryCacheEnabled()).toBe(false);
      initializeQueryCache();
      expect(isQueryCacheEnabled()).toBe(true);
    });

    it('should accept custom configuration', () => {
      initializeQueryCache({
        maxSize: 100,
        ttl: 5000,
        trackStats: true,
      });
      expect(isQueryCacheEnabled()).toBe(true);
    });

    it('should reset stats when reinitialized', () => {
      initializeQueryCache({ trackStats: true });

      const mockQuery: BuiltQuery = {
        query: 'query Test { user { id } }',
        variables: {},
        operationName: 'Test',
        metadata: { fieldCount: 1, depth: 1, hasVariables: false },
      };

      setCachedQuery('test-key', mockQuery);
      getCachedQuery('test-key');

      const statsBefore = getQueryCacheStats();
      expect(statsBefore.hits).toBe(1);

      initializeQueryCache({ trackStats: true });

      const statsAfter = getQueryCacheStats();
      expect(statsAfter.hits).toBe(0);
      expect(statsAfter.size).toBe(0);
    });
  });

  describe('clearQueryCache', () => {
    it('should clear all cached entries', () => {
      initializeQueryCache();

      const mockQuery: BuiltQuery = {
        query: 'query Test { user { id } }',
        variables: {},
        operationName: 'Test',
        metadata: { fieldCount: 1, depth: 1, hasVariables: false },
      };

      setCachedQuery('key1', mockQuery);
      setCachedQuery('key2', mockQuery);

      clearQueryCache();

      expect(getCachedQuery('key1')).toBeUndefined();
      expect(getCachedQuery('key2')).toBeUndefined();
    });

    it('should update stats size', () => {
      initializeQueryCache({ trackStats: true });

      const mockQuery: BuiltQuery = {
        query: 'query Test { user { id } }',
        variables: {},
        operationName: 'Test',
        metadata: { fieldCount: 1, depth: 1, hasVariables: false },
      };

      setCachedQuery('key1', mockQuery);
      expect(getQueryCacheStats().size).toBe(1);

      clearQueryCache();
      expect(getQueryCacheStats().size).toBe(0);
    });
  });

  describe('disableQueryCache', () => {
    it('should disable the cache', () => {
      initializeQueryCache();
      expect(isQueryCacheEnabled()).toBe(true);

      disableQueryCache();
      expect(isQueryCacheEnabled()).toBe(false);
    });

    it('should reset stats', () => {
      initializeQueryCache({ trackStats: true });

      const mockQuery: BuiltQuery = {
        query: 'query Test { user { id } }',
        variables: {},
        operationName: 'Test',
        metadata: { fieldCount: 1, depth: 1, hasVariables: false },
      };

      setCachedQuery('test-key', mockQuery);
      getCachedQuery('test-key');

      disableQueryCache();

      const stats = getQueryCacheStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('generateCacheKey', () => {
    it('should generate consistent keys for same structure', () => {
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'email', path: ['email'], depth: 1 },
      ];

      const key1 = generateCacheKey('user', fields, { operationName: 'GetUser' });
      const key2 = generateCacheKey('user', fields, { operationName: 'GetUser' });

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different fields', () => {
      const fields1: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];
      const fields2: FieldSelection[] = [{ name: 'email', path: ['email'], depth: 1 }];

      const key1 = generateCacheKey('user', fields1);
      const key2 = generateCacheKey('user', fields2);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different root types', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const key1 = generateCacheKey('user', fields);
      const key2 = generateCacheKey('product', fields);

      expect(key1).not.toBe(key2);
    });

    it('should include operation name in key', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const key1 = generateCacheKey('user', fields, { operationName: 'GetUser' });
      const key2 = generateCacheKey('user', fields, { operationName: 'FetchUser' });

      expect(key1).not.toBe(key2);
    });

    it('should include required fields in key', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const key1 = generateCacheKey('user', fields, { requiredFields: ['id'] });
      const key2 = generateCacheKey('user', fields, { requiredFields: ['id', 'name'] });

      expect(key1).not.toBe(key2);
    });

    it('should include field mappings in key', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const key1 = generateCacheKey('user', fields, { fieldMappings: { id: 'userId' } });
      const key2 = generateCacheKey('user', fields, { fieldMappings: { id: 'identifier' } });

      expect(key1).not.toBe(key2);
    });

    it('should handle nested fields', () => {
      const fields: FieldSelection[] = [
        {
          name: 'profile',
          path: ['profile'],
          depth: 1,
          selections: [
            { name: 'avatar', path: ['profile', 'avatar'], depth: 2 },
            { name: 'bio', path: ['profile', 'bio'], depth: 2 },
          ],
        },
      ];

      const key = generateCacheKey('user', fields);
      expect(key).toContain('profile');
    });

    it('should handle fields with arguments', () => {
      const fields: FieldSelection[] = [
        {
          name: 'user',
          path: ['user'],
          depth: 1,
          arguments: { id: '123' },
        },
      ];

      const key = generateCacheKey('query', fields);
      expect(key).toContain('(id)');
    });

    it('should handle fields with aliases', () => {
      const fields: FieldSelection[] = [
        {
          name: 'user',
          alias: 'currentUser',
          path: ['currentUser'],
          depth: 1,
        },
      ];

      const key = generateCacheKey('query', fields);
      expect(key).toContain('currentUser:user');
    });
  });

  describe('getCachedQuery and setCachedQuery', () => {
    it('should cache and retrieve queries', () => {
      initializeQueryCache();

      const mockQuery: BuiltQuery = {
        query: 'query Test { user { id } }',
        variables: {},
        operationName: 'Test',
        metadata: { fieldCount: 1, depth: 1, hasVariables: false },
      };

      setCachedQuery('test-key', mockQuery);

      const cached = getCachedQuery('test-key');
      expect(cached).toEqual(mockQuery);
    });

    it('should return undefined for uncached keys', () => {
      initializeQueryCache();
      expect(getCachedQuery('nonexistent')).toBeUndefined();
    });

    it('should return undefined when cache is disabled', () => {
      const mockQuery: BuiltQuery = {
        query: 'query Test { user { id } }',
        variables: {},
        operationName: 'Test',
        metadata: { fieldCount: 1, depth: 1, hasVariables: false },
      };

      // Cache is disabled by default
      setCachedQuery('test-key', mockQuery);
      expect(getCachedQuery('test-key')).toBeUndefined();
    });

    it('should track cache hits when stats enabled', () => {
      initializeQueryCache({ trackStats: true });

      const mockQuery: BuiltQuery = {
        query: 'query Test { user { id } }',
        variables: {},
        operationName: 'Test',
        metadata: { fieldCount: 1, depth: 1, hasVariables: false },
      };

      setCachedQuery('test-key', mockQuery);
      getCachedQuery('test-key');
      getCachedQuery('test-key');

      const stats = getQueryCacheStats();
      expect(stats.hits).toBe(2);
    });

    it('should track cache misses when stats enabled', () => {
      initializeQueryCache({ trackStats: true });

      getCachedQuery('nonexistent1');
      getCachedQuery('nonexistent2');

      const stats = getQueryCacheStats();
      expect(stats.misses).toBe(2);
    });

    it('should calculate hit ratio correctly', () => {
      initializeQueryCache({ trackStats: true });

      const mockQuery: BuiltQuery = {
        query: 'query Test { user { id } }',
        variables: {},
        operationName: 'Test',
        metadata: { fieldCount: 1, depth: 1, hasVariables: false },
      };

      setCachedQuery('test-key', mockQuery);
      getCachedQuery('test-key'); // hit
      getCachedQuery('test-key'); // hit
      getCachedQuery('miss'); // miss

      const stats = getQueryCacheStats();
      expect(stats.hitRatio).toBeCloseTo(0.666, 2);
    });

    it('should evict LRU entries when at capacity', () => {
      initializeQueryCache({ maxSize: 2 });

      const query1: BuiltQuery = {
        query: 'query Q1 { a }',
        variables: {},
        operationName: 'Q1',
        metadata: { fieldCount: 1, depth: 1, hasVariables: false },
      };

      const query2: BuiltQuery = {
        query: 'query Q2 { b }',
        variables: {},
        operationName: 'Q2',
        metadata: { fieldCount: 1, depth: 1, hasVariables: false },
      };

      const query3: BuiltQuery = {
        query: 'query Q3 { c }',
        variables: {},
        operationName: 'Q3',
        metadata: { fieldCount: 1, depth: 1, hasVariables: false },
      };

      setCachedQuery('key1', query1);
      setCachedQuery('key2', query2);

      // Access key2 to make key1 the LRU
      getCachedQuery('key2');

      // This should evict key1
      setCachedQuery('key3', query3);

      expect(getCachedQuery('key1')).toBeUndefined();
      expect(getCachedQuery('key2')).toBeDefined();
      expect(getCachedQuery('key3')).toBeDefined();
    });

    it('should expire entries based on TTL', async () => {
      initializeQueryCache({ ttl: 50, trackStats: true });

      const mockQuery: BuiltQuery = {
        query: 'query Test { user { id } }',
        variables: {},
        operationName: 'Test',
        metadata: { fieldCount: 1, depth: 1, hasVariables: false },
      };

      setCachedQuery('test-key', mockQuery);
      expect(getCachedQuery('test-key')).toBeDefined();

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(getCachedQuery('test-key')).toBeUndefined();
    });
  });

  describe('buildQueryCached', () => {
    it('should work without cache enabled', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const result = buildQueryCached('user', fields, { operationName: 'GetUser' });

      expect(result.query).toContain('user');
      expect(result.query).toContain('id');
    });

    it('should cache queries when enabled', () => {
      initializeQueryCache({ trackStats: true });

      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      buildQueryCached('user', fields, { operationName: 'GetUser' });
      buildQueryCached('user', fields, { operationName: 'GetUser' });

      const stats = getQueryCacheStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should return fresh variables on cache hit', () => {
      initializeQueryCache();

      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const result1 = buildQueryCached('user', fields, {
        operationName: 'GetUser',
        variables: { id: '1' },
      });

      const result2 = buildQueryCached('user', fields, {
        operationName: 'GetUser',
        variables: { id: '2' },
      });

      expect(result1.variables).toEqual({ id: '1' });
      expect(result2.variables).toEqual({ id: '2' });
      expect(result1.query).toBe(result2.query);
    });
  });

  describe('buildQueryFromPathsCached', () => {
    it('should work without cache enabled', () => {
      const result = buildQueryFromPathsCached('user', ['id', 'email'], {
        operationName: 'GetUser',
      });

      expect(result.query).toContain('user');
      expect(result.query).toContain('id');
      expect(result.query).toContain('email');
    });

    it('should cache queries when enabled', () => {
      initializeQueryCache({ trackStats: true });

      buildQueryFromPathsCached('user', ['id', 'email'], { operationName: 'GetUser' });
      buildQueryFromPathsCached('user', ['id', 'email'], { operationName: 'GetUser' });

      const stats = getQueryCacheStats();
      expect(stats.hits).toBe(1);
    });
  });
});
