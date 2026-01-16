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
    if (info.fieldName === 'userWithArgs') {
      return {
        name: 'user',
        alias: 'user',
        fieldsByTypeName: {
          User: {
            friends: {
              name: 'friends',
              alias: 'friends',
              args: { limit: 10, offset: 0 },
              fieldsByTypeName: {
                User: {
                  id: { name: 'id', alias: 'id', args: {}, fieldsByTypeName: {} },
                },
              },
            },
          },
        },
      };
    }
    if (info.fieldName === 'withTypename') {
      return {
        name: 'entity',
        alias: 'entity',
        fieldsByTypeName: {
          Entity: {
            __typename: { name: '__typename', alias: '__typename', args: {}, fieldsByTypeName: {} },
            id: { name: 'id', alias: 'id', args: {}, fieldsByTypeName: {} },
          },
        },
      };
    }
    if (info.fieldName === 'nestedTypename') {
      return {
        name: 'user',
        alias: 'user',
        fieldsByTypeName: {
          User: {
            id: { name: 'id', alias: 'id', args: {}, fieldsByTypeName: {} },
            profile: {
              name: 'profile',
              alias: 'profile',
              args: {},
              fieldsByTypeName: {
                Profile: {
                  __typename: {
                    name: '__typename',
                    alias: '__typename',
                    args: {},
                    fieldsByTypeName: {},
                  },
                  bio: { name: 'bio', alias: 'bio', args: {}, fieldsByTypeName: {} },
                },
              },
            },
          },
        },
      };
    }
    if (info.fieldName === 'nestedExclude') {
      return {
        name: 'user',
        alias: 'user',
        fieldsByTypeName: {
          User: {
            id: { name: 'id', alias: 'id', args: {}, fieldsByTypeName: {} },
            profile: {
              name: 'profile',
              alias: 'profile',
              args: {},
              fieldsByTypeName: {
                Profile: {
                  secretField: {
                    name: 'secretField',
                    alias: 'secretField',
                    args: {},
                    fieldsByTypeName: {},
                  },
                  bio: { name: 'bio', alias: 'bio', args: {}, fieldsByTypeName: {} },
                },
              },
            },
          },
        },
      };
    }
    if (info.fieldName === 'deeplyNested') {
      return {
        name: 'user',
        alias: 'user',
        fieldsByTypeName: {
          User: {
            profile: {
              name: 'profile',
              alias: 'profile',
              args: {},
              fieldsByTypeName: {
                Profile: {
                  address: {
                    name: 'address',
                    alias: 'address',
                    args: { format: 'full' },
                    fieldsByTypeName: {
                      Address: {
                        city: { name: 'city', alias: 'city', args: {}, fieldsByTypeName: {} },
                        country: {
                          name: 'country',
                          alias: 'country',
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
      };
    }
    if (info.fieldName === 'aliasedFields') {
      return {
        name: 'user',
        alias: 'user',
        fieldsByTypeName: {
          User: {
            id: { name: 'id', alias: 'userId', args: {}, fieldsByTypeName: {} },
            email: { name: 'email', alias: 'userEmail', args: {}, fieldsByTypeName: {} },
            profile: {
              name: 'profile',
              alias: 'userProfile',
              args: {},
              fieldsByTypeName: {
                Profile: {
                  bio: { name: 'bio', alias: 'biography', args: {}, fieldsByTypeName: {} },
                },
              },
            },
          },
        },
      };
    }
    if (info.fieldName === 'veryDeep') {
      return {
        name: 'root',
        alias: 'root',
        fieldsByTypeName: {
          Root: {
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
                          fieldsByTypeName: {
                            Level3: {
                              level4: {
                                name: 'level4',
                                alias: 'level4',
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
    returnType: {},
    path: { key: fieldName, typename: 'Query', prev: undefined },
    schema: {},
    fragments: {},
    rootValue: null,
    operation: {},
    variableValues: {},
  } as unknown as GraphQLResolveInfo;
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

    it('should extract field arguments', () => {
      const info = createMockInfo('userWithArgs');
      const result = extractFieldsFromInfo(info);

      const friendsField = result.fields.find((f) => f.name === 'friends');
      expect(friendsField).toBeDefined();
      expect(friendsField?.arguments).toEqual({ limit: 10, offset: 0 });
    });

    it('should exclude __typename by default', () => {
      const info = createMockInfo('withTypename');
      const result = extractFieldsFromInfo(info);

      const fieldNames = result.fields.map((f) => f.name);
      expect(fieldNames).not.toContain('__typename');
      expect(fieldNames).toContain('id');
    });

    it('should include __typename when configured', () => {
      const info = createMockInfo('withTypename');
      const result = extractFieldsFromInfo(info, { includeTypename: true });

      const fieldNames = result.fields.map((f) => f.name);
      expect(fieldNames).toContain('__typename');
    });

    it('should exclude __typename in nested selections by default', () => {
      const info = createMockInfo('nestedTypename');
      const result = extractFieldsFromInfo(info);

      // Get nested profile field
      const profileField = result.fields.find((f) => f.name === 'profile');
      expect(profileField).toBeDefined();

      // Check nested selections don't have __typename
      const nestedNames = profileField?.selections?.map((f) => f.name) ?? [];
      expect(nestedNames).not.toContain('__typename');
      expect(nestedNames).toContain('bio');
    });

    it('should exclude specified fields in nested selections', () => {
      const info = createMockInfo('nestedExclude');
      const result = extractFieldsFromInfo(info, { excludeFields: ['secretField'] });

      // Get nested profile field
      const profileField = result.fields.find((f) => f.name === 'profile');
      expect(profileField).toBeDefined();

      // Check secretField is excluded from nested selections
      const nestedNames = profileField?.selections?.map((f) => f.name) ?? [];
      expect(nestedNames).not.toContain('secretField');
      expect(nestedNames).toContain('bio');
    });

    it('should handle deeply nested fields with arguments', () => {
      const info = createMockInfo('deeplyNested');
      const result = extractFieldsFromInfo(info);

      // Get profile -> address -> city structure
      const profileField = result.fields.find((f) => f.name === 'profile');
      expect(profileField).toBeDefined();
      expect(profileField?.selections).toHaveLength(1);

      const addressField = profileField?.selections?.find((f) => f.name === 'address');
      expect(addressField).toBeDefined();
      expect(addressField?.arguments).toEqual({ format: 'full' });
      expect(addressField?.selections).toHaveLength(2);

      const cityField = addressField?.selections?.find((f) => f.name === 'city');
      expect(cityField).toBeDefined();
    });

    it('should preserve field aliases different from names', () => {
      const info = createMockInfo('aliasedFields');
      const result = extractFieldsFromInfo(info);

      const idField = result.fields.find((f) => f.name === 'id');
      expect(idField).toBeDefined();
      expect(idField?.alias).toBe('userId');

      const profileField = result.fields.find((f) => f.name === 'profile');
      expect(profileField?.alias).toBe('userProfile');

      // Check nested alias
      const bioField = profileField?.selections?.find((f) => f.name === 'bio');
      expect(bioField?.alias).toBe('biography');
    });

    it('should truncate very deep nesting at maxDepth', () => {
      const info = createMockInfo('veryDeep');
      const result = extractFieldsFromInfo(info, { maxDepth: 2 });

      // Should stop at depth 2
      const level1 = result.fields.find((f) => f.name === 'level1');
      expect(level1).toBeDefined();
      expect(level1?.selections).toHaveLength(1);

      const level2 = level1?.selections?.find((f) => f.name === 'level2');
      expect(level2).toBeDefined();

      // level2 has selections but they are truncated at maxDepth
      const level3 = level2?.selections?.find((f) => f.name === 'level3');
      expect(level3).toBeDefined();
      // level4 should NOT be present because depth 3 > maxDepth 2
      expect(level3?.selections ?? []).toHaveLength(0);
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
