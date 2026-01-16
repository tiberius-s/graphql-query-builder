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

// === Query Building ===
export type { BuiltQuery, QueryBuildOptions } from './builder.js';
export {
  buildQuery,
  buildQueryCached,
  buildQueryFromPaths,
  buildQueryFromPathsCached,
} from './builder.js';
// === Caching ===
export type { CacheConfig, CacheStats } from './cache.js';
export {
  clearCache,
  disableCache,
  getCacheStats,
  initializeCache,
  isCacheEnabled,
} from './cache.js';

// === Configuration & Validation ===
export type { QueryBuilderConfig, ValidationOptions, ValidationResult } from './config.js';
export {
  assertValid,
  configure,
  getConfig,
  resetConfig,
  sanitizeFields,
  validateFields,
} from './config.js';
// === Errors ===
export { ConfigurationError, QueryValidationError } from './errors.js';
// === Field Extraction ===
export type { ExtractedFields, ExtractionOptions, FieldSelection } from './extractor.js';
export { extractFieldsFromInfo, getRequestedFieldNames, isFieldRequested } from './extractor.js';
