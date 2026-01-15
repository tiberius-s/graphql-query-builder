/**
 * Unit tests for the extractor module.
 */

import type { GraphQLResolveInfo } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { extractFieldsFromInfo, getRequestedFieldNames, isFieldRequested } from './extractor.js';

// Mock graphql-parse-resolve-info
vi.mock('graphql-parse-resolve-info', () => ({
  parseResolveInfo: vi.fn((info: GraphQLResolveInfo) => {
    // Return a mock ResolveTree based on info.fieldName
    if (info.fieldName === 'user') {
      return {
        name: 'user',
        alias: 'user',
        fieldsByTypeName: {
          User: {
            id: { name: 'id', alias: 'id', args: {}, fieldsByTypeName: {} },
            email: { name: 'email', alias: 'email', args: {}, fieldsByTypeName: {} },
            profile: {
              name: 'profile',
              alias: 'profile',
              args: {},
              fieldsByTypeName: {
                Profile: {
                  bio: { name: 'bio', alias: 'bio', args: {}, fieldsByTypeName: {} },
                  avatar: { name: 'avatar', alias: 'avatar', args: {}, fieldsByTypeName: {} },
                },
              },
            },
          },
        },
      };
    }
    if (info.fieldName === 'empty') {
      return null;
    }
    return {
      name: info.fieldName,
      alias: info.fieldName,
      fieldsByTypeName: {
        Query: {
          id: { name: 'id', alias: 'id', args: {}, fieldsByTypeName: {} },
        },
      },
    };
  }),
}));

function createMockInfo(fieldName: string): GraphQLResolveInfo {
  return {
    fieldName,
    parentType: { name: 'Query' },
    fieldNodes: [],
    returnType: {} as any,
    path: { key: fieldName, typename: 'Query', prev: undefined },
    schema: {} as any,
    fragments: {},
    rootValue: null,
    operation: {} as any,
    variableValues: {},
  } as GraphQLResolveInfo;
}

describe('Extractor Module', () => {
  describe('extractFieldsFromInfo', () => {
    it('should extract fields from resolver info', () => {
      const info = createMockInfo('user');
      const result = extractFieldsFromInfo(info);

      expect(result.fields).toHaveLength(3);
      expect(result.rootType).toBe('Query');
      expect(result.fieldCount).toBe(5); // id, email, profile, bio, avatar
    });

    it('should handle empty/null parse result', () => {
      const info = createMockInfo('empty');
      const result = extractFieldsFromInfo(info);

      expect(result.fields).toHaveLength(0);
      expect(result.fieldCount).toBe(0);
      expect(result.depth).toBe(0);
    });

    it('should respect maxDepth option', () => {
      const info = createMockInfo('user');
      const result = extractFieldsFromInfo(info, { maxDepth: 1 });

      // Only top-level fields, nested profile fields should be truncated
      expect(result.depth).toBeLessThanOrEqual(1);
    });

    it('should exclude specified fields', () => {
      const info = createMockInfo('user');
      const result = extractFieldsFromInfo(info, { excludeFields: ['email'] });

      const fieldNames = result.fields.map((f) => f.name);
      expect(fieldNames).not.toContain('email');
    });
  });

  describe('getRequestedFieldNames', () => {
    it('should return flat array of field names', () => {
      const info = createMockInfo('user');
      const names = getRequestedFieldNames(info);

      expect(names).toContain('id');
      expect(names).toContain('email');
      expect(names).toContain('profile');
      expect(names).toContain('bio');
      expect(names).toContain('avatar');
    });
  });

  describe('isFieldRequested', () => {
    it('should return true for requested top-level field', () => {
      const info = createMockInfo('user');
      expect(isFieldRequested(info, 'id')).toBe(true);
      expect(isFieldRequested(info, 'email')).toBe(true);
    });

    it('should return true for requested nested field', () => {
      const info = createMockInfo('user');
      expect(isFieldRequested(info, 'profile.bio')).toBe(true);
      expect(isFieldRequested(info, 'profile.avatar')).toBe(true);
    });

    it('should return false for non-requested field', () => {
      const info = createMockInfo('user');
      expect(isFieldRequested(info, 'notRequested')).toBe(false);
      expect(isFieldRequested(info, 'profile.notHere')).toBe(false);
    });
  });
});
