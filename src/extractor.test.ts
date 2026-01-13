/**
 * graphql-query-builder
 *
 * Unit tests for the extractor module.
 *
 * Note: The extractor module uses graphql-parse-resolve-info which requires
 * a complete GraphQL schema and proper resolve info objects. We mock the
 * parseResolveInfo function to test the internal logic.
 */

import type { GraphQLResolveInfo } from 'graphql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock graphql-parse-resolve-info before importing extractor
vi.mock('graphql-parse-resolve-info', () => ({
  parseResolveInfo: vi.fn(),
}));

import { parseResolveInfo } from 'graphql-parse-resolve-info';
import * as extractor from './extractor.js';

// Create mock resolve info
function createMockInfo(parentType = 'Query'): GraphQLResolveInfo {
  return {
    fieldNodes: [],
    parentType: { name: parentType } as any,
    fragments: {},
    fieldName: 'test',
    returnType: {} as any,
    path: { key: 'test', prev: undefined, typename: parentType },
    schema: {} as any,
    rootValue: null,
    operation: {} as any,
    variableValues: {},
  } as GraphQLResolveInfo;
}

describe('Extractor Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Module exports', () => {
    it('should export extractFieldsFromInfo function', () => {
      expect(extractor.extractFieldsFromInfo).toBeDefined();
      expect(typeof extractor.extractFieldsFromInfo).toBe('function');
    });

    it('should export getRequestedFieldNames function', () => {
      expect(extractor.getRequestedFieldNames).toBeDefined();
      expect(typeof extractor.getRequestedFieldNames).toBe('function');
    });

    it('should export getFieldStructure function', () => {
      expect(extractor.getFieldStructure).toBeDefined();
      expect(typeof extractor.getFieldStructure).toBe('function');
    });

    it('should export isFieldRequested function', () => {
      expect(extractor.isFieldRequested).toBeDefined();
      expect(typeof extractor.isFieldRequested).toBe('function');
    });
  });

  describe('extractFieldsFromInfo', () => {
    it('should return empty result when parseResolveInfo returns null', () => {
      vi.mocked(parseResolveInfo).mockReturnValue(null);

      const info = createMockInfo();
      const result = extractor.extractFieldsFromInfo(info);

      expect(result.fields).toEqual([]);
      expect(result.rootType).toBe('Query');
      expect(result.fieldCount).toBe(0);
      expect(result.depth).toBe(0);
    });

    it('should extract simple fields', () => {
      vi.mocked(parseResolveInfo).mockReturnValue({
        name: 'user',
        alias: 'user',
        args: {},
        fieldsByTypeName: {
          User: {
            id: {
              name: 'id',
              alias: 'id',
              args: {},
              fieldsByTypeName: {},
            },
            name: {
              name: 'name',
              alias: 'name',
              args: {},
              fieldsByTypeName: {},
            },
          },
        },
      } as any);

      const info = createMockInfo();
      const result = extractor.extractFieldsFromInfo(info);

      expect(result.fields.length).toBe(2);
      expect(result.fields[0].name).toBe('id');
      expect(result.fields[1].name).toBe('name');
      expect(result.fieldCount).toBe(2);
      // Depth is 0 because updateMaxDepth is called with the current depth (0) before processing fields
      expect(result.depth).toBe(0);
    });

    it('should handle nested fields', () => {
      vi.mocked(parseResolveInfo).mockReturnValue({
        name: 'user',
        alias: 'user',
        args: {},
        fieldsByTypeName: {
          User: {
            id: {
              name: 'id',
              alias: 'id',
              args: {},
              fieldsByTypeName: {},
            },
            profile: {
              name: 'profile',
              alias: 'profile',
              args: {},
              fieldsByTypeName: {
                Profile: {
                  bio: {
                    name: 'bio',
                    alias: 'bio',
                    args: {},
                    fieldsByTypeName: {},
                  },
                  avatar: {
                    name: 'avatar',
                    alias: 'avatar',
                    args: {},
                    fieldsByTypeName: {},
                  },
                },
              },
            },
          },
        },
      } as any);

      const info = createMockInfo();
      const result = extractor.extractFieldsFromInfo(info);

      expect(result.fields.length).toBe(2);
      expect(result.fields[1].name).toBe('profile');
      expect(result.fields[1].selections?.length).toBe(2);
      // Depth is 1 because nested fields go one level deeper (depth 1 when processing nested)
      expect(result.depth).toBe(1);
    });

    it('should handle field aliases', () => {
      // In graphql-parse-resolve-info, the key in fieldsByTypeName is the alias (if present)
      // or the field name. fieldTree.alias and fieldTree.name hold the actual values.
      vi.mocked(parseResolveInfo).mockReturnValue({
        name: 'user',
        alias: 'user',
        args: {},
        fieldsByTypeName: {
          User: {
            // The key 'userName' represents how the field is indexed (by alias)
            userName: {
              name: 'name', // actual field name in schema
              alias: 'userName', // alias used in query
              args: {},
              fieldsByTypeName: {},
            },
          },
        },
      } as any);

      const info = createMockInfo();
      const result = extractor.extractFieldsFromInfo(info);

      // The implementation uses fieldName (from Object.entries key) and transforms it
      // Since the key is 'userName' (the alias), that becomes the name
      // The alias property is set when fieldTree.alias !== fieldName
      // But here fieldTree.alias ('userName') === fieldName ('userName'), so no alias property
      expect(result.fields[0].name).toBe('userName');
      expect(result.fields[0].alias).toBeUndefined();
    });

    it('should set alias property when different from field key', () => {
      vi.mocked(parseResolveInfo).mockReturnValue({
        name: 'user',
        alias: 'user',
        args: {},
        fieldsByTypeName: {
          User: {
            // In real graphql-parse-resolve-info, when alias is used, the key is still the alias
            // but we test the case where fieldTree.alias !== fieldName
            name: {
              name: 'name',
              alias: 'userName', // different from key 'name'
              args: {},
              fieldsByTypeName: {},
            },
          },
        },
      } as any);

      const info = createMockInfo();
      const result = extractor.extractFieldsFromInfo(info);

      // fieldName = 'name' (from key), fieldTree.alias = 'userName'
      // alias is set because they're different
      expect(result.fields[0].name).toBe('name');
      expect(result.fields[0].alias).toBe('userName');
    });

    it('should handle field arguments', () => {
      vi.mocked(parseResolveInfo).mockReturnValue({
        name: 'users',
        alias: 'users',
        args: {},
        fieldsByTypeName: {
          User: {
            posts: {
              name: 'posts',
              alias: 'posts',
              args: { limit: 10, offset: 0 },
              fieldsByTypeName: {},
            },
          },
        },
      } as any);

      const info = createMockInfo();
      const result = extractor.extractFieldsFromInfo(info);

      expect(result.fields[0].arguments).toEqual({ limit: 10, offset: 0 });
    });

    it('should skip __typename by default', () => {
      vi.mocked(parseResolveInfo).mockReturnValue({
        name: 'user',
        alias: 'user',
        args: {},
        fieldsByTypeName: {
          User: {
            id: {
              name: 'id',
              alias: 'id',
              args: {},
              fieldsByTypeName: {},
            },
            __typename: {
              name: '__typename',
              alias: '__typename',
              args: {},
              fieldsByTypeName: {},
            },
          },
        },
      } as any);

      const info = createMockInfo();
      const result = extractor.extractFieldsFromInfo(info);

      expect(result.fields.length).toBe(1);
      expect(result.fields[0].name).toBe('id');
    });

    it('should include __typename when option is set', () => {
      vi.mocked(parseResolveInfo).mockReturnValue({
        name: 'user',
        alias: 'user',
        args: {},
        fieldsByTypeName: {
          User: {
            id: {
              name: 'id',
              alias: 'id',
              args: {},
              fieldsByTypeName: {},
            },
            __typename: {
              name: '__typename',
              alias: '__typename',
              args: {},
              fieldsByTypeName: {},
            },
          },
        },
      } as any);

      const info = createMockInfo();
      const result = extractor.extractFieldsFromInfo(info, { includeTypename: true });

      expect(result.fields.length).toBe(2);
      const fieldNames = result.fields.map((f) => f.name);
      expect(fieldNames).toContain('__typename');
    });

    it('should exclude specified fields', () => {
      vi.mocked(parseResolveInfo).mockReturnValue({
        name: 'user',
        alias: 'user',
        args: {},
        fieldsByTypeName: {
          User: {
            id: {
              name: 'id',
              alias: 'id',
              args: {},
              fieldsByTypeName: {},
            },
            password: {
              name: 'password',
              alias: 'password',
              args: {},
              fieldsByTypeName: {},
            },
            name: {
              name: 'name',
              alias: 'name',
              args: {},
              fieldsByTypeName: {},
            },
          },
        },
      } as any);

      const info = createMockInfo();
      const result = extractor.extractFieldsFromInfo(info, {
        excludeFields: ['password'],
      });

      expect(result.fields.length).toBe(2);
      const fieldNames = result.fields.map((f) => f.name);
      expect(fieldNames).not.toContain('password');
    });

    it('should apply field transformer', () => {
      vi.mocked(parseResolveInfo).mockReturnValue({
        name: 'user',
        alias: 'user',
        args: {},
        fieldsByTypeName: {
          User: {
            user_name: {
              name: 'user_name',
              alias: 'user_name',
              args: {},
              fieldsByTypeName: {},
            },
          },
        },
      } as any);

      const info = createMockInfo();
      const result = extractor.extractFieldsFromInfo(info, {
        fieldTransformer: (name) => name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      });

      expect(result.fields[0].name).toBe('userName');
    });

    it('should throw when maxFields is exceeded', () => {
      vi.mocked(parseResolveInfo).mockReturnValue({
        name: 'user',
        alias: 'user',
        args: {},
        fieldsByTypeName: {
          User: {
            field1: { name: 'field1', alias: 'field1', args: {}, fieldsByTypeName: {} },
            field2: { name: 'field2', alias: 'field2', args: {}, fieldsByTypeName: {} },
            field3: { name: 'field3', alias: 'field3', args: {}, fieldsByTypeName: {} },
            field4: { name: 'field4', alias: 'field4', args: {}, fieldsByTypeName: {} },
            field5: { name: 'field5', alias: 'field5', args: {}, fieldsByTypeName: {} },
            field6: { name: 'field6', alias: 'field6', args: {}, fieldsByTypeName: {} },
          },
        },
      } as any);

      const info = createMockInfo();

      expect(() => extractor.extractFieldsFromInfo(info, { maxFields: 5 })).toThrow(
        /Maximum field count/,
      );
    });

    it('should respect maxDepth option', () => {
      vi.mocked(parseResolveInfo).mockReturnValue({
        name: 'user',
        alias: 'user',
        args: {},
        fieldsByTypeName: {
          User: {
            level1: {
              name: 'level1',
              alias: 'level1',
              args: {},
              fieldsByTypeName: {
                Level1: {
                  level2: {
                    name: 'level2',
                    alias: 'level2',
                    args: {},
                    fieldsByTypeName: {
                      Level2: {
                        level3: {
                          name: 'level3',
                          alias: 'level3',
                          args: {},
                          fieldsByTypeName: {},
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      } as any);

      const info = createMockInfo();
      // maxDepth: 1 means we process depth 0 and 1, but return [] for depth > 1
      // So level1 (processed at depth 0) and level2 (processed at depth 1) should be included
      // level3 (would be at depth 2) should be excluded
      const result = extractor.extractFieldsFromInfo(info, { maxDepth: 1 });

      expect(result.fields[0].name).toBe('level1');
      expect(result.fields[0].selections?.[0].name).toBe('level2');
      // level3 should not be included due to maxDepth
      expect(result.fields[0].selections?.[0].selections).toEqual([]);
    });
  });

  describe('getRequestedFieldNames', () => {
    it('should return flat array of field names', () => {
      vi.mocked(parseResolveInfo).mockReturnValue({
        name: 'user',
        alias: 'user',
        args: {},
        fieldsByTypeName: {
          User: {
            id: { name: 'id', alias: 'id', args: {}, fieldsByTypeName: {} },
            name: { name: 'name', alias: 'name', args: {}, fieldsByTypeName: {} },
            profile: {
              name: 'profile',
              alias: 'profile',
              args: {},
              fieldsByTypeName: {
                Profile: {
                  bio: { name: 'bio', alias: 'bio', args: {}, fieldsByTypeName: {} },
                },
              },
            },
          },
        },
      } as any);

      const info = createMockInfo();
      const names = extractor.getRequestedFieldNames(info);

      expect(names).toContain('id');
      expect(names).toContain('name');
      expect(names).toContain('profile');
      expect(names).toContain('bio');
    });

    it('should return empty array when no fields', () => {
      vi.mocked(parseResolveInfo).mockReturnValue(null);

      const info = createMockInfo();
      const names = extractor.getRequestedFieldNames(info);

      expect(names).toEqual([]);
    });
  });

  describe('getFieldStructure', () => {
    it('should return nested object structure', () => {
      vi.mocked(parseResolveInfo).mockReturnValue({
        name: 'user',
        alias: 'user',
        args: {},
        fieldsByTypeName: {
          User: {
            id: { name: 'id', alias: 'id', args: {}, fieldsByTypeName: {} },
            profile: {
              name: 'profile',
              alias: 'profile',
              args: {},
              fieldsByTypeName: {
                Profile: {
                  bio: { name: 'bio', alias: 'bio', args: {}, fieldsByTypeName: {} },
                },
              },
            },
          },
        },
      } as any);

      const info = createMockInfo();
      const structure = extractor.getFieldStructure(info);

      expect(structure.id).toBe(true);
      expect(structure.profile).toEqual({ bio: true });
    });

    it('should return empty object when no fields', () => {
      vi.mocked(parseResolveInfo).mockReturnValue(null);

      const info = createMockInfo();
      const structure = extractor.getFieldStructure(info);

      expect(structure).toEqual({});
    });
  });

  describe('isFieldRequested', () => {
    it('should return true for requested field path', () => {
      vi.mocked(parseResolveInfo).mockReturnValue({
        name: 'user',
        alias: 'user',
        args: {},
        fieldsByTypeName: {
          User: {
            profile: {
              name: 'profile',
              alias: 'profile',
              args: {},
              fieldsByTypeName: {
                Profile: {
                  avatar: { name: 'avatar', alias: 'avatar', args: {}, fieldsByTypeName: {} },
                },
              },
            },
          },
        },
      } as any);

      const info = createMockInfo();

      expect(extractor.isFieldRequested(info, 'profile')).toBe(true);
      expect(extractor.isFieldRequested(info, 'profile.avatar')).toBe(true);
    });

    it('should return false for non-requested field path', () => {
      vi.mocked(parseResolveInfo).mockReturnValue({
        name: 'user',
        alias: 'user',
        args: {},
        fieldsByTypeName: {
          User: {
            id: { name: 'id', alias: 'id', args: {}, fieldsByTypeName: {} },
          },
        },
      } as any);

      const info = createMockInfo();

      expect(extractor.isFieldRequested(info, 'profile')).toBe(false);
      expect(extractor.isFieldRequested(info, 'profile.avatar')).toBe(false);
    });

    it('should return false for partial path match', () => {
      vi.mocked(parseResolveInfo).mockReturnValue({
        name: 'user',
        alias: 'user',
        args: {},
        fieldsByTypeName: {
          User: {
            profile: { name: 'profile', alias: 'profile', args: {}, fieldsByTypeName: {} },
          },
        },
      } as any);

      const info = createMockInfo();

      // profile exists but profile.avatar doesn't
      expect(extractor.isFieldRequested(info, 'profile.avatar')).toBe(false);
    });

    it('should handle empty structure', () => {
      vi.mocked(parseResolveInfo).mockReturnValue(null);

      const info = createMockInfo();

      expect(extractor.isFieldRequested(info, 'any.path')).toBe(false);
    });
  });
});
