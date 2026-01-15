/**
 * graphql-query-builder
 *
 * Configuration Module
 *
 * Provides configuration and validation options for the query builder.
 * Security limits (depth, field count, blocked fields) are integrated
 * directly into the configuration rather than being separate concerns.
 */

import type { FieldSelection } from './extractor.js';
import { ConfigurationError, QueryValidationError } from './errors.js';

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
 * Configures the query builder with the given options.
 *
 * @example
 * ```typescript
 * configure({
 *   maxDepth: 5,
 *   maxFields: 50,
 *   blockedFields: ['password', 'ssn'],
 *   requiredFields: ['id'],
 * });
 * ```
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
 * Gets the current configuration.
 */
export function getConfig(): QueryBuilderConfig {
  return { ...currentConfig };
}

/**
 * Resets the configuration to defaults.
 */
export function resetConfig(): void {
  currentConfig = { ...DEFAULT_CONFIG };
}

/**
 * Validates field selections against configured limits.
 *
 * @param fields - The field selections to validate
 * @param options - Optional overrides for validation limits
 * @returns Validation result with any errors
 *
 * @example
 * ```typescript
 * const result = validateFields(extractedFields);
 * if (!result.valid) {
 *   throw new Error(result.errors.join(', '));
 * }
 * ```
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
 * Validates field selections and throws if invalid.
 *
 * @param fields - The field selections to validate
 * @param options - Optional overrides for validation limits
 * @throws QueryValidationError if validation fails
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
 * Removes blocked fields from field selections.
 *
 * @param fields - The field selections to sanitize
 * @param blockedFields - Optional override for blocked fields list
 * @returns Sanitized field selections
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
