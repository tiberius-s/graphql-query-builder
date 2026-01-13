/**
 * graphql-query-builder
 *
 * Type re-exports for backward compatibility and convenience.
 *
 * Types are defined inline in their respective modules following
 * Clean Architecture principles. This module re-exports them for
 * consumers who prefer importing from a single location.
 */

import type { FieldNode, SelectionNode } from 'graphql';

// Re-export query building types
export type { BuiltQuery, QueryBuildOptions, ValidationResult } from './builder.js';
// Re-export configuration types
export type { CacheConfig, QueryBuilderConfig, UpstreamServiceConfig } from './config.js';
// Re-export datasource types
export type { GraphQLDataSourceOptions, QueryBuilderContext } from './datasource.js';
// Re-export error classes for convenience
export { ConfigurationError, QueryValidationError, UpstreamServiceError } from './errors.js';
// Re-export field extraction types
export type { ExtractedFields, ExtractionOptions, FieldSelection } from './extractor.js';

/**
 * Type guard for FieldNode.
 * Useful for filtering SelectionNode arrays to only include field nodes.
 *
 * @param node - The selection node to check
 * @returns True if the node is a FieldNode
 *
 * @example
 * ```typescript
 * const fieldNodes = selectionSet.selections.filter(isFieldNode);
 * ```
 */
export function isFieldNode(node: SelectionNode): node is FieldNode {
  return node.kind === 'Field';
}
