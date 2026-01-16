/**
 * graphql-query-builder
 *
 * Configuration Module
 *
 * Provides configuration and validation options for the query builder.
 * Security limits (depth, field count, blocked fields) are integrated
 * directly into the configuration rather than being separate concerns.
 */

import { ConfigurationError, QueryValidationError } from './errors.js';
import type { FieldSelection } from './extractor.js';

/**
 * Configuration for the query builder.
 */
export interface QueryBuilderConfig {
  /** Maximum depth of nested fields allowed (default: 10) */
  maxDepth: number;
  /** Maximum number of fields allowed per query (default: 100) */
  maxFields: number;
  /** Field names that should never be included in queries */
  blockedFields: string[];
  /** Fields that should always be included in queries */
  requiredFields: string[];
  /** Field name mappings (local name -> upstream name) */
  fieldMappings: Record<string, string>;
}

/**
 * Options for validating field selections.
 */
export interface ValidationOptions {
  maxDepth?: number;
  maxFields?: number;
  blockedFields?: string[];
}

/**
 * Result of field selection validation.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const DEFAULT_CONFIG: QueryBuilderConfig = {
  maxDepth: 10,
  maxFields: 100,
  blockedFields: [],
  requiredFields: [],
  fieldMappings: {},
};

let currentConfig: QueryBuilderConfig = { ...DEFAULT_CONFIG };

/**
 * Configures the query builder with global settings.
 *
 * Configuration includes security limits (depth, field count), field mappings,
 * blocked fields, and required fields. Settings are validated before being applied.
 *
 * @param options - Configuration options to apply
 * @param options.maxDepth - Maximum query nesting depth allowed (must be >= 1)
 * @param options.maxFields - Maximum number of fields per query (must be >= 1)
 * @param options.blockedFields - Fields that should never be included in queries
 * @param options.requiredFields - Fields that should always be included
 * @param options.fieldMappings - Field name translations (local -> upstream)
 *
 * @throws {ConfigurationError} If any configuration value is invalid
 *
 * @example
 * ```typescript
 * configure({
 *   maxDepth: 5,
 *   maxFields: 50,
 *   blockedFields: ['password', 'ssn', 'creditCard'],
 *   requiredFields: ['id', 'version'],
 *   fieldMappings: { email: 'emailAddress', name: 'fullName' }
 * });
 * ```
 *
 * @remarks
 * Configuration is global and affects all subsequent query building operations.
 * Call this once at application startup.
 *
 * @see {@link getConfig} to retrieve current configuration
 * @see {@link resetConfig} to restore defaults
 */
export function configure(options: Partial<QueryBuilderConfig>): void {
  if (
    options.maxDepth !== undefined &&
    (typeof options.maxDepth !== 'number' || options.maxDepth < 1)
  ) {
    throw new ConfigurationError('maxDepth must be a positive number', 'maxDepth');
  }
  if (
    options.maxFields !== undefined &&
    (typeof options.maxFields !== 'number' || options.maxFields < 1)
  ) {
    throw new ConfigurationError('maxFields must be a positive number', 'maxFields');
  }
  if (options.blockedFields !== undefined && !Array.isArray(options.blockedFields)) {
    throw new ConfigurationError('blockedFields must be an array', 'blockedFields');
  }
  if (options.requiredFields !== undefined && !Array.isArray(options.requiredFields)) {
    throw new ConfigurationError('requiredFields must be an array', 'requiredFields');
  }
  if (options.fieldMappings !== undefined && typeof options.fieldMappings !== 'object') {
    throw new ConfigurationError('fieldMappings must be an object', 'fieldMappings');
  }

  currentConfig = { ...currentConfig, ...options };
}

/**
 * Retrieves the current query builder configuration.
 *
 * @returns A copy of the current configuration object
 *
 * @example
 * ```typescript
 * const config = getConfig();
 * console.log(`Max depth: ${config.maxDepth}`);
 * console.log(`Blocked fields: ${config.blockedFields.join(', ')}`);
 * ```
 *
 * @remarks
 * Returns a copy to prevent external modification. Use {@link configure}
 * to change configuration settings.
 *
 * @see {@link configure} to update configuration
 */
export function getConfig(): QueryBuilderConfig {
  return { ...currentConfig };
}

/**
 * Resets configuration to default values.
 *
 * Default configuration:
 * - maxDepth: 10
 * - maxFields: 100
 * - blockedFields: []
 * - requiredFields: []
 * - fieldMappings: {}
 *
 * @example
 * ```typescript
 * resetConfig();
 * ```
 *
 * @see {@link configure} to apply custom configuration
 */
export function resetConfig(): void {
  currentConfig = { ...DEFAULT_CONFIG };
}

/**
 * Validates field selections against configured security limits.
 *
 * Checks for:
 * - Query depth exceeding maxDepth
 * - Field count exceeding maxFields
 * - Presence of blocked fields
 *
 * @param fields - The field selections to validate
 * @param options - Optional overrides for validation limits
 * @param options.maxDepth - Override global maxDepth for this validation
 * @param options.maxFields - Override global maxFields for this validation
 * @param options.blockedFields - Override global blockedFields for this validation
 * @returns Validation result containing validity flag and error messages
 *
 * @example
 * ```typescript
 * const result = validateFields(extractedFields);
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 *   throw new Error(result.errors.join(', '));
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Validate with stricter limits for this request
 * const result = validateFields(fields, { maxDepth: 3, maxFields: 20 });
 * ```
 *
 * @see {@link assertValid} for throwing validation errors
 * @see {@link configure} to set global validation limits
 */
export function validateFields(
  fields: FieldSelection[],
  options: ValidationOptions = {},
): ValidationResult {
  const maxDepth = options.maxDepth ?? currentConfig.maxDepth;
  const maxFields = options.maxFields ?? currentConfig.maxFields;
  const blockedFields = options.blockedFields ?? currentConfig.blockedFields;
  const blockedLower = new Set(blockedFields.map((f) => f.toLowerCase()));
  const errors: string[] = [];

  let totalFields = 0;
  let maxDepthFound = 0;
  const blockedFound: string[] = [];

  function traverse(fieldList: FieldSelection[], depth: number): void {
    for (const field of fieldList) {
      totalFields++;
      if (depth > maxDepthFound) maxDepthFound = depth;

      if (blockedLower.has(field.name.toLowerCase())) {
        blockedFound.push(field.name);
      }

      if (field.selections?.length) {
        traverse(field.selections, depth + 1);
      }
    }
  }

  traverse(fields, 1);

  if (maxDepthFound > maxDepth) {
    errors.push(`Query depth ${maxDepthFound} exceeds maximum of ${maxDepth}`);
  }
  if (totalFields > maxFields) {
    errors.push(`Query has ${totalFields} fields, exceeding maximum of ${maxFields}`);
  }
  if (blockedFound.length > 0) {
    errors.push(`Query contains blocked fields: ${blockedFound.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates field selections and throws an error if validation fails.
 *
 * This is a convenience wrapper around {@link validateFields} that throws
 * instead of returning a validation result object.
 *
 * @param fields - The field selections to validate
 * @param options - Optional overrides for validation limits
 * @throws {QueryValidationError} If validation fails, with detailed error messages
 *
 * @example
 * ```typescript
 * try {
 *   assertValid(extractedFields);
 *   // Proceed with query building
 * } catch (error) {
 *   if (error instanceof QueryValidationError) {
 *     console.error('Invalid query:', error.errors);
 *   }
 * }
 * ```
 *
 * @see {@link validateFields} for non-throwing validation
 */
export function assertValid(fields: FieldSelection[], options: ValidationOptions = {}): void {
  const result = validateFields(fields, options);
  if (!result.valid) {
    throw new QueryValidationError(
      `Query validation failed: ${result.errors.join('; ')}`,
      result.errors,
    );
  }
}

/**
 * Removes blocked fields from field selections recursively.
 *
 * This function filters out any fields that match the blocked fields list,
 * traversing nested selections to ensure complete sanitization.
 *
 * @param fields - The field selections to sanitize
 * @param blockedFields - Optional override for the blocked fields list
 * @returns New array of field selections with blocked fields removed
 *
 * @example
 * ```typescript
 * const sanitized = sanitizeFields(extractedFields);
 * // All password, ssn, etc. fields are removed
 * ```
 *
 * @example
 * ```typescript
 * // Use custom blocked list for this operation
 * const sanitized = sanitizeFields(fields, ['internalId', 'deletedAt']);
 * ```
 *
 * @remarks
 * - Field name matching is case-insensitive
 * - Returns a new array; does not modify the input
 * - Blocked fields in nested selections are also removed
 *
 * @see {@link configure} to set global blocked fields list
 */
export function sanitizeFields(
  fields: FieldSelection[],
  blockedFields?: string[],
): FieldSelection[] {
  const blocked = new Set(
    (blockedFields ?? currentConfig.blockedFields).map((f) => f.toLowerCase()),
  );

  function sanitize(fieldList: FieldSelection[]): FieldSelection[] {
    return fieldList
      .filter((field) => !blocked.has(field.name.toLowerCase()))
      .map((field) => ({
        ...field,
        selections: field.selections ? sanitize(field.selections) : undefined,
      }));
  }

  return sanitize(fields);
}
