/**
 * graphql-query-builder
 *
 * Unit tests for the security module.
 */

import { describe, expect, it } from 'vitest';
import type { FieldSelection } from './extractor.js';
import {
  calculateComplexity,
  createSecurityMiddleware,
  DEFAULT_SECURITY_CONFIG,
  getBlockedFields,
  isFieldAllowed,
  limitFieldDepth,
  sanitizeFieldSelections,
  validateFieldSelections,
  validateQuery,
} from './security.js';

describe('Security Module', () => {
  describe('validateQuery', () => {
    it('should pass valid queries', () => {
      const result = validateQuery(10, 3, ['id', 'email'], {
        maxDepth: 10,
        maxFields: 100,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail queries exceeding max depth', () => {
      const result = validateQuery(10, 15, ['id'], {
        maxDepth: 10,
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('depth');
    });

    it('should fail queries exceeding max fields', () => {
      const result = validateQuery(150, 3, ['id'], {
        maxFields: 100,
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('fields');
    });

    it('should fail queries with blocked fields', () => {
      const result = validateQuery(10, 3, ['id', 'password'], {
        blockedFields: ['password', 'ssn'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('blocked');
    });

    it('should block introspection queries by default', () => {
      const result = validateQuery(10, 3, ['__schema', 'id'], {
        allowIntrospection: false,
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Introspection');
    });

    it('should allow introspection when enabled', () => {
      const result = validateQuery(10, 3, ['__schema', 'id'], {
        allowIntrospection: true,
      });

      expect(result.valid).toBe(true);
    });

    it('should handle multiple validation errors', () => {
      const result = validateQuery(200, 15, ['password'], {
        maxDepth: 10,
        maxFields: 100,
        blockedFields: ['password'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('should use default config when none provided', () => {
      const result = validateQuery(50, 5, ['id', 'name']);

      expect(result.valid).toBe(true);
    });
  });

  describe('validateFieldSelections', () => {
    it('should validate field selections', () => {
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'email', path: ['email'], depth: 1 },
      ];

      const result = validateFieldSelections(fields, {
        maxDepth: 10,
        maxFields: 100,
      });

      expect(result.valid).toBe(true);
    });

    it('should detect blocked fields in selections', () => {
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'password', path: ['password'], depth: 1 },
      ];

      const result = validateFieldSelections(fields, {
        blockedFields: ['password'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('blocked');
    });

    it('should validate nested depth', () => {
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
              selections: [{ name: 'level3', path: ['level1', 'level2', 'level3'], depth: 3 }],
            },
          ],
        },
      ];

      const result = validateFieldSelections(fields, { maxDepth: 2 });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('depth');
    });

    it('should count aliases', () => {
      const fields: FieldSelection[] = [
        { name: 'id', alias: 'userId', path: ['userId'], depth: 1 },
        { name: 'id', alias: 'itemId', path: ['itemId'], depth: 1 },
      ];

      const result = validateFieldSelections(fields, { maxAliases: 1 });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('alias');
    });

    it('should validate root field count', () => {
      const fields: FieldSelection[] = Array.from({ length: 10 }, (_, i) => ({
        name: `field${i}`,
        path: [`field${i}`],
        depth: 1,
      }));

      const result = validateFieldSelections(fields, { maxRootFields: 5 });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('root fields');
    });
  });

  describe('sanitizeFieldSelections', () => {
    it('should remove blocked fields', () => {
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'password', path: ['password'], depth: 1 },
        { name: 'email', path: ['email'], depth: 1 },
      ];

      const sanitized = sanitizeFieldSelections(fields, ['password']);

      expect(sanitized).toHaveLength(2);
      expect(sanitized.find((f) => f.name === 'password')).toBeUndefined();
    });

    it('should remove blocked fields from nested selections', () => {
      const fields: FieldSelection[] = [
        {
          name: 'user',
          path: ['user'],
          depth: 1,
          selections: [
            { name: 'id', path: ['user', 'id'], depth: 2 },
            { name: 'ssn', path: ['user', 'ssn'], depth: 2 },
          ],
        },
      ];

      const sanitized = sanitizeFieldSelections(fields, ['ssn']);

      expect(sanitized[0].selections).toHaveLength(1);
      expect(sanitized[0].selections?.[0].name).toBe('id');
    });

    it('should handle empty blocked list', () => {
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'name', path: ['name'], depth: 1 },
      ];

      const sanitized = sanitizeFieldSelections(fields, []);

      expect(sanitized).toHaveLength(2);
    });

    it('should handle empty fields array', () => {
      const sanitized = sanitizeFieldSelections([], ['password']);

      expect(sanitized).toHaveLength(0);
    });
  });

  describe('limitFieldDepth', () => {
    it('should limit field depth', () => {
      const fields: FieldSelection[] = [
        {
          name: 'profile',
          path: ['profile'],
          depth: 1,
          selections: [
            {
              name: 'address',
              path: ['profile', 'address'],
              depth: 2,
              selections: [
                {
                  name: 'city',
                  path: ['profile', 'address', 'city'],
                  depth: 3,
                },
              ],
            },
          ],
        },
      ];

      const limited = limitFieldDepth(fields, 2);

      expect(limited[0].selections?.[0].selections).toBeUndefined();
    });

    it('should keep fields under limit unchanged', () => {
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'name', path: ['name'], depth: 1 },
      ];

      const limited = limitFieldDepth(fields, 5);

      expect(limited).toHaveLength(2);
    });

    it('should handle depth limit of 1', () => {
      const fields: FieldSelection[] = [
        {
          name: 'user',
          path: ['user'],
          depth: 1,
          selections: [{ name: 'id', path: ['user', 'id'], depth: 2 }],
        },
      ];

      const limited = limitFieldDepth(fields, 1);

      expect(limited[0].selections).toBeUndefined();
    });
  });

  describe('calculateComplexity', () => {
    it('should calculate query complexity', () => {
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'email', path: ['email'], depth: 1 },
        {
          name: 'posts',
          path: ['posts'],
          depth: 1,
          selections: [{ name: 'title', path: ['posts', 'title'], depth: 2 }],
        },
      ];

      const complexity = calculateComplexity(fields);

      expect(complexity).toBeGreaterThan(0);
    });

    it('should apply list multiplier', () => {
      const singleField: FieldSelection[] = [{ name: 'user', path: ['user'], depth: 1 }];

      const listField: FieldSelection[] = [
        {
          name: 'users',
          path: ['users'],
          depth: 1,
          selections: [{ name: 'id', path: ['users', 'id'], depth: 2 }],
        },
      ];

      const singleComplexity = calculateComplexity(singleField, {
        fieldCost: 1,
        listMultiplier: 1,
      });
      const listComplexity = calculateComplexity(listField, { fieldCost: 1, listMultiplier: 10 });

      expect(listComplexity).toBeGreaterThan(singleComplexity);
    });

    it('should handle empty fields', () => {
      const complexity = calculateComplexity([]);

      expect(complexity).toBe(0);
    });
  });

  describe('isFieldAllowed', () => {
    it('should return true for allowed fields', () => {
      const allowed = isFieldAllowed('email', { blockedFields: ['password', 'ssn'] });

      expect(allowed).toBe(true);
    });

    it('should return false for blocked fields', () => {
      const allowed = isFieldAllowed('password', { blockedFields: ['password', 'ssn'] });

      expect(allowed).toBe(false);
    });

    it('should be case-insensitive', () => {
      const allowed = isFieldAllowed('PASSWORD', { blockedFields: ['password'] });

      expect(allowed).toBe(false);
    });

    it('should block introspection fields when not allowed', () => {
      const allowed = isFieldAllowed('__schema', { allowIntrospection: false });

      expect(allowed).toBe(false);
    });

    it('should allow introspection fields when allowed', () => {
      const allowed = isFieldAllowed('__schema', { allowIntrospection: true });

      expect(allowed).toBe(true);
    });
  });

  describe('getBlockedFields', () => {
    it('should return blocked fields including introspection', () => {
      const blocked = getBlockedFields({
        blockedFields: ['password', 'ssn'],
        allowIntrospection: false,
      });

      expect(blocked).toContain('password');
      expect(blocked).toContain('ssn');
      expect(blocked).toContain('__schema');
      expect(blocked).toContain('__type');
    });

    it('should not include introspection when allowed', () => {
      const blocked = getBlockedFields({
        blockedFields: ['password'],
        allowIntrospection: true,
      });

      expect(blocked).toContain('password');
      expect(blocked).not.toContain('__schema');
    });
  });

  describe('DEFAULT_SECURITY_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_SECURITY_CONFIG.maxDepth).toBe(10);
      expect(DEFAULT_SECURITY_CONFIG.maxFields).toBe(100);
      expect(DEFAULT_SECURITY_CONFIG.maxAliases).toBe(10);
      expect(DEFAULT_SECURITY_CONFIG.maxRootFields).toBe(5);
      expect(DEFAULT_SECURITY_CONFIG.allowIntrospection).toBe(false);
    });
  });

  describe('createSecurityMiddleware', () => {
    it('should create a middleware function', () => {
      const middleware = createSecurityMiddleware();

      expect(typeof middleware).toBe('function');
    });

    it('should pass validation for valid fields', () => {
      const middleware = createSecurityMiddleware({ maxDepth: 5, maxFields: 10 });
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'name', path: ['name'], depth: 1 },
      ];

      expect(() => middleware(fields)).not.toThrow();
    });

    it('should throw for invalid fields', () => {
      const middleware = createSecurityMiddleware({
        maxDepth: 2,
        blockedFields: ['password'],
      });
      const fields: FieldSelection[] = [{ name: 'password', path: ['password'], depth: 1 }];

      expect(() => middleware(fields)).toThrow();
    });

    it('should use default config when none provided', () => {
      const middleware = createSecurityMiddleware();
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      expect(() => middleware(fields)).not.toThrow();
    });
  });
});
