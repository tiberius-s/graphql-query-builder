/**
 * graphql-query-builder
 *
 * Unit tests for the errors module.
 */

import { describe, expect, it } from 'vitest';
import { ConfigurationError, QueryValidationError, UpstreamServiceError } from './errors.js';

describe('QueryValidationError', () => {
  it('should create error with message and errors array', () => {
    const error = new QueryValidationError('Validation failed', ['Error 1', 'Error 2']);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(QueryValidationError);
    expect(error.name).toBe('QueryValidationError');
    expect(error.message).toBe('Validation failed');
    expect(error.errors).toEqual(['Error 1', 'Error 2']);
    expect(error.code).toBe('QUERY_VALIDATION_ERROR');
  });

  it('should accept custom error code', () => {
    const error = new QueryValidationError('Depth exceeded', ['Too deep'], 'DEPTH_EXCEEDED');

    expect(error.code).toBe('DEPTH_EXCEEDED');
  });

  it('should be catchable as Error', () => {
    expect(() => {
      throw new QueryValidationError('Test', []);
    }).toThrow(Error);
  });
});

describe('ConfigurationError', () => {
  it('should create error with message and config key', () => {
    const error = new ConfigurationError('Invalid config', 'maxDepth');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error.name).toBe('ConfigurationError');
    expect(error.message).toBe('Invalid config');
    expect(error.configKey).toBe('maxDepth');
    expect(error.code).toBe('CONFIGURATION_ERROR');
  });

  it('should accept custom error code', () => {
    const error = new ConfigurationError('Missing endpoint', 'endpoint', 'MISSING_ENDPOINT');

    expect(error.code).toBe('MISSING_ENDPOINT');
  });
});

describe('UpstreamServiceError', () => {
  it('should create error with message and service name', () => {
    const error = new UpstreamServiceError('Request failed', 'userService');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UpstreamServiceError);
    expect(error.name).toBe('UpstreamServiceError');
    expect(error.message).toBe('Request failed');
    expect(error.serviceName).toBe('userService');
    expect(error.code).toBe('UPSTREAM_SERVICE_ERROR');
    expect(error.details).toBeUndefined();
  });

  it('should accept details object', () => {
    const details = { status: 500, body: 'Internal Server Error' };
    const error = new UpstreamServiceError('HTTP Error', 'productService', details);

    expect(error.details).toEqual(details);
  });

  it('should accept custom error code', () => {
    const error = new UpstreamServiceError(
      'Timeout',
      'orderService',
      { timeout: 30000 },
      'TIMEOUT',
    );

    expect(error.code).toBe('TIMEOUT');
    expect(error.details).toEqual({ timeout: 30000 });
  });
});
