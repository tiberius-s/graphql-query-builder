/**
 * Unit tests for the config module.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertValid,
  configure,
  getConfig,
  resetConfig,
  sanitizeFields,
  validateFields,
} from './config.js';
import { ConfigurationError, QueryValidationError } from './errors.js';
import type { FieldSelection } from './extractor.js';

describe('Config Module', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
  });

  describe('configure', () => {
    it('should update configuration', () => {
      configure({ maxDepth: 5, maxFields: 50 });
      const config = getConfig();

      expect(config.maxDepth).toBe(5);
      expect(config.maxFields).toBe(50);
    });

    it('should throw for invalid maxDepth', () => {
      expect(() => configure({ maxDepth: 0 })).toThrow(ConfigurationError);
      expect(() => configure({ maxDepth: -1 })).toThrow(ConfigurationError);
    });

    it('should throw for invalid maxFields', () => {
      expect(() => configure({ maxFields: 0 })).toThrow(ConfigurationError);
    });

    it('should throw for invalid blockedFields type', () => {
      expect(() => configure({ blockedFields: 'not-an-array' as any })).toThrow(ConfigurationError);
    });

    it('should throw for invalid requiredFields type', () => {
      expect(() => configure({ requiredFields: 'not-an-array' as any })).toThrow(
        ConfigurationError,
      );
    });

    it('should throw for invalid fieldMappings type', () => {
      expect(() => configure({ fieldMappings: 'not-an-object' as any })).toThrow(
        ConfigurationError,
      );
    });

    it('should merge with existing config', () => {
      configure({ maxDepth: 5 });
      configure({ maxFields: 50 });
      const config = getConfig();

      expect(config.maxDepth).toBe(5);
      expect(config.maxFields).toBe(50);
    });
  });

  describe('resetConfig', () => {
    it('should restore default configuration', () => {
      configure({ maxDepth: 5, maxFields: 50 });
      resetConfig();
      const config = getConfig();

      expect(config.maxDepth).toBe(10);
      expect(config.maxFields).toBe(100);
    });
  });

  describe('validateFields', () => {
    it('should pass validation for valid fields', () => {
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'email', path: ['email'], depth: 1 },
      ];

      const result = validateFields(fields);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when depth exceeds limit', () => {
      configure({ maxDepth: 2 });

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

      const result = validateFields(fields);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('depth');
    });

    it('should fail validation when field count exceeds limit', () => {
      configure({ maxFields: 2 });

      const fields: FieldSelection[] = [
        { name: 'a', path: ['a'], depth: 1 },
        { name: 'b', path: ['b'], depth: 1 },
        { name: 'c', path: ['c'], depth: 1 },
      ];

      const result = validateFields(fields);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('fields');
    });

    it('should fail validation for blocked fields', () => {
      configure({ blockedFields: ['password'] });

      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'password', path: ['password'], depth: 1 },
      ];

      const result = validateFields(fields);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('blocked');
    });

    it('should use option overrides', () => {
      const fields: FieldSelection[] = [{ name: 'password', path: ['password'], depth: 1 }];

      // Global config doesn't block password
      const result1 = validateFields(fields);
      expect(result1.valid).toBe(true);

      // Override blocks password
      const result2 = validateFields(fields, { blockedFields: ['password'] });
      expect(result2.valid).toBe(false);
    });
  });

  describe('assertValid', () => {
    it('should not throw for valid fields', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      expect(() => assertValid(fields)).not.toThrow();
    });

    it('should throw QueryValidationError for invalid fields', () => {
      configure({ blockedFields: ['secret'] });

      const fields: FieldSelection[] = [{ name: 'secret', path: ['secret'], depth: 1 }];

      expect(() => assertValid(fields)).toThrow(QueryValidationError);
    });
  });

  describe('sanitizeFields', () => {
    it('should remove blocked fields', () => {
      configure({ blockedFields: ['password', 'ssn'] });

      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'password', path: ['password'], depth: 1 },
        { name: 'email', path: ['email'], depth: 1 },
      ];

      const sanitized = sanitizeFields(fields);

      expect(sanitized).toHaveLength(2);
      expect(sanitized.map((f) => f.name)).toEqual(['id', 'email']);
    });

    it('should remove blocked fields recursively', () => {
      const fields: FieldSelection[] = [
        {
          name: 'user',
          path: ['user'],
          depth: 1,
          selections: [
            { name: 'id', path: ['user', 'id'], depth: 2 },
            { name: 'password', path: ['user', 'password'], depth: 2 },
          ],
        },
      ];

      const sanitized = sanitizeFields(fields, ['password']);

      expect(sanitized[0].selections).toHaveLength(1);
      expect(sanitized[0].selections![0].name).toBe('id');
    });

    it('should use override blockedFields', () => {
      configure({ blockedFields: ['a'] });

      const fields: FieldSelection[] = [
        { name: 'a', path: ['a'], depth: 1 },
        { name: 'b', path: ['b'], depth: 1 },
      ];

      // Use override list (only blocks 'b')
      const sanitized = sanitizeFields(fields, ['b']);

      expect(sanitized).toHaveLength(1);
      expect(sanitized[0].name).toBe('a');
    });
  });
});
