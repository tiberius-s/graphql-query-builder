/**
 * graphql-query-builder
 *
 * A focused library for building optimized GraphQL queries from field selections.
 * Designed for use in GraphQL server-to-server communication where the upstream
 * is also a GraphQL endpoint.
 *
 * The core workflow:
 * 1. Extract fields from client request using extractFieldsFromInfo()
 * 2. Build optimized upstream query using buildQuery() or buildQueryCached()
 * 3. Send the optimized query to the upstream GraphQL service
 *
 * @example
 * ```typescript
 * import { extractFieldsFromInfo, buildQuery, configure } from 'graphql-query-builder';
 *
 * // Configure once at startup
 * configure({
 *   maxDepth: 10,
 *   blockedFields: ['password', 'ssn'],
 * });
 *
 * // In your resolver
 * const resolver = async (parent, args, context, info) => {
 *   const { fields } = extractFieldsFromInfo(info);
 *   const { query, variables } = buildQuery('user', fields, {
 *     operationName: 'GetUser',
 *     variables: { id: args.id },
 *   });
 *   // Send query to upstream service
 * };
 * ```
 */

// === Field Extraction ===
export type { ExtractedFields, ExtractionOptions, FieldSelection } from './extractor.js';
export { extractFieldsFromInfo, getRequestedFieldNames, isFieldRequested } from './extractor.js';

// === Query Building ===
export type { BuiltQuery, QueryBuildOptions } from './builder.js';
export {
  buildQuery,
  buildQueryCached,
  buildQueryFromPaths,
  buildQueryFromPathsCached,
} from './builder.js';

// === Configuration & Validation ===
export type { QueryBuilderConfig, ValidationOptions, ValidationResult } from './config.js';
export {
  configure,
  getConfig,
  resetConfig,
  validateFields,
  assertValid,
  sanitizeFields,
} from './config.js';

// === Caching ===
export type { CacheConfig, CacheStats } from './cache.js';
export {
  initializeCache,
  clearCache,
  disableCache,
  isCacheEnabled,
  getCacheStats,
} from './cache.js';

// === Errors ===
export { QueryValidationError, ConfigurationError } from './errors.js';
