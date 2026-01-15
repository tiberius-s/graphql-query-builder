/**
 * Unit tests for the errors module.
 */

import { describe, expect, it } from 'vitest';
import { ConfigurationError, QueryValidationError } from './errors.js';

describe('Errors Module', () => {
  describe('QueryValidationError', () => {
    it('should create error with message', () => {
      const error = new QueryValidationError('Validation failed');

      expect(error.message).toBe('Validation failed');
      expect(error.name).toBe('QueryValidationError');
      expect(error.code).toBe('QUERY_VALIDATION_ERROR');
    });

    it('should include errors array', () => {
      const errors = ['Depth exceeded', 'Blocked field found'];
      const error = new QueryValidationError('Validation failed', errors);

      expect(error.errors).toEqual(errors);
    });

    it('should be instanceof Error', () => {
      const error = new QueryValidationError('Test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(QueryValidationError);
    });
  });

  describe('ConfigurationError', () => {
    it('should create error with message and configKey', () => {
      const error = new ConfigurationError('Invalid value', 'maxDepth');

      expect(error.message).toBe('Invalid value');
      expect(error.name).toBe('ConfigurationError');
      expect(error.configKey).toBe('maxDepth');
      expect(error.code).toBe('CONFIGURATION_ERROR');
    });

    it('should be instanceof Error', () => {
      const error = new ConfigurationError('Test', 'key');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConfigurationError);
    });
  });
});
