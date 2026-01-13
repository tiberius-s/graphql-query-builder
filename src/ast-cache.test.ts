/**
 * graphql-query-builder
 *
 * Unit tests for the AST cache module.
 */

import { parse } from 'graphql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearASTCache,
  disableASTCache,
  getASTCacheStats,
  getCachedAST,
  initializeASTCache,
  isASTCacheEnabled,
  parseQueryCached,
  parseQueryOrThrow,
  preloadQueries,
  setCachedAST,
  validateBuiltQuerySyntax,
  validateQuerySyntax,
} from './ast-cache.js';
import { buildQuery } from './builder.js';
import type { FieldSelection } from './extractor.js';

describe('AST Cache Module', () => {
  beforeEach(() => {
    disableASTCache();
  });

  afterEach(() => {
    disableASTCache();
  });

  describe('initializeASTCache', () => {
    it('should enable the cache', () => {
      expect(isASTCacheEnabled()).toBe(false);
      initializeASTCache();
      expect(isASTCacheEnabled()).toBe(true);
    });

    it('should accept custom configuration', () => {
      initializeASTCache({
        maxSize: 100,
        ttl: 5000,
        trackStats: true,
      });
      expect(isASTCacheEnabled()).toBe(true);
    });

    it('should reset stats when reinitialized', () => {
      initializeASTCache({ trackStats: true });

      parseQueryCached('query { user { id } }');
      parseQueryCached('query { user { id } }'); // cache hit

      const statsBefore = getASTCacheStats();
      expect(statsBefore.hits).toBe(1);

      initializeASTCache({ trackStats: true });

      const statsAfter = getASTCacheStats();
      expect(statsAfter.hits).toBe(0);
      expect(statsAfter.size).toBe(0);
    });
  });

  describe('clearASTCache', () => {
    it('should clear all cached entries', () => {
      initializeASTCache();

      parseQueryCached('query Q1 { user { id } }');
      parseQueryCached('query Q2 { user { name } }');

      clearASTCache();

      expect(getCachedAST('query Q1 { user { id } }')).toBeUndefined();
      expect(getCachedAST('query Q2 { user { name } }')).toBeUndefined();
    });

    it('should update stats size', () => {
      initializeASTCache({ trackStats: true });

      parseQueryCached('query { user { id } }');
      expect(getASTCacheStats().size).toBe(1);

      clearASTCache();
      expect(getASTCacheStats().size).toBe(0);
    });
  });

  describe('disableASTCache', () => {
    it('should disable the cache', () => {
      initializeASTCache();
      expect(isASTCacheEnabled()).toBe(true);

      disableASTCache();
      expect(isASTCacheEnabled()).toBe(false);
    });

    it('should reset stats', () => {
      initializeASTCache({ trackStats: true });

      parseQueryCached('query { user { id } }');
      parseQueryCached('query { user { id } }');

      disableASTCache();

      const stats = getASTCacheStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('parseQueryCached', () => {
    it('should parse a valid query', () => {
      initializeASTCache();

      const ast = parseQueryCached('query { user { id name } }');

      expect(ast).toBeDefined();
      expect(ast.kind).toBe('Document');
    });

    it('should cache and return the same AST on subsequent calls', () => {
      initializeASTCache({ trackStats: true });

      const query = 'query { user { id name } }';
      const ast1 = parseQueryCached(query);
      const ast2 = parseQueryCached(query);

      expect(ast1).toBe(ast2); // Same reference
      expect(getASTCacheStats().hits).toBe(1);
    });

    it('should work without cache enabled', () => {
      // Cache disabled by default
      const ast = parseQueryCached('query { user { id } }');
      expect(ast).toBeDefined();
    });

    it('should throw on invalid syntax', () => {
      initializeASTCache();

      expect(() => parseQueryCached('query { user {')).toThrow();
    });

    it('should normalize whitespace for cache keys', () => {
      initializeASTCache({ trackStats: true });

      const ast1 = parseQueryCached('query { user { id } }');
      const ast2 = parseQueryCached('query   {   user   {   id   }   }');

      expect(ast1).toBe(ast2);
      expect(getASTCacheStats().hits).toBe(1);
    });

    it('should track misses', () => {
      initializeASTCache({ trackStats: true });

      parseQueryCached('query Q1 { user { id } }');
      parseQueryCached('query Q2 { user { name } }');
      parseQueryCached('query Q3 { user { email } }');

      const stats = getASTCacheStats();
      expect(stats.misses).toBe(3);
      expect(stats.hits).toBe(0);
    });

    it('should calculate hit ratio correctly', () => {
      initializeASTCache({ trackStats: true });

      const query = 'query { user { id } }';
      parseQueryCached(query); // miss
      parseQueryCached(query); // hit
      parseQueryCached(query); // hit
      parseQueryCached('query { other { id } }'); // miss

      const stats = getASTCacheStats();
      expect(stats.hitRatio).toBeCloseTo(0.5, 2); // 2 hits / 4 total
    });
  });

  describe('getCachedAST and setCachedAST', () => {
    it('should manually set and retrieve cached ASTs', () => {
      initializeASTCache();

      const query = 'query { user { id } }';
      const ast = parse(query);

      setCachedAST(query, ast);

      const cached = getCachedAST(query);
      expect(cached).toBe(ast);
    });

    it('should return undefined for uncached queries', () => {
      initializeASTCache();
      expect(getCachedAST('query { nonexistent { id } }')).toBeUndefined();
    });

    it('should return undefined when cache is disabled', () => {
      const ast = parse('query { user { id } }');
      setCachedAST('query { user { id } }', ast);
      expect(getCachedAST('query { user { id } }')).toBeUndefined();
    });

    it('should evict LRU entries when at capacity', () => {
      initializeASTCache({ maxSize: 2 });

      parseQueryCached('query Q1 { a { id } }');
      parseQueryCached('query Q2 { b { id } }');

      // Access Q2 to make Q1 the LRU
      parseQueryCached('query Q2 { b { id } }');

      // This should evict Q1
      parseQueryCached('query Q3 { c { id } }');

      expect(getCachedAST('query Q1 { a { id } }')).toBeUndefined();
      expect(getCachedAST('query Q2 { b { id } }')).toBeDefined();
      expect(getCachedAST('query Q3 { c { id } }')).toBeDefined();
    });

    it('should expire entries based on TTL', async () => {
      initializeASTCache({ ttl: 50, trackStats: true });

      const query = 'query { user { id } }';
      parseQueryCached(query);
      expect(getCachedAST(query)).toBeDefined();

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(getCachedAST(query)).toBeUndefined();
    });
  });

  describe('validateQuerySyntax', () => {
    it('should validate a correct query', () => {
      initializeASTCache();

      const result = validateQuerySyntax('query { user { id name } }');

      expect(result.valid).toBe(true);
      expect(result.ast).toBeDefined();
      expect(result.errors).toHaveLength(0);
    });

    it('should detect syntax errors', () => {
      initializeASTCache();

      const result = validateQuerySyntax('query { user { }');

      expect(result.valid).toBe(false);
      expect(result.ast).toBeUndefined();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Syntax Error');
    });

    it('should track parse errors in stats', () => {
      initializeASTCache({ trackStats: true });

      validateQuerySyntax('query { user { }'); // invalid
      validateQuerySyntax('query { }'); // invalid
      validateQuerySyntax('query { user { id } }'); // valid

      const stats = getASTCacheStats();
      expect(stats.parseErrors).toBe(2);
    });

    it('should validate queries with variables', () => {
      initializeASTCache();

      const result = validateQuerySyntax(`
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            name
            email
          }
        }
      `);

      expect(result.valid).toBe(true);
    });

    it('should validate mutations', () => {
      initializeASTCache();

      const result = validateQuerySyntax(`
        mutation UpdateUser($id: ID!, $input: UserInput!) {
          updateUser(id: $id, input: $input) {
            id
            name
          }
        }
      `);

      expect(result.valid).toBe(true);
    });
  });

  describe('validateBuiltQuerySyntax', () => {
    it('should validate a built query', () => {
      initializeASTCache();

      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'name', path: ['name'], depth: 1 },
      ];

      const builtQuery = buildQuery('user', fields, { operationName: 'GetUser' });
      const result = validateBuiltQuerySyntax(builtQuery);

      expect(result.valid).toBe(true);
      expect(result.ast).toBeDefined();
    });
  });

  describe('parseQueryOrThrow', () => {
    it('should return AST for valid queries', () => {
      initializeASTCache();

      const ast = parseQueryOrThrow('query { user { id } }');
      expect(ast).toBeDefined();
      expect(ast.kind).toBe('Document');
    });

    it('should throw on invalid queries', () => {
      initializeASTCache();

      expect(() => parseQueryOrThrow('query { user {')).toThrow('GraphQL syntax error');
    });

    it('should include context in error message', () => {
      initializeASTCache();

      expect(() => parseQueryOrThrow('query { user {', 'UserService.getUser')).toThrow(
        'UserService.getUser',
      );
    });
  });

  describe('preloadQueries', () => {
    it('should preload valid queries', () => {
      initializeASTCache();

      const result = preloadQueries([
        'query GetUser { user { id name } }',
        'query ListUsers { users { id } }',
        'mutation UpdateUser { updateUser { id } }',
      ]);

      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);
      expect(getASTCacheStats().size).toBe(3);
    });

    it('should track failed parses', () => {
      initializeASTCache();

      const result = preloadQueries([
        'query GetUser { user { id } }', // valid
        'query { invalid {', // invalid
        'query ListUsers { users { id } }', // valid
      ]);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(1);
    });

    it('should work with empty array', () => {
      initializeASTCache();

      const result = preloadQueries([]);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
    });
  });
});
