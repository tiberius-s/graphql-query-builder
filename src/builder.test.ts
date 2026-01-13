/**
 * graphql-query-builder
 *
 * Unit tests for the builder module.
 */

import { describe, expect, it } from 'vitest';
import {
  buildMutation,
  buildQuery,
  buildQueryFromPaths,
  buildSelectionSetFromPaths,
} from './builder.js';
import type { FieldSelection } from './extractor.js';

describe('Builder Module', () => {
  describe('buildQuery', () => {
    it('should build a simple query from field selections', () => {
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'email', path: ['email'], depth: 1 },
      ];

      const result = buildQuery('user', fields, {
        operationName: 'GetUser',
      });

      expect(result.query).toContain('query GetUser');
      expect(result.query).toContain('user');
      expect(result.query).toContain('id');
      expect(result.query).toContain('email');
      expect(result.operationName).toBe('GetUser');
    });

    it('should use default operation name', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const result = buildQuery('user', fields);

      expect(result.query).toContain('query UpstreamQuery');
      expect(result.operationName).toBe('UpstreamQuery');
    });

    it('should include required fields', () => {
      const fields: FieldSelection[] = [{ name: 'email', path: ['email'], depth: 1 }];

      const result = buildQuery('user', fields, {
        requiredFields: ['id', '__typename'],
      });

      expect(result.query).toContain('id');
      expect(result.query).toContain('__typename');
      expect(result.query).toContain('email');
    });

    it('should apply field mappings', () => {
      const fields: FieldSelection[] = [{ name: 'email', path: ['email'], depth: 1 }];

      const result = buildQuery('user', fields, {
        fieldMappings: { email: 'emailAddress' },
      });

      expect(result.query).toContain('emailAddress');
    });

    it('should handle nested selections', () => {
      const fields: FieldSelection[] = [
        {
          name: 'profile',
          path: ['profile'],
          depth: 1,
          selections: [
            { name: 'firstName', path: ['profile', 'firstName'], depth: 2 },
            { name: 'lastName', path: ['profile', 'lastName'], depth: 2 },
          ],
        },
      ];

      const result = buildQuery('user', fields);

      expect(result.query).toContain('profile');
      expect(result.query).toContain('firstName');
      expect(result.query).toContain('lastName');
      expect(result.metadata.depth).toBe(2);
    });

    it('should handle field aliases', () => {
      const fields: FieldSelection[] = [
        { name: 'id', alias: 'userId', path: ['userId'], depth: 1 },
      ];

      const result = buildQuery('user', fields);

      expect(result.query).toContain('userId: id');
    });

    it('should handle field arguments', () => {
      const fields: FieldSelection[] = [
        {
          name: 'posts',
          path: ['posts'],
          depth: 1,
          arguments: { first: 10, after: 'cursor123' },
          selections: [{ name: 'title', path: ['posts', 'title'], depth: 2 }],
        },
      ];

      const result = buildQuery('user', fields);

      expect(result.query).toContain('posts(first: 10');
      expect(result.query).toContain('"cursor123"');
    });

    it('should include variables in metadata', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const result = buildQuery('user', fields, {
        variables: { id: '123' },
      });

      expect(result.variables).toEqual({ id: '123' });
      expect(result.metadata.hasVariables).toBe(true);
    });

    it('should calculate correct field count', () => {
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'name', path: ['name'], depth: 1 },
        {
          name: 'profile',
          path: ['profile'],
          depth: 1,
          selections: [{ name: 'bio', path: ['profile', 'bio'], depth: 2 }],
        },
      ];

      const result = buildQuery('user', fields);

      expect(result.metadata.fieldCount).toBe(4); // id, name, profile, bio
    });

    it('should format query when pretty is enabled', () => {
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'name', path: ['name'], depth: 1 },
      ];

      const result = buildQuery('user', fields, {
        pretty: true,
      });

      // Pretty formatting should include newlines
      expect(result.query.split('\n').length).toBeGreaterThan(1);
    });

    it('should handle empty fields array', () => {
      const result = buildQuery('user', []);

      expect(result.query).toContain('query');
      expect(result.query).toContain('user');
      expect(result.metadata.fieldCount).toBe(0);
    });

    it('should handle deeply nested selections', () => {
      const fields: FieldSelection[] = [
        {
          name: 'level1',
          path: ['level1'],
          depth: 1,
          selections: [
            {
              name: 'level2',
              path: ['level1', 'level2'],
              depth: 2,
              selections: [
                {
                  name: 'level3',
                  path: ['level1', 'level2', 'level3'],
                  depth: 3,
                  selections: [
                    { name: 'value', path: ['level1', 'level2', 'level3', 'value'], depth: 4 },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const result = buildQuery('root', fields);

      expect(result.query).toContain('level1');
      expect(result.query).toContain('level2');
      expect(result.query).toContain('level3');
      expect(result.query).toContain('value');
      expect(result.metadata.depth).toBe(4);
    });
  });

  describe('buildMutation', () => {
    it('should build a simple mutation', () => {
      const returnFields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'success', path: ['success'], depth: 1 },
      ];

      const result = buildMutation(
        'createUser',
        { name: 'John', email: 'john@example.com' },
        returnFields,
        { operationName: 'CreateUser' },
      );

      expect(result.query).toContain('mutation CreateUser');
      expect(result.query).toContain('createUser');
      expect(result.query).toContain('name:');
      expect(result.query).toContain('"John"');
      expect(result.query).toContain('id');
      expect(result.query).toContain('success');
    });

    it('should use default operation name', () => {
      const returnFields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const result = buildMutation('updateUser', { id: '123' }, returnFields);

      expect(result.query).toContain('mutation UpstreamQuery');
    });

    it('should handle nested input objects', () => {
      const returnFields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const result = buildMutation(
        'createUser',
        {
          input: {
            profile: {
              firstName: 'John',
              lastName: 'Doe',
            },
          },
        },
        returnFields,
      );

      expect(result.query).toContain('input:');
      expect(result.query).toContain('profile:');
      expect(result.query).toContain('firstName:');
    });
  });

  describe('buildQueryFromPaths', () => {
    it('should build a query from field paths', () => {
      const paths = ['id', 'email', 'profile.firstName', 'profile.lastName'];

      const result = buildQueryFromPaths('user', paths);

      expect(result.query).toContain('id');
      expect(result.query).toContain('email');
      expect(result.query).toContain('profile');
      expect(result.query).toContain('firstName');
      expect(result.query).toContain('lastName');
    });

    it('should handle deeply nested paths', () => {
      const paths = ['address.city.name', 'address.city.country.code'];

      const result = buildQueryFromPaths('location', paths);

      expect(result.query).toContain('address');
      expect(result.query).toContain('city');
      expect(result.query).toContain('name');
      expect(result.query).toContain('country');
      expect(result.query).toContain('code');
    });

    it('should include variables', () => {
      const paths = ['id', 'name'];

      const result = buildQueryFromPaths('user', paths, {
        variables: { userId: '123' },
        operationName: 'GetUser',
      });

      expect(result.variables).toEqual({ userId: '123' });
      expect(result.operationName).toBe('GetUser');
    });

    it('should handle single field path', () => {
      const paths = ['id'];

      const result = buildQueryFromPaths('user', paths);

      expect(result.query).toContain('id');
      expect(result.metadata.fieldCount).toBe(1);
    });

    it('should handle empty paths array', () => {
      const result = buildQueryFromPaths('user', []);

      expect(result.query).toContain('user');
      expect(result.metadata.fieldCount).toBe(0);
    });
  });

  describe('buildSelectionSetFromPaths', () => {
    it('should build a selection set string', () => {
      const paths = ['id', 'name', 'address.city'];

      const result = buildSelectionSetFromPaths(paths);

      expect(result).toContain('id');
      expect(result).toContain('name');
      expect(result).toContain('address');
      expect(result).toContain('city');
    });

    it('should return empty string for empty paths', () => {
      const result = buildSelectionSetFromPaths([]);

      expect(result).toBe('');
    });

    it('should handle nested paths correctly', () => {
      const paths = ['user.profile.avatar.url'];

      const result = buildSelectionSetFromPaths(paths);

      expect(result).toContain('user');
      expect(result).toContain('profile');
      expect(result).toContain('avatar');
      expect(result).toContain('url');
    });
  });

  describe('Edge cases for value formatting', () => {
    it('should handle null arguments', () => {
      const fields: FieldSelection[] = [
        {
          name: 'user',
          path: ['user'],
          depth: 1,
          arguments: { filter: null },
          selections: [{ name: 'id', path: ['user', 'id'], depth: 2 }],
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
          arguments: { active: true, verified: false },
          selections: [{ name: 'id', path: ['users', 'id'], depth: 2 }],
        },
      ];

      const result = buildQuery('query', fields);

      expect(result.query).toContain('active: true');
      expect(result.query).toContain('verified: false');
    });

    it('should handle array arguments', () => {
      const fields: FieldSelection[] = [
        {
          name: 'users',
          path: ['users'],
          depth: 1,
          arguments: { ids: ['1', '2', '3'] },
          selections: [{ name: 'id', path: ['users', 'id'], depth: 2 }],
        },
      ];

      const result = buildQuery('query', fields);

      expect(result.query).toContain('ids: ["1", "2", "3"]');
    });

    it('should handle object arguments', () => {
      const fields: FieldSelection[] = [
        {
          name: 'users',
          path: ['users'],
          depth: 1,
          arguments: { filter: { name: 'John', age: 30 } },
          selections: [{ name: 'id', path: ['users', 'id'], depth: 2 }],
        },
      ];

      const result = buildQuery('query', fields);

      expect(result.query).toContain('filter: { name: "John", age: 30 }');
    });

    it('should handle strings with special characters', () => {
      const fields: FieldSelection[] = [
        {
          name: 'search',
          path: ['search'],
          depth: 1,
          arguments: { query: 'Hello "World"' },
          selections: [{ name: 'id', path: ['search', 'id'], depth: 2 }],
        },
      ];

      const result = buildQuery('query', fields);

      // Strings should be JSON-escaped
      expect(result.query).toContain('"Hello \\"World\\""');
    });

    it('should handle numeric arguments', () => {
      const fields: FieldSelection[] = [
        {
          name: 'items',
          path: ['items'],
          depth: 1,
          arguments: { first: 10, skip: 0, minPrice: 9.99 },
          selections: [{ name: 'id', path: ['items', 'id'], depth: 2 }],
        },
      ];

      const result = buildQuery('query', fields);

      expect(result.query).toContain('first: 10');
      expect(result.query).toContain('skip: 0');
      expect(result.query).toContain('minPrice: 9.99');
    });

    it('should handle variable references in arguments', () => {
      const fields: FieldSelection[] = [
        {
          name: 'user',
          path: ['user'],
          depth: 1,
          arguments: { id: { __variable: 'userId' } },
          selections: [{ name: 'name', path: ['user', 'name'], depth: 2 }],
        },
      ];

      const result = buildQuery('query', fields, {
        variables: { userId: '123' },
      });

      expect(result.query).toContain('$userId');
      expect(result.query).toContain('id: $userId');
    });

    it('should handle pretty formatted output with strings', () => {
      const fields: FieldSelection[] = [
        {
          name: 'user',
          path: ['user'],
          depth: 1,
          arguments: { name: 'Test "User"' },
          selections: [
            { name: 'id', path: ['user', 'id'], depth: 2 },
            { name: 'email', path: ['user', 'email'], depth: 2 },
          ],
        },
      ];

      const result = buildQuery('query', fields, {
        pretty: true,
      });

      // Should maintain proper formatting with strings
      expect(result.query).toContain('user');
      expect(result.query.split('\n').length).toBeGreaterThan(1);
    });
  });
});
