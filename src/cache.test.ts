/**
 * Unit tests for the cache module.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BuiltQuery } from './builder.js';
import {
  clearCache,
  disableCache,
  generateCacheKey,
  getCachedQuery,
  getCacheStats,
  initializeCache,
  isCacheEnabled,
  setCachedQuery,
} from './cache.js';
import type { FieldSelection } from './extractor.js';

describe('Cache Module', () => {
  beforeEach(() => {
    initializeCache({ maxSize: 10 });
  });

  afterEach(() => {
    disableCache();
  });

  describe('initializeCache', () => {
    it('should enable caching', () => {
      expect(isCacheEnabled()).toBe(true);
    });

    it('should reset stats on initialize', () => {
      setCachedQuery('test', mockQuery());
      initializeCache();

      const stats = getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
    });
  });

  describe('clearCache', () => {
    it('should clear all entries', () => {
      setCachedQuery('key1', mockQuery());
      setCachedQuery('key2', mockQuery());

      clearCache();

      expect(getCacheStats().size).toBe(0);
    });
  });

  describe('disableCache', () => {
    it('should disable caching', () => {
      disableCache();
      expect(isCacheEnabled()).toBe(false);
    });

    it('should cause get to return undefined', () => {
      setCachedQuery('key', mockQuery());
      disableCache();

      expect(getCachedQuery('key')).toBeUndefined();
    });
  });

  describe('generateCacheKey', () => {
    it('should generate consistent keys for same inputs', () => {
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'email', path: ['email'], depth: 1 },
      ];

      const key1 = generateCacheKey('user', fields);
      const key2 = generateCacheKey('user', fields);

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

    it('should include alias in key generation', () => {
      const fields1: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1, alias: 'userId' }];
      const fields2: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const key1 = generateCacheKey('user', fields1);
      const key2 = generateCacheKey('user', fields2);

      expect(key1).not.toBe(key2);
    });

    it('should include arguments in key generation', () => {
      const fields1: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1, arguments: { limit: 10 } },
      ];
      const fields2: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 }, // No arguments
      ];

      const key1 = generateCacheKey('user', fields1);
      const key2 = generateCacheKey('user', fields2);

      expect(key1).not.toBe(key2);
    });

    it('should include options in key generation', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const key1 = generateCacheKey('user', fields, { operationName: 'GetUser' });
      const key2 = generateCacheKey('user', fields, { operationName: 'FetchUser' });

      expect(key1).not.toBe(key2);
    });

    it('should include operationType, rootArguments, and variableTypes in key generation', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const base = generateCacheKey('user', fields);
      const differentOperationType = generateCacheKey('user', fields, {
        operationType: 'mutation',
      });
      const differentRootArgs = generateCacheKey('user', fields, {
        rootArguments: { id: { __variable: 'id' } },
      });
      const differentVariableTypes = generateCacheKey('user', fields, {
        variableTypes: { id: 'ID!' },
      });

      expect(base).not.toBe(differentOperationType);
      expect(base).not.toBe(differentRootArgs);
      expect(base).not.toBe(differentVariableTypes);
    });

    it('should include fieldMappings in key generation', () => {
      const fields: FieldSelection[] = [{ name: 'email', path: ['email'], depth: 1 }];

      const key1 = generateCacheKey('user', fields, { fieldMappings: { email: 'emailAddress' } });
      const key2 = generateCacheKey('user', fields, { fieldMappings: { email: 'mail' } });

      expect(key1).not.toBe(key2);
    });

    it('should include requiredFields in key generation', () => {
      const fields: FieldSelection[] = [{ name: 'email', path: ['email'], depth: 1 }];

      const key1 = generateCacheKey('user', fields, { requiredFields: ['id'] });
      const key2 = generateCacheKey('user', fields, { requiredFields: ['id', 'version'] });

      expect(key1).not.toBe(key2);
    });

    it('should include nested selections in key generation', () => {
      const fields1: FieldSelection[] = [
        {
          name: 'profile',
          path: ['profile'],
          depth: 1,
          selections: [{ name: 'bio', path: ['profile', 'bio'], depth: 2 }],
        },
      ];
      const fields2: FieldSelection[] = [
        {
          name: 'profile',
          path: ['profile'],
          depth: 1,
          selections: [{ name: 'avatar', path: ['profile', 'avatar'], depth: 2 }],
        },
      ];

      const key1 = generateCacheKey('user', fields1);
      const key2 = generateCacheKey('user', fields2);

      expect(key1).not.toBe(key2);
    });

    it('should be MD5 hash format', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];
      const key = generateCacheKey('user', fields);

      // MD5 produces 32 character hex string
      expect(key).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe('setCachedQuery / getCachedQuery', () => {
    it('should store and retrieve queries', () => {
      const query = mockQuery();
      setCachedQuery('key', query);

      const retrieved = getCachedQuery('key');

      expect(retrieved).toEqual(query);
    });

    it('should return undefined for non-existent key', () => {
      expect(getCachedQuery('nonexistent')).toBeUndefined();
    });

    it('should track hits and misses', () => {
      setCachedQuery('key', mockQuery());

      getCachedQuery('key'); // hit
      getCachedQuery('key'); // hit
      getCachedQuery('missing'); // miss

      const stats = getCacheStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it('should evict oldest entries when at capacity', () => {
      initializeCache({ maxSize: 3 });

      setCachedQuery('key1', mockQuery());
      setCachedQuery('key2', mockQuery());
      setCachedQuery('key3', mockQuery());
      setCachedQuery('key4', mockQuery()); // Should evict key1

      expect(getCachedQuery('key1')).toBeUndefined();
      expect(getCachedQuery('key4')).toBeDefined();
    });
  });

  describe('getCacheStats', () => {
    it('should return current stats', () => {
      setCachedQuery('key', mockQuery());
      getCachedQuery('key');
      getCachedQuery('missing');

      const stats = getCacheStats();

      expect(stats.size).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRatio).toBe(0.5);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      initializeCache({ maxSize: 10, ttl: 50 });

      setCachedQuery('key', mockQuery());
      expect(getCachedQuery('key')).toBeDefined();

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(getCachedQuery('key')).toBeUndefined();
    });
  });
});

function mockQuery(): BuiltQuery {
  return {
    query: 'query Test { user { id } }',
    variables: {},
    operationName: 'Test',
    metadata: { fieldCount: 1, depth: 1, hasVariables: false },
  };
}
