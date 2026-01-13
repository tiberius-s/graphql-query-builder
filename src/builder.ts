/**
 * graphql-query-builder
 *
 * Query Builder Module
 *
 * This module provides utilities for building GraphQL query strings from
 * extracted field selections. It generates optimized queries that request
 * only the fields the client needs from upstream services.
 */

import type { FieldSelection } from './extractor.js';

// ============================================================================
// Type Definitions (Inlined for Clean Architecture)
// ============================================================================

/**
 * Configuration for building a GraphQL query string.
 */
export interface QueryBuildOptions {
  /** The operation name for the query */
  operationName?: string;
  /** Variables to include in the query */
  variables?: Record<string, unknown>;
  /** Whether to format the output query */
  pretty?: boolean;
  /** Indentation string for pretty printing */
  indent?: string;
  /** Field mappings to apply (local -> upstream) */
  fieldMappings?: Record<string, string>;
  /** Required fields to always include */
  requiredFields?: string[];
}

/**
 * Result of building a query.
 */
export interface BuiltQuery {
  /** The GraphQL query string */
  query: string;
  /** Variables extracted from the fields */
  variables: Record<string, unknown>;
  /** The operation name */
  operationName: string | null;
  /** Metadata about the built query */
  metadata: {
    fieldCount: number;
    depth: number;
    hasVariables: boolean;
  };
}

/**
 * Validation result for security checks.
 */
export interface ValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** Error messages if validation failed */
  errors: string[];
}

/**
 * Default query build options.
 */
const DEFAULT_OPTIONS: Required<QueryBuildOptions> = {
  operationName: 'UpstreamQuery',
  variables: {},
  pretty: false,
  indent: '  ',
  fieldMappings: {},
  requiredFields: [],
};

/**
 * Builds a GraphQL query string from extracted field selections.
 *
 * This function takes the field selections extracted from the client's query
 * and generates an optimized query string for the upstream service that
 * requests only the necessary fields.
 *
 * @param rootType - The root type name (e.g., 'user', 'product')
 * @param fields - The extracted field selections
 * @param options - Optional build configuration
 * @returns The built query with metadata
 *
 * @example
 * ```typescript
 * const extracted = extractFieldsFromInfo(info);
 * const { query, variables } = buildQuery('user', extracted.fields, {
 *   operationName: 'GetUser',
 *   variables: { id: args.id }
 * });
 * // query: "query GetUser($id: ID!) { user(id: $id) { email } }"
 * ```
 */
export function buildQuery(
  rootType: string,
  fields: FieldSelection[],
  options: QueryBuildOptions = {},
): BuiltQuery {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Merge required fields into the field selections
  const mergedFields = mergeRequiredFields(fields, opts.requiredFields);

  // Collect all variables used in the query
  const variableDefinitions = collectVariableDefinitions(mergedFields, opts.variables);

  // Build the selection set
  const selectionSet = buildSelectionSet(mergedFields, opts, 0);

  // Calculate metadata
  const metadata = calculateMetadata(mergedFields);

  // Build the query string
  let query: string;

  if (Object.keys(variableDefinitions).length > 0) {
    const varDefs = formatVariableDefinitions(variableDefinitions);
    query = `query ${opts.operationName}(${varDefs}) { ${rootType}${selectionSet} }`;
  } else {
    query = `query ${opts.operationName} { ${rootType}${selectionSet} }`;
  }

  // Format if pretty printing is enabled
  if (opts.pretty) {
    query = formatQuery(query, opts.indent);
  }

  return {
    query,
    variables: opts.variables,
    operationName: opts.operationName || null,
    metadata: {
      ...metadata,
      hasVariables: Object.keys(opts.variables).length > 0,
    },
  };
}

/**
 * Builds a GraphQL mutation string from field selections.
 *
 * @param mutationName - The mutation operation name
 * @param inputFields - The input fields for the mutation
 * @param returnFields - The fields to return from the mutation
 * @param options - Optional build configuration
 * @returns The built mutation with metadata
 */
export function buildMutation(
  mutationName: string,
  inputFields: Record<string, unknown>,
  returnFields: FieldSelection[],
  options: QueryBuildOptions = {},
): BuiltQuery {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Build the selection set for return fields
  const selectionSet = buildSelectionSet(returnFields, opts, 0);

  // Build input arguments
  const inputArgs = formatInputArguments(inputFields);

  // Calculate metadata
  const metadata = calculateMetadata(returnFields);

  // Build the mutation string
  const mutationOp = opts.operationName || 'Mutation';
  let query = `mutation ${mutationOp} { ${mutationName}(${inputArgs})${selectionSet} }`;

  // Format if pretty printing is enabled
  if (opts.pretty) {
    query = formatQuery(query, opts.indent);
  }

  return {
    query,
    variables: opts.variables,
    operationName: mutationOp,
    metadata: {
      ...metadata,
      hasVariables: Object.keys(opts.variables).length > 0,
    },
  };
}

/**
 * Builds a selection set string from field selections.
 */
function buildSelectionSet(
  fields: FieldSelection[],
  options: Required<QueryBuildOptions>,
  depth: number,
): string {
  if (fields.length === 0) {
    return '';
  }

  const fieldStrings = fields.map((field) => {
    // Apply field mapping if configured
    const mappedName = options.fieldMappings?.[field.name] || field.name;

    let fieldStr = '';

    // Add alias if present
    if (field.alias && field.alias !== mappedName) {
      fieldStr = `${field.alias}: ${mappedName}`;
    } else {
      fieldStr = mappedName;
    }

    // Add arguments if present
    if (field.arguments && Object.keys(field.arguments).length > 0) {
      fieldStr += `(${formatFieldArguments(field.arguments)})`;
    }

    // Add nested selections if present
    if (field.selections && field.selections.length > 0) {
      fieldStr += buildSelectionSet(field.selections, options, depth + 1);
    }

    return fieldStr;
  });

  return ` { ${fieldStrings.join(' ')} }`;
}

/**
 * Formats field arguments into a GraphQL argument string.
 */
function formatFieldArguments(args: Record<string, unknown>): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(args)) {
    if (isVariableReference(value)) {
      parts.push(`${key}: $${(value as { __variable: string }).__variable}`);
    } else {
      parts.push(`${key}: ${formatValue(value)}`);
    }
  }

  return parts.join(', ');
}

/**
 * Formats input arguments for mutations.
 */
function formatInputArguments(input: Record<string, unknown>): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(input)) {
    parts.push(`${key}: ${formatValue(value)}`);
  }

  return parts.join(', ');
}

/**
 * Formats a value for inclusion in a GraphQL query.
 */
function formatValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    // Escape special characters in strings
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const items = value.map(formatValue);
    return `[${items.join(', ')}]`;
  }

  if (typeof value === 'object') {
    if (isVariableReference(value)) {
      return `$${(value as { __variable: string }).__variable}`;
    }

    // Format as input object
    const fields: string[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      fields.push(`${k}: ${formatValue(v)}`);
    }
    return `{ ${fields.join(', ')} }`;
  }

  return String(value);
}

/**
 * Checks if a value is a variable reference.
 */
function isVariableReference(value: unknown): value is { __variable: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__variable' in value &&
    typeof (value as { __variable: unknown }).__variable === 'string'
  );
}

/**
 * Collects variable definitions from field arguments.
 */
function collectVariableDefinitions(
  fields: FieldSelection[],
  providedVariables: Record<string, unknown>,
): Record<string, string> {
  const definitions: Record<string, string> = {};

  function traverse(fieldList: FieldSelection[]): void {
    for (const field of fieldList) {
      if (field.arguments) {
        for (const value of Object.values(field.arguments)) {
          if (isVariableReference(value)) {
            const varName = value.__variable;
            const varValue = providedVariables[varName];
            definitions[varName] = inferVariableType(varValue);
          }
        }
      }

      if (field.selections) {
        traverse(field.selections);
      }
    }
  }

  traverse(fields);
  return definitions;
}

/**
 * Infers the GraphQL type of a variable from its value.
 */
function inferVariableType(value: unknown): string {
  if (value === null || value === undefined) {
    return 'String';
  }

  if (typeof value === 'string') {
    // Check for common ID patterns
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return 'ID!';
    }
    return 'String!';
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'Int!' : 'Float!';
  }

  if (typeof value === 'boolean') {
    return 'Boolean!';
  }

  if (Array.isArray(value)) {
    if (value.length > 0) {
      return `[${inferVariableType(value[0])}]`;
    }
    return '[String]';
  }

  return 'String';
}

/**
 * Formats variable definitions for the query header.
 */
function formatVariableDefinitions(definitions: Record<string, string>): string {
  const parts: string[] = [];

  for (const [name, type] of Object.entries(definitions)) {
    parts.push(`$${name}: ${type}`);
  }

  return parts.join(', ');
}

/**
 * Merges required fields into the field selections.
 */
function mergeRequiredFields(fields: FieldSelection[], requiredFields: string[]): FieldSelection[] {
  const existingNames = new Set(fields.map((f) => f.name));
  const merged = [...fields];

  for (const required of requiredFields) {
    if (!existingNames.has(required)) {
      merged.push({
        name: required,
        path: [required],
        depth: 1,
      });
    }
  }

  return merged;
}

/**
 * Calculates metadata about the field selections.
 */
function calculateMetadata(fields: FieldSelection[]): { fieldCount: number; depth: number } {
  let fieldCount = 0;
  let maxDepth = 0;

  function traverse(fieldList: FieldSelection[], currentDepth: number): void {
    for (const field of fieldList) {
      fieldCount++;
      if (currentDepth > maxDepth) {
        maxDepth = currentDepth;
      }

      if (field.selections) {
        traverse(field.selections, currentDepth + 1);
      }
    }
  }

  traverse(fields, 1);

  return { fieldCount, depth: maxDepth };
}

/**
 * Formats a query string with proper indentation.
 */
function formatQuery(query: string, indent: string): string {
  let result = '';
  let indentLevel = 0;
  let inString = false;
  let prevChar = '';

  for (const char of query) {
    if (char === '"' && prevChar !== '\\') {
      inString = !inString;
    }

    if (!inString) {
      if (char === '{') {
        result += ' {\n';
        indentLevel++;
        result += indent.repeat(indentLevel);
      } else if (char === '}') {
        indentLevel--;
        result += `\n${indent.repeat(indentLevel)}}`;
      } else if (char === ' ' && prevChar === ' ') {
        // Skip double spaces
      } else if (char === '\n') {
        result += `\n${indent.repeat(indentLevel)}`;
      } else {
        result += char;
      }
    } else {
      result += char;
    }

    prevChar = char;
  }

  return result.trim();
}

/**
 * Creates a query from a simple field path array.
 * Useful for quick queries without full field extraction.
 *
 * @param rootType - The root type/field name
 * @param fieldPaths - Array of dot-separated field paths
 * @param options - Optional build configuration
 * @returns The built query
 *
 * @example
 * ```typescript
 * const { query } = buildQueryFromPaths('user', ['id', 'email', 'profile.avatar']);
 * // query: "query { user { id email profile { avatar } } }"
 * ```
 */
export function buildQueryFromPaths(
  rootType: string,
  fieldPaths: string[],
  options: QueryBuildOptions = {},
): BuiltQuery {
  const fields = pathsToFieldSelections(fieldPaths);
  return buildQuery(rootType, fields, options);
}

/**
 * Converts dot-separated paths to FieldSelection array.
 */
function pathsToFieldSelections(paths: string[]): FieldSelection[] {
  // Build a tree structure first
  interface TreeNode {
    name: string;
    path: string[];
    depth: number;
    children: Record<string, TreeNode>;
  }

  const root: Record<string, TreeNode> = {};

  for (const path of paths) {
    const parts = path.split('.');
    let current = root;
    const pathSoFar: string[] = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      pathSoFar.push(part);

      if (!current[part]) {
        current[part] = {
          name: part,
          path: [...pathSoFar],
          depth: i + 1,
          children: {},
        };
      }

      if (i < parts.length - 1) {
        current = current[part].children;
      }
    }
  }

  // Convert tree to FieldSelection array
  function treeToSelections(nodes: Record<string, TreeNode>): FieldSelection[] {
    return Object.values(nodes).map((node) => {
      const childKeys = Object.keys(node.children);
      return {
        name: node.name,
        path: node.path,
        depth: node.depth,
        selections: childKeys.length > 0 ? treeToSelections(node.children) : undefined,
      };
    });
  }

  return treeToSelections(root);
}

/**
 * Builds a selection set string directly from field paths.
 * A more direct approach when you don't need the full FieldSelection structure.
 *
 * @param fieldPaths - Array of dot-separated field paths
 * @returns The selection set string (without outer braces)
 *
 * @example
 * ```typescript
 * const selectionSet = buildSelectionSetFromPaths(['id', 'name', 'address.city']);
 * // "id name address { city }"
 * ```
 */
export function buildSelectionSetFromPaths(fieldPaths: string[]): string {
  // Build a tree structure from paths
  const tree: Record<string, unknown> = {};

  for (const path of fieldPaths) {
    const parts = path.split('.');
    let current = tree;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (i === parts.length - 1) {
        // Leaf node
        if (!(part in current)) {
          current[part] = true;
        }
      } else {
        // Branch node
        if (!(part in current) || current[part] === true) {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }
    }
  }

  // Convert tree to selection set string
  return treeToSelectionSet(tree);
}

/**
 * Converts a tree structure to a selection set string.
 */
function treeToSelectionSet(tree: Record<string, unknown>): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(tree)) {
    if (value === true) {
      parts.push(key);
    } else if (typeof value === 'object' && value !== null) {
      const nested = treeToSelectionSet(value as Record<string, unknown>);
      parts.push(`${key} { ${nested} }`);
    }
  }

  return parts.join(' ');
}

// ============================================================================
// Cached Query Building (Performance Optimization)
// ============================================================================

import { generateCacheKey, getCachedQuery, isQueryCacheEnabled, setCachedQuery } from './cache.js';

/**
 * Builds a GraphQL query with caching support.
 *
 * This function wraps buildQuery with an LRU cache to avoid rebuilding
 * identical query structures. The cache key is based on the structural
 * shape of the query (field names, nesting, argument names) rather than
 * actual values.
 *
 * @param rootType - The root type name (e.g., 'user', 'product')
 * @param fields - The extracted field selections
 * @param options - Optional build configuration
 * @returns The built query with metadata
 *
 * @example
 * ```typescript
 * import { initializeQueryCache, buildQueryCached } from 'graphql-query-builder';
 *
 * // Enable caching at startup
 * initializeQueryCache({ maxSize: 500 });
 *
 * // Use cached builds in resolvers
 * const { query, variables } = buildQueryCached('user', fields, {
 *   operationName: 'GetUser',
 *   variables: { id: args.id }
 * });
 * ```
 */
export function buildQueryCached(
  rootType: string,
  fields: FieldSelection[],
  options: QueryBuildOptions = {},
): BuiltQuery {
  // If caching is disabled, fall back to regular build
  if (!isQueryCacheEnabled()) {
    return buildQuery(rootType, fields, options);
  }

  const cacheKey = generateCacheKey(rootType, fields, options);
  const cached = getCachedQuery(cacheKey);

  if (cached) {
    // Return cached query with fresh variables
    return {
      ...cached,
      variables: options.variables || {},
    };
  }

  // Build and cache
  const result = buildQuery(rootType, fields, options);
  setCachedQuery(cacheKey, result);

  return result;
}

/**
 * Builds a GraphQL query from field paths with caching support.
 *
 * @param rootType - The root type name
 * @param fieldPaths - Array of dot-separated field paths
 * @param options - Optional build configuration
 * @returns The built query with metadata
 */
export function buildQueryFromPathsCached(
  rootType: string,
  fieldPaths: string[],
  options: QueryBuildOptions = {},
): BuiltQuery {
  // If caching is disabled, fall back to regular build
  if (!isQueryCacheEnabled()) {
    return buildQueryFromPaths(rootType, fieldPaths, options);
  }

  // Use paths as cache key component
  const pathsKey = fieldPaths.sort().join(',');
  const optionsKey = JSON.stringify({
    operationName: options.operationName,
    requiredFields: options.requiredFields,
    fieldMappings: options.fieldMappings,
  });
  const cacheKey = `paths:${rootType}:${pathsKey}:${optionsKey}`;

  const cached = getCachedQuery(cacheKey);

  if (cached) {
    return {
      ...cached,
      variables: options.variables || {},
    };
  }

  const result = buildQueryFromPaths(rootType, fieldPaths, options);
  setCachedQuery(cacheKey, result);

  return result;
}
