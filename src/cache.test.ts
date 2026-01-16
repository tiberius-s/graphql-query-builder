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

  describe('serializeArgumentValue edge cases', () => {
    it('should handle nested objects with variables', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const key1 = generateCacheKey('user', fields, {
        rootArguments: {
          input: {
            nested: {
              variable: { __variable: 'varName' },
            },
          },
        },
      });

      const key2 = generateCacheKey('user', fields, {
        rootArguments: {
          input: {
            nested: {
              variable: { __variable: 'differentVar' },
            },
          },
        },
      });

      expect(key1).not.toBe(key2);
    });

    it('should handle arrays with nested objects', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const key1 = generateCacheKey('user', fields, {
        rootArguments: {
          items: [{ id: '1' }, { id: '2' }],
        },
      });

      const key2 = generateCacheKey('user', fields, {
        rootArguments: {
          items: [{ id: '1' }, { id: '3' }],
        },
      });

      expect(key1).not.toBe(key2);
    });

    it('should handle mixed types in rootArguments', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const key = generateCacheKey('user', fields, {
        rootArguments: {
          stringVal: 'test',
          numberVal: 42,
          boolVal: true,
          nullVal: null,
          arrayVal: [1, 'two', false],
        },
      });

      expect(key).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should handle variable references with null value', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const key1 = generateCacheKey('user', fields, {
        rootArguments: {
          value: { __variable: null },
        },
      });

      const key2 = generateCacheKey('user', fields, {
        rootArguments: {
          value: { __variable: 'id' },
        },
      });

      expect(key1).not.toBe(key2);
    });

    it('should handle empty objects and arrays', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const key1 = generateCacheKey('user', fields, {
        rootArguments: { obj: {}, arr: [] },
      });

      const key2 = generateCacheKey('user', fields, {
        rootArguments: { obj: { a: 1 }, arr: [1] },
      });

      expect(key1).not.toBe(key2);
    });

    it('should handle deeply nested objects', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const deepObj = {
        level1: {
          level2: {
            level3: {
              value: { __variable: 'deepVar' },
            },
          },
        },
      };

      const key = generateCacheKey('user', fields, {
        rootArguments: deepObj,
      });

      expect(key).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe('serializeOptions with all combinations', () => {
    it('should include all option types in key', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const key = generateCacheKey('user', fields, {
        operationName: 'GetUser',
        operationType: 'mutation',
        variableTypes: { id: 'ID!', input: 'UpdateInput!' },
        rootArguments: { id: { __variable: 'id' }, input: { __variable: 'input' } },
        fieldMappings: { email: 'emailAddress', name: 'fullName' },
        requiredFields: ['id', 'version'],
      });

      expect(key).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should handle empty collections in options', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const key1 = generateCacheKey('user', fields, {
        variableTypes: {},
        rootArguments: {},
        fieldMappings: {},
        requiredFields: [],
      });

      const key2 = generateCacheKey('user', fields, {
        variableTypes: { id: 'ID!' },
      });

      expect(key1).not.toBe(key2);
    });
  });

  describe('cache eviction and TTL edge cases', () => {
    it('should not cache when cache is disabled', () => {
      disableCache();
      setCachedQuery('key', mockQuery());

      // When disabled, cache is null, so setCachedQuery does nothing
      initializeCache({ maxSize: 1 });
      expect(getCachedQuery('key')).toBeUndefined();
    });

    it('should handle multiple TTL expirations', async () => {
      initializeCache({ maxSize: 10, ttl: 30 });

      setCachedQuery('key1', mockQuery());
      setCachedQuery('key2', mockQuery());

      expect(getCachedQuery('key1')).toBeDefined();
      expect(getCachedQuery('key2')).toBeDefined();

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(getCachedQuery('key1')).toBeUndefined();
      expect(getCachedQuery('key2')).toBeUndefined();
    });

    it('should handle cache stats with only misses', () => {
      clearCache();

      getCachedQuery('missing1');
      getCachedQuery('missing2');
      getCachedQuery('missing3');

      const stats = getCacheStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(3);
      expect(stats.hitRatio).toBe(0);
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
