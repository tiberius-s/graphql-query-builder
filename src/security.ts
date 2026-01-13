/**
 * graphql-query-builder
 *
 * Security Validation Module
 *
 * This module implements OWASP-compliant security validations for GraphQL queries.
 * It helps prevent common GraphQL vulnerabilities including:
 * - Denial of Service through deeply nested queries
 * - Resource exhaustion through excessive field requests
 * - Data exposure through blocked field access
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/GraphQL_Cheat_Sheet.html
 */

import type { ValidationResult } from './builder.js';
import { QueryValidationError } from './errors.js';
import type { ExtractionOptions, FieldSelection } from './extractor.js';

/**
 * Security configuration options.
 */
export interface SecurityConfig {
  /**
   * Maximum query depth allowed.
   * Prevents deeply nested queries that can cause performance issues.
   * @default 10
   */
  maxDepth?: number;

  /**
   * Maximum number of fields allowed in a single query.
   * Prevents resource exhaustion attacks.
   * @default 100
   */
  maxFields?: number;

  /**
   * List of field names that are blocked from being queried.
   * Prevents exposure of sensitive fields.
   */
  blockedFields?: string[];

  /**
   * Maximum number of aliases allowed per query.
   * Prevents alias-based DoS attacks.
   * @default 10
   */
  maxAliases?: number;

  /**
   * Maximum number of root fields allowed.
   * Prevents batching attacks.
   * @default 5
   */
  maxRootFields?: number;

  /**
   * List of introspection field names to block.
   * @default ['__schema', '__type']
   */
  blockedIntrospection?: string[];

  /**
   * Whether to allow introspection queries.
   * Should typically be disabled in production.
   * @default false
   */
  allowIntrospection?: boolean;

  /**
   * Maximum query complexity score.
   * If set, queries exceeding this score will be rejected.
   */
  maxComplexity?: number;

  /**
   * Base complexity cost per field.
   * @default 1
   */
  fieldCost?: number;

  /**
   * Multiplier for fields that return lists.
   * @default 10
   */
  listMultiplier?: number;
}

/**
 * Default security configuration following OWASP recommendations.
 */
export const DEFAULT_SECURITY_CONFIG: Required<SecurityConfig> = {
  maxDepth: 10,
  maxFields: 100,
  blockedFields: [],
  maxAliases: 10,
  maxRootFields: 5,
  blockedIntrospection: ['__schema', '__type'],
  allowIntrospection: false,
  maxComplexity: 1000,
  fieldCost: 1,
  listMultiplier: 10,
};

/**
 * Validates a query against security rules.
 *
 * @param fieldCount - The number of fields in the query
 * @param depth - The maximum depth of the query
 * @param fieldNames - All field names in the query
 * @param config - Security configuration
 * @returns Validation result with any errors
 *
 * @example
 * ```typescript
 * const result = validateQuery(50, 5, ['id', 'name', 'email'], {
 *   maxFields: 100,
 *   maxDepth: 10,
 *   blockedFields: ['password', 'ssn'],
 * });
 *
 * if (!result.valid) {
 *   throw new Error(result.errors.join(', '));
 * }
 * ```
 */
export function validateQuery(
  fieldCount: number,
  depth: number,
  fieldNames: string[],
  config: Partial<SecurityConfig> = {},
): ValidationResult {
  const cfg = { ...DEFAULT_SECURITY_CONFIG, ...config };
  const errors: string[] = [];

  // Validate depth
  if (depth > cfg.maxDepth) {
    errors.push(`Query depth ${depth} exceeds maximum allowed depth of ${cfg.maxDepth}`);
  }

  // Validate field count
  if (fieldCount > cfg.maxFields) {
    errors.push(`Query contains ${fieldCount} fields, exceeding maximum of ${cfg.maxFields}`);
  }

  // Check for blocked fields
  const blockedFieldsFound = fieldNames.filter((name) =>
    cfg.blockedFields.includes(name.toLowerCase()),
  );
  if (blockedFieldsFound.length > 0) {
    errors.push(`Query contains blocked fields: ${blockedFieldsFound.join(', ')}`);
  }

  // Check for introspection if not allowed
  if (!cfg.allowIntrospection) {
    const introspectionFields = fieldNames.filter((name) =>
      cfg.blockedIntrospection.includes(name),
    );
    if (introspectionFields.length > 0) {
      errors.push(`Introspection queries are not allowed: ${introspectionFields.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates field selections against security rules.
 *
 * This function performs a more detailed validation on the full
 * field selection structure, including alias counting and complexity
 * calculation.
 *
 * @param fields - The extracted field selections
 * @param config - Security configuration
 * @returns Validation result with any errors
 */
export function validateFieldSelections(
  fields: FieldSelection[],
  config: Partial<SecurityConfig> = {},
): ValidationResult {
  const cfg = { ...DEFAULT_SECURITY_CONFIG, ...config };
  const errors: string[] = [];
  const metrics = analyzeFieldSelections(fields, cfg.blockedFields);

  // Validate depth
  if (metrics.maxDepth > cfg.maxDepth) {
    errors.push(`Query depth ${metrics.maxDepth} exceeds maximum allowed depth of ${cfg.maxDepth}`);
  }

  // Validate field count
  if (metrics.totalFields > cfg.maxFields) {
    errors.push(
      `Query contains ${metrics.totalFields} fields, exceeding maximum of ${cfg.maxFields}`,
    );
  }

  // Validate alias count
  if (metrics.aliasCount > cfg.maxAliases) {
    errors.push(
      `Query contains ${metrics.aliasCount} aliases, exceeding maximum of ${cfg.maxAliases}`,
    );
  }

  // Validate root field count
  if (fields.length > cfg.maxRootFields) {
    errors.push(
      `Query contains ${fields.length} root fields, exceeding maximum of ${cfg.maxRootFields}`,
    );
  }

  // Check for blocked fields
  if (metrics.blockedFieldsFound.length > 0) {
    errors.push(`Query contains blocked fields: ${metrics.blockedFieldsFound.join(', ')}`);
  }

  // Validate complexity if configured
  if (cfg.maxComplexity && metrics.complexity > cfg.maxComplexity) {
    errors.push(`Query complexity ${metrics.complexity} exceeds maximum of ${cfg.maxComplexity}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Analyzes field selections and returns metrics.
 */
interface FieldMetrics {
  totalFields: number;
  maxDepth: number;
  aliasCount: number;
  complexity: number;
  fieldNames: string[];
  blockedFieldsFound: string[];
}

function analyzeFieldSelections(
  fields: FieldSelection[],
  blockedFields: string[] = [],
): FieldMetrics {
  let totalFields = 0;
  let maxDepth = 0;
  let aliasCount = 0;
  let complexity = 0;
  const fieldNames: string[] = [];
  const blockedFieldsFound: string[] = [];
  const blockedLower = blockedFields.map((f) => f.toLowerCase());

  function traverse(fieldList: FieldSelection[], currentDepth: number): void {
    for (const field of fieldList) {
      totalFields++;
      fieldNames.push(field.name);

      // Check if this field is blocked
      if (blockedLower.includes(field.name.toLowerCase())) {
        blockedFieldsFound.push(field.name);
      }

      if (field.alias && field.alias !== field.name) {
        aliasCount++;
      }

      if (currentDepth > maxDepth) {
        maxDepth = currentDepth;
      }

      // Calculate complexity (basic implementation)
      complexity += DEFAULT_SECURITY_CONFIG.fieldCost;

      if (field.selections && field.selections.length > 0) {
        // Nested selections may indicate a list type, apply multiplier
        complexity += DEFAULT_SECURITY_CONFIG.listMultiplier;
        traverse(field.selections, currentDepth + 1);
      }
    }
  }

  traverse(fields, 1);

  return {
    totalFields,
    maxDepth,
    aliasCount,
    complexity,
    fieldNames,
    blockedFieldsFound,
  };
}

/**
 * Creates extraction options with security limits applied.
 *
 * @param config - Security configuration
 * @returns Extraction options with security limits
 */
export function createSecureExtractionOptions(
  config: Partial<SecurityConfig> = {},
): ExtractionOptions {
  const cfg = { ...DEFAULT_SECURITY_CONFIG, ...config };

  return {
    maxDepth: cfg.maxDepth,
    includeTypename: false,
  };
}

/**
 * Validates and throws if the query is invalid.
 *
 * @param fields - The extracted field selections
 * @param config - Security configuration
 * @throws QueryValidationError if validation fails
 */
export function assertQueryValid(
  fields: FieldSelection[],
  config: Partial<SecurityConfig> = {},
): void {
  const result = validateFieldSelections(fields, config);

  if (!result.valid) {
    throw new QueryValidationError(
      `Query validation failed: ${result.errors.join('; ')}`,
      result.errors,
    );
  }
}

/**
 * Sanitizes field selections by removing blocked fields.
 *
 * @param fields - The field selections to sanitize
 * @param blockedFields - List of blocked field names
 * @returns Sanitized field selections
 */
export function sanitizeFieldSelections(
  fields: FieldSelection[],
  blockedFields: string[] = [],
): FieldSelection[] {
  const blockedSet = new Set(blockedFields.map((f) => f.toLowerCase()));

  function sanitize(fieldList: FieldSelection[]): FieldSelection[] {
    return fieldList
      .filter((field) => !blockedSet.has(field.name.toLowerCase()))
      .map((field) => ({
        ...field,
        selections: field.selections ? sanitize(field.selections) : undefined,
      }));
  }

  return sanitize(fields);
}

/**
 * Limits the depth of field selections.
 *
 * @param fields - The field selections to limit
 * @param maxDepth - Maximum depth allowed
 * @returns Field selections limited to maxDepth
 */
export function limitFieldDepth(fields: FieldSelection[], maxDepth: number): FieldSelection[] {
  function limit(fieldList: FieldSelection[], currentDepth: number): FieldSelection[] {
    return fieldList.map((field) => ({
      ...field,
      selections:
        currentDepth < maxDepth && field.selections
          ? limit(field.selections, currentDepth + 1)
          : undefined,
    }));
  }

  return limit(fields, 1);
}

/**
 * Calculates the complexity score of a query.
 *
 * @param fields - The field selections
 * @param config - Security configuration
 * @returns The complexity score
 */
export function calculateComplexity(
  fields: FieldSelection[],
  config: Partial<SecurityConfig> = {},
): number {
  const cfg = { ...DEFAULT_SECURITY_CONFIG, ...config };
  let complexity = 0;

  function traverse(fieldList: FieldSelection[], multiplier: number): void {
    for (const field of fieldList) {
      complexity += cfg.fieldCost * multiplier;

      if (field.selections && field.selections.length > 0) {
        // Apply list multiplier for nested selections
        traverse(field.selections, multiplier * cfg.listMultiplier);
      }
    }
  }

  traverse(fields, 1);
  return complexity;
}

/**
 * Creates a security middleware function for use in resolvers.
 *
 * @param config - Security configuration
 * @returns A middleware function that validates queries
 *
 * @example
 * ```typescript
 * const securityMiddleware = createSecurityMiddleware({
 *   maxDepth: 5,
 *   maxFields: 50,
 *   blockedFields: ['password', 'ssn'],
 * });
 *
 * // Use in resolver
 * const resolvers = {
 *   Query: {
 *     user: async (parent, args, context, info) => {
 *       securityMiddleware(info);
 *       // ... rest of resolver
 *     },
 *   },
 * };
 * ```
 */
export function createSecurityMiddleware(
  config: Partial<SecurityConfig> = {},
): (fields: FieldSelection[]) => void {
  const cfg = { ...DEFAULT_SECURITY_CONFIG, ...config };

  return (fields: FieldSelection[]) => {
    assertQueryValid(fields, cfg);
  };
}

/**
 * Checks if a specific field is allowed.
 *
 * @param fieldName - The field name to check
 * @param config - Security configuration
 * @returns true if the field is allowed
 */
export function isFieldAllowed(fieldName: string, config: Partial<SecurityConfig> = {}): boolean {
  const cfg = { ...DEFAULT_SECURITY_CONFIG, ...config };
  const lowerName = fieldName.toLowerCase();

  // Check blocked fields
  if (cfg.blockedFields.some((f) => f.toLowerCase() === lowerName)) {
    return false;
  }

  // Check introspection fields
  if (!cfg.allowIntrospection && cfg.blockedIntrospection.includes(fieldName)) {
    return false;
  }

  return true;
}

/**
 * Gets a list of all blocked field names.
 *
 * @param config - Security configuration
 * @returns Array of blocked field names
 */
export function getBlockedFields(config: Partial<SecurityConfig> = {}): string[] {
  const cfg = { ...DEFAULT_SECURITY_CONFIG, ...config };
  const blocked = [...cfg.blockedFields];

  if (!cfg.allowIntrospection) {
    blocked.push(...cfg.blockedIntrospection);
  }

  return blocked;
}
