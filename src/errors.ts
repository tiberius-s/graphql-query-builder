/**
 * graphql-query-builder
 *
 * Custom Error Classes
 *
 * Provides specialized error types for query validation and configuration issues.
 */

/**
 * Error thrown when GraphQL query validation fails.
 *
 * This error is thrown by validation functions when a query exceeds security
 * limits (depth, field count) or contains blocked fields.
 *
 * @example
 * ```typescript
 * try {
 *   assertValid(fields);
 * } catch (error) {
 *   if (error instanceof QueryValidationError) {
 *     console.error('Validation failed:', error.errors);
 *     console.error('Error code:', error.code);
 *   }
 * }
 * ```
 *
 * @see {@link assertValid} for query validation
 * @see {@link validateFields} for non-throwing validation
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
 * Error thrown when configuration values are invalid.
 *
 * This error is thrown by the {@link configure} function when provided
 * configuration options fail validation (e.g., negative numbers, wrong types).
 *
 * @example
 * ```typescript
 * try {
 *   configure({ maxDepth: -1 }); // Invalid!
 * } catch (error) {
 *   if (error instanceof ConfigurationError) {
 *     console.error('Invalid config key:', error.configKey);
 *     console.error('Error code:', error.code);
 *   }
 * }
 * ```
 *
 * @see {@link configure} for configuration options
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
