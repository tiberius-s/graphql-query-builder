/**
 * graphql-query-builder
 *
 * A TypeScript utility package for building optimized GraphQL queries
 * in Apollo Federation subgraphs to prevent server-side overfetching.
 *
 * @packageDocumentation
 *
 * @example
 * ```typescript
 * import {
 *   extractFieldsFromInfo,
 *   buildQuery,
 *   GraphQLDataSource,
 *   QueryBuilderFactory,
 * } from 'graphql-query-builder';
 *
 * // Using the factory pattern (recommended)
 * const factory = new QueryBuilderFactory();
 * const builder = factory.forService('userService');
 *
 * const resolvers = {
 *   Query: {
 *     user: async (_, args, context, info) => {
 *       // One-liner to extract and build
 *       const { query, variables } = builder.extractAndBuild(info, 'user', { id: args.id });
 *       return context.dataSources.userService.executeQuery(query, variables);
 *     },
 *   },
 * };
 * ```
 */

// ============================================================================
// Types (re-exported from their defining modules)
// ============================================================================

export type {
  BuiltQuery,
  // Query building types
  QueryBuildOptions,
  ValidationResult,
} from './builder.js';
export type {
  // Configuration types
  CacheConfig,
  ConfigInitOptions,
  ConfigProvider,
  QueryBuilderConfig,
  UpstreamServiceConfig,
} from './config.js';
export type {
  // DataSource types
  GraphQLDataSourceOptions,
  QueryBuilderContext,
} from './datasource.js';
// Custom errors
export { ConfigurationError, QueryValidationError, UpstreamServiceError } from './errors.js';
export type {
  ExtractedFields,
  ExtractionOptions,
  // Field extraction types
  FieldSelection,
} from './extractor.js';

// Type guard (backward compatibility)
export { isFieldNode } from './types.js';

// ============================================================================
// Field Extraction
// ============================================================================

export {
  extractFieldsFromInfo,
  getFieldStructure,
  getRequestedFieldNames,
  isFieldRequested,
} from './extractor.js';

// ============================================================================
// Query Building
// ============================================================================

export {
  buildMutation,
  buildQuery,
  buildQueryCached,
  buildQueryFromPaths,
  buildQueryFromPathsCached,
  buildSelectionSetFromPaths,
} from './builder.js';

// ============================================================================
// Query Cache (Performance Optimization)
// ============================================================================

export type { CacheStats, QueryCacheConfig } from './cache.js';
export {
  clearQueryCache,
  disableQueryCache,
  generateCacheKey,
  getCachedQuery,
  getQueryCacheStats,
  initializeQueryCache,
  isQueryCacheEnabled,
  setCachedQuery,
} from './cache.js';

// ============================================================================
// AST Cache (Performance Optimization)
// ============================================================================

export type { ASTCacheConfig, ASTCacheStats, SyntaxValidationResult } from './ast-cache.js';
export {
  clearASTCache,
  disableASTCache,
  getASTCacheStats,
  getCachedAST,
  initializeASTCache,
  isASTCacheEnabled,
  parseQueryCached,
  parseQueryOrThrow,
  preloadQueries,
  setCachedAST,
  validateBuiltQuerySyntax,
  validateQuerySyntax,
} from './ast-cache.js';

// ============================================================================
// Security
// ============================================================================

export type { SecurityConfig } from './security.js';
export {
  assertQueryValid,
  calculateComplexity,
  createSecurityMiddleware,
  DEFAULT_SECURITY_CONFIG,
  getBlockedFields,
  isFieldAllowed,
  limitFieldDepth,
  sanitizeFieldSelections,
  validateFieldSelections,
  validateQuery,
} from './security.js';

// ============================================================================
// Configuration
// ============================================================================

export {
  createNodeConfigProvider,
  getConfig,
  getConfigFromEnv,
  getUpstreamServiceConfig,
  initializeConfig,
  registerUpstreamService,
  resetConfig,
  setConfig,
  validateConfig,
} from './config.js';

// ============================================================================
// DataSource Integration
// ============================================================================

export {
  BearerAuthDataSource,
  createDataSourceFactory,
  GraphQLDataSource,
  HeaderAuthDataSource,
  SimpleGraphQLDataSource,
} from './datasource.js';

// ============================================================================
// Factory Pattern
// ============================================================================

export type {
  DataSourceFactoryOptions,
  QueryBuilder,
  QueryBuilderFactoryOptions,
} from './factories.js';
export {
  ConfigBuilder,
  DataSourceFactory,
  getQueryBuilderFactory,
  QueryBuilderFactory,
  resetQueryBuilderFactory,
} from './factories.js';
