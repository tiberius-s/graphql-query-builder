/**
 * graphql-query-builder
 *
 * Custom Error classes for the GraphQL Query Builder.
 * These are runtime classes with structured error information.
 */

/**
 * Error thrown when query validation fails.
 *
 * @example
 * ```typescript
 * throw new QueryValidationError(
 *   'Query exceeds maximum depth',
 *   ['Depth 15 exceeds maximum of 10'],
 *   'DEPTH_EXCEEDED'
 * );
 * ```
 */
export class QueryValidationError extends Error {
  public readonly errors: string[];
  public readonly code: string;

  constructor(message: string, errors: string[], code = 'QUERY_VALIDATION_ERROR') {
    super(message);
    this.name = 'QueryValidationError';
    this.errors = errors;
    this.code = code;
    Object.setPrototypeOf(this, QueryValidationError.prototype);
  }
}

/**
 * Error thrown when configuration is invalid.
 *
 * @example
 * ```typescript
 * throw new ConfigurationError(
 *   'Invalid maxDepth value',
 *   'maxDepth',
 *   'INVALID_CONFIG'
 * );
 * ```
 */
export class ConfigurationError extends Error {
  public readonly configKey: string;
  public readonly code: string;

  constructor(message: string, configKey: string, code = 'CONFIGURATION_ERROR') {
    super(message);
    this.name = 'ConfigurationError';
    this.configKey = configKey;
    this.code = code;
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * Error thrown when upstream service request fails.
 *
 * @example
 * ```typescript
 * throw new UpstreamServiceError(
 *   'Request timed out',
 *   'userService',
 *   { timeout: 30000 },
 *   'TIMEOUT'
 * );
 * ```
 */
export class UpstreamServiceError extends Error {
  public readonly serviceName: string;
  public readonly details?: unknown;
  public readonly code: string;

  constructor(
    message: string,
    serviceName: string,
    details?: unknown,
    code = 'UPSTREAM_SERVICE_ERROR',
  ) {
    super(message);
    this.name = 'UpstreamServiceError';
    this.serviceName = serviceName;
    this.details = details;
    this.code = code;
    Object.setPrototypeOf(this, UpstreamServiceError.prototype);
  }
}
