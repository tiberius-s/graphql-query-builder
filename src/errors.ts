/**
 * graphql-query-builder
 *
 * Custom Error Classes
 */

/**
 * Error thrown when query validation fails.
 */
export class QueryValidationError extends Error {
  public readonly errors: string[];
  public readonly code = 'QUERY_VALIDATION_ERROR';

  constructor(message: string, errors: string[] = []) {
    super(message);
    this.name = 'QueryValidationError';
    this.errors = errors;
    Object.setPrototypeOf(this, QueryValidationError.prototype);
  }
}

/**
 * Error thrown when configuration is invalid.
 */
export class ConfigurationError extends Error {
  public readonly configKey: string;
  public readonly code = 'CONFIGURATION_ERROR';

  constructor(message: string, configKey: string) {
    super(message);
    this.name = 'ConfigurationError';
    this.configKey = configKey;
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}
