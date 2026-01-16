/**
 * Unit tests for the builder module.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildQuery,
  buildQueryCached,
  buildQueryFromPaths,
  buildQueryFromPathsCached,
} from './builder.js';
import { clearCache, disableCache, initializeCache } from './cache.js';
import { resetConfig } from './config.js';
import type { FieldSelection } from './extractor.js';

describe('Builder Module', () => {
  beforeEach(() => {
    resetConfig();
    initializeCache({ maxSize: 100 });
  });

  afterEach(() => {
    resetConfig();
    clearCache();
  });

  describe('buildQuery', () => {
    it('should build a basic query', () => {
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'email', path: ['email'], depth: 1 },
      ];

      const result = buildQuery('user', fields);

      expect(result.query).toContain('query');
      expect(result.query).toContain('user');
      expect(result.query).toContain('id');
      expect(result.query).toContain('email');
      expect(result.operationName).toBe('UpstreamQuery');
    });

    it('should use custom operation name', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];
      const result = buildQuery('user', fields, { operationName: 'GetUser' });

      expect(result.query).toContain('query GetUser');
      expect(result.operationName).toBe('GetUser');
    });

    it('should include variables in query', () => {
      const fields: FieldSelection[] = [
        {
          name: 'id',
          path: ['id'],
          depth: 1,
          arguments: { id: { __variable: 'userId' } },
        },
      ];

      const result = buildQuery('user', fields, {
        variables: { userId: '123' },
      });

      expect(result.query).toContain('$userId');
      expect(result.variables).toEqual({ userId: '123' });
    });

    it('should support variables on the root field', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const result = buildQuery('user', fields, {
        operationName: 'GetUser',
        variables: { id: '123' },
        rootArguments: { id: { __variable: 'id' } },
      });

      expect(result.query).toContain('query GetUser(');
      expect(result.query).toContain('$id: ID!');
      expect(result.query).toContain('user(id: $id)');
    });

    it('should support mutation operations', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const result = buildQuery('updateProfile', fields, {
        operationType: 'mutation',
        operationName: 'UpdateProfile',
        rootArguments: { input: { firstName: 'Ada' } },
      });

      expect(result.query).toContain('mutation UpdateProfile');
      expect(result.query).toContain('updateProfile(input:');
      expect(result.query).toContain('firstName');
    });

    it('should handle nested field selections', () => {
      const fields: FieldSelection[] = [
        {
          name: 'profile',
          path: ['profile'],
          depth: 1,
          selections: [
            { name: 'bio', path: ['profile', 'bio'], depth: 2 },
            { name: 'avatar', path: ['profile', 'avatar'], depth: 2 },
          ],
        },
      ];

      const result = buildQuery('user', fields);

      expect(result.query).toContain('profile');
      expect(result.query).toContain('bio');
      expect(result.query).toContain('avatar');
      expect(result.metadata.depth).toBe(2);
    });

    it('should apply field mappings', () => {
      const fields: FieldSelection[] = [{ name: 'email', path: ['email'], depth: 1 }];

      const result = buildQuery('user', fields, {
        fieldMappings: { email: 'emailAddress' },
      });

      expect(result.query).toContain('emailAddress');
    });

    it('should handle field with alias and mapping', () => {
      const fields: FieldSelection[] = [
        { name: 'email', alias: 'userEmail', path: ['email'], depth: 1 },
      ];

      const result = buildQuery('user', fields, {
        fieldMappings: { email: 'emailAddress' },
      });

      // Should output: userEmail: emailAddress
      expect(result.query).toContain('userEmail');
      expect(result.query).toContain('emailAddress');
    });

    it('should handle empty fields array', () => {
      const fields: FieldSelection[] = [];

      const result = buildQuery('user', fields);

      expect(result.query).toContain('user');
      expect(result.metadata.fieldCount).toBe(0);
    });

    it('should include required fields', () => {
      const fields: FieldSelection[] = [{ name: 'email', path: ['email'], depth: 1 }];

      const result = buildQuery('user', fields, {
        requiredFields: ['id'],
      });

      expect(result.query).toContain('id');
      expect(result.query).toContain('email');
    });

    it('should calculate correct metadata', () => {
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'email', path: ['email'], depth: 1 },
        {
          name: 'profile',
          path: ['profile'],
          depth: 1,
          selections: [{ name: 'bio', path: ['profile', 'bio'], depth: 2 }],
        },
      ];

      const result = buildQuery('user', fields);

      expect(result.metadata.fieldCount).toBe(4);
      expect(result.metadata.depth).toBe(2);
    });

    it('should handle array arguments', () => {
      const fields: FieldSelection[] = [
        {
          name: 'users',
          path: ['users'],
          depth: 1,
          arguments: { ids: ['1', '2', '3'] },
        },
      ];

      const result = buildQuery('query', fields);

      expect(result.query).toContain('ids:');
      expect(result.query).toContain('"1"');
      expect(result.query).toContain('"2"');
    });

    it('should handle object arguments', () => {
      const fields: FieldSelection[] = [
        {
          name: 'createUser',
          path: ['createUser'],
          depth: 1,
          arguments: { input: { name: 'Test', email: 'test@example.com' } },
        },
      ];

      const result = buildQuery('mutation', fields);

      expect(result.query).toContain('input:');
      expect(result.query).toContain('name:');
      expect(result.query).toContain('"Test"');
    });

    it('should handle null arguments', () => {
      const fields: FieldSelection[] = [
        {
          name: 'users',
          path: ['users'],
          depth: 1,
          arguments: { filter: null },
        },
      ];

      const result = buildQuery('query', fields);

      expect(result.query).toContain('filter: null');
    });

    it('should handle boolean arguments', () => {
      const fields: FieldSelection[] = [
        {
          name: 'users',
          path: ['users'],
          depth: 1,
          arguments: { active: true, archived: false },
        },
      ];

      const result = buildQuery('query', fields);

      expect(result.query).toContain('active: true');
      expect(result.query).toContain('archived: false');
    });

    it('should handle numeric arguments', () => {
      const fields: FieldSelection[] = [
        {
          name: 'products',
          path: ['products'],
          depth: 1,
          arguments: { limit: 10, price: 99.99 },
        },
      ];

      const result = buildQuery('query', fields);

      expect(result.query).toContain('limit: 10');
      expect(result.query).toContain('price: 99.99');
    });

    it('should handle variable references in nested objects', () => {
      const fields: FieldSelection[] = [
        {
          name: 'createUser',
          path: ['createUser'],
          depth: 1,
          arguments: {
            input: { name: 'Test', userId: { __variable: 'id' } },
          },
        },
      ];

      const result = buildQuery('mutation', fields, { variables: { id: '123' } });

      expect(result.query).toContain('$id');
      expect(result.variables).toEqual({ id: '123' });
    });

    it('should infer ID type for UUID variables', () => {
      const fields: FieldSelection[] = [
        {
          name: 'user',
          path: ['user'],
          depth: 1,
          arguments: { id: { __variable: 'userId' } },
        },
      ];

      const result = buildQuery('query', fields, {
        variables: { userId: '550e8400-e29b-41d4-a716-446655440000' },
      });

      expect(result.query).toContain('$userId: ID!');
    });

    it('should infer Float type for decimal variables', () => {
      const fields: FieldSelection[] = [
        {
          name: 'products',
          path: ['products'],
          depth: 1,
          arguments: { minPrice: { __variable: 'price' } },
        },
      ];

      const result = buildQuery('query', fields, { variables: { price: 19.99 } });

      expect(result.query).toContain('$price: Float!');
    });

    it('should infer array type for array variables', () => {
      const fields: FieldSelection[] = [
        {
          name: 'users',
          path: ['users'],
          depth: 1,
          arguments: { ids: { __variable: 'userIds' } },
        },
      ];

      const result = buildQuery('query', fields, { variables: { userIds: ['1', '2', '3'] } });

      expect(result.query).toContain('$userIds: [ID!]');
    });

    it('should handle empty array variables', () => {
      const fields: FieldSelection[] = [
        {
          name: 'users',
          path: ['users'],
          depth: 1,
          arguments: { ids: { __variable: 'userIds' } },
        },
      ];

      const result = buildQuery('query', fields, { variables: { userIds: [] } });

      expect(result.query).toContain('$userIds: [String]');
    });

    it('should infer String type for object variables', () => {
      const fields: FieldSelection[] = [
        {
          name: 'createItem',
          path: ['createItem'],
          depth: 1,
          arguments: { input: { __variable: 'inputData' } },
        },
      ];

      // Object variables default to String type (GraphQL custom scalars)
      const result = buildQuery('mutation', fields, { variables: { inputData: { key: 'value' } } });

      expect(result.query).toContain('$inputData: String');
    });

    it('should format undefined values as string', () => {
      const fields: FieldSelection[] = [
        {
          name: 'item',
          path: ['item'],
          depth: 1,
          arguments: { value: undefined },
        },
      ];

      const result = buildQuery('query', fields);

      expect(result.query).toContain('value: undefined');
    });

    it('should infer String type for null variables', () => {
      const fields: FieldSelection[] = [
        {
          name: 'item',
          path: ['item'],
          depth: 1,
          arguments: { value: { __variable: 'nullVar' } },
        },
      ];

      const result = buildQuery('query', fields, { variables: { nullVar: null } });

      expect(result.query).toContain('$nullVar: String');
    });
  });

  describe('buildQueryCached', () => {
    it('should cache identical queries', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const result1 = buildQueryCached('user', fields);
      const result2 = buildQueryCached('user', fields);

      expect(result1.query).toBe(result2.query);
    });

    it('should return fresh variables with cached query', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      buildQueryCached('user', fields, { variables: { id: '1' } });
      const result2 = buildQueryCached('user', fields, { variables: { id: '2' } });

      expect(result2.variables).toEqual({ id: '2' });
    });

    it('should fallback to buildQuery when cache is disabled', () => {
      disableCache();
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const result = buildQueryCached('user', fields);

      expect(result.query).toContain('user');
      expect(result.query).toContain('id');

      // Re-enable for other tests
      initializeCache({ maxSize: 100 });
    });
  });

  describe('buildQueryFromPaths', () => {
    it('should build query from dot-separated paths', () => {
      const result = buildQueryFromPaths('user', ['id', 'email', 'profile.bio']);

      expect(result.query).toContain('id');
      expect(result.query).toContain('email');
      expect(result.query).toContain('profile');
      expect(result.query).toContain('bio');
    });

    it('should handle deeply nested paths', () => {
      const result = buildQueryFromPaths('user', [
        'profile.settings.theme',
        'profile.settings.language',
      ]);

      expect(result.query).toContain('profile');
      expect(result.query).toContain('settings');
      expect(result.query).toContain('theme');
      expect(result.query).toContain('language');
    });
  });

  describe('buildQueryFromPathsCached', () => {
    it('should cache path-based queries', () => {
      const result1 = buildQueryFromPathsCached('user', ['id', 'email']);
      const result2 = buildQueryFromPathsCached('user', ['id', 'email']);

      expect(result1.query).toBe(result2.query);
    });
  });
});
