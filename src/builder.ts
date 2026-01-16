/**
 * graphql-query-builder
 *
 * Query Builder Module
 *
 * Builds optimized GraphQL query strings from field selections.
 * This is the core functionality of the package.
 */

import { generateCacheKey, getCachedQuery, isCacheEnabled, setCachedQuery } from './cache.js';
import { getConfig } from './config.js';
import type { FieldSelection } from './extractor.js';

/**
 * Options for building a GraphQL query.
 */
export interface QueryBuildOptions {
  /** Operation name for the query */
  operationName?: string;
  /** Operation type (default: 'query') */
  operationType?: 'query' | 'mutation';
  /** Variables to include in the query */
  variables?: Record<string, unknown>;
  /** Explicit GraphQL types for variables (e.g. `{ id: 'ID!', input: 'UpdateUserInput!' }`) */
  variableTypes?: Record<string, string>;
  /** Arguments to apply to the root field */
  rootArguments?: Record<string, unknown>;
  /** Field name mappings (local -> upstream) */
  fieldMappings?: Record<string, string>;
  /** Fields to always include regardless of selection */
  requiredFields?: string[];
}

/**
 * Result of building a query.
 */
export interface BuiltQuery {
  /** The GraphQL query string */
  query: string;
  /** Variables for the query */
  variables: Record<string, unknown>;
  /** Operation name if provided */
  operationName: string | null;
  /** Query metadata */
  metadata: {
    fieldCount: number;
    depth: number;
    hasVariables: boolean;
  };
}

const DEFAULT_OPTIONS: Required<QueryBuildOptions> = {
  operationName: 'UpstreamQuery',
  operationType: 'query',
  variables: {},
  variableTypes: {},
  rootArguments: {},
  fieldMappings: {},
  requiredFields: [],
};

/**
 * Builds a GraphQL query string from field selections.
 *
 * @param rootField - The root field to query (e.g., 'user', 'product')
 * @param fields - The extracted field selections
 * @param options - Build options
 * @returns The built query with metadata
 *
 * @example
 * ```typescript
 * const extracted = extractFieldsFromInfo(info);
 * const { query, variables } = buildQuery('user', extracted.fields, {
 *   operationName: 'GetUser',
 *   variables: { id: args.id }
 * });
 * ```
 */
export function buildQuery(
  rootField: string,
  fields: FieldSelection[],
  options: QueryBuildOptions = {},
): BuiltQuery {
  const config = getConfig();
  const opts: Required<QueryBuildOptions> = {
    ...DEFAULT_OPTIONS,
    fieldMappings: { ...config.fieldMappings, ...options.fieldMappings },
    requiredFields: [...config.requiredFields, ...(options.requiredFields ?? [])],
    operationName: options.operationName ?? DEFAULT_OPTIONS.operationName,
    operationType: options.operationType ?? DEFAULT_OPTIONS.operationType,
    variables: options.variables ?? DEFAULT_OPTIONS.variables,
    variableTypes: options.variableTypes ?? DEFAULT_OPTIONS.variableTypes,
    rootArguments: options.rootArguments ?? DEFAULT_OPTIONS.rootArguments,
  };

  // Add required fields
  const mergedFields = mergeRequiredFields(fields, opts.requiredFields);

  // Collect variables
  const varDefs = collectVariableDefinitions(
    mergedFields,
    opts.variables,
    opts.variableTypes,
    opts.rootArguments,
  );

  // Build selection set
  const selectionSet = buildSelectionSet(mergedFields, opts.fieldMappings);

  // Calculate metadata
  const metadata = calculateMetadata(mergedFields);

  // Build query string
  const rootFieldWithArgs = formatRootField(rootField, opts.rootArguments);
  let query: string;
  if (Object.keys(varDefs).length > 0) {
    const varDefsStr = formatVariableDefinitions(varDefs);
    query = `${opts.operationType} ${opts.operationName}(${varDefsStr}) { ${rootFieldWithArgs}${selectionSet} }`;
  } else {
    query = `${opts.operationType} ${opts.operationName} { ${rootFieldWithArgs}${selectionSet} }`;
  }

  return {
    query,
    variables: opts.variables,
    operationName: opts.operationName,
    metadata: { ...metadata, hasVariables: Object.keys(opts.variables).length > 0 },
  };
}

/**
 * Builds a GraphQL query with caching enabled.
 *
 * This function uses MD5 hashing to generate a cache key based on the root field,
 * field selections, and options. If a cached result exists, it returns the cached
 * query string while preserving the current variables.
 *
 * Cache hits avoid expensive query string generation, making this ideal for
 * high-throughput scenarios with repeated query patterns.
 *
 * @param rootField - The root field to query (e.g., 'user', 'product')
 * @param fields - The extracted field selections from the client request
 * @param options - Build options including variables, operation name, etc.
 * @returns The built query with metadata (may be from cache)
 *
 * @example
 * ```typescript
 * initializeCache({ maxSize: 1000, ttl: 60000 });
 *
 * const { query, variables } = buildQueryCached('user', fields, {
 *   operationName: 'GetUser',
 *   variables: { id: args.id },
 *   rootArguments: { id: { __variable: 'id' } }
 * });
 * // Subsequent calls with identical structure will use cached query
 * ```
 *
 * @see {@link buildQuery} for non-cached query building
 * @see {@link initializeCache} to configure cache behavior
 */
export function buildQueryCached(
  rootField: string,
  fields: FieldSelection[],
  options: QueryBuildOptions = {},
): BuiltQuery {
  if (!isCacheEnabled()) {
    return buildQuery(rootField, fields, options);
  }

  const key = generateCacheKey(rootField, fields, options);
  const cached = getCachedQuery(key);

  if (cached) {
    return { ...cached, variables: options.variables ?? {} };
  }

  const result = buildQuery(rootField, fields, options);
  setCachedQuery(key, result);
  return result;
}

/**
 * Builds a GraphQL query from simple field path strings.
 *
 * This is a convenience method for when you have a simple array of dot-notation
 * field paths instead of a full field selection tree. Useful for programmatic
 * query generation or when working with simple field lists.
 *
 * @param rootField - The root field to query (e.g., 'user', 'product')
 * @param paths - Array of dot-notation field paths (e.g., ['name', 'email', 'profile.bio'])
 * @param options - Build options including variables, operation name, etc.
 * @returns The built query with metadata
 *
 * @example
 * ```typescript
 * const { query } = buildQueryFromPaths('user', [
 *   'id',
 *   'name',
 *   'email',
 *   'profile.bio',
 *   'profile.avatar'
 * ], {
 *   operationName: 'GetUser',
 *   variables: { id: '123' }
 * });
 * // Generates: query GetUser { user { id name email profile { bio avatar } } }
 * ```
 *
 * @see {@link buildQuery} for building from full field selections
 */
export function buildQueryFromPaths(
  rootField: string,
  paths: string[],
  options: QueryBuildOptions = {},
): BuiltQuery {
  const fields = pathsToFieldSelections(paths);
  return buildQuery(rootField, fields, options);
}

/**
 * Builds a GraphQL query from field paths with caching enabled.
 *
 * Combines the convenience of path-based query building with the performance
 * benefits of caching. Ideal for scenarios with repeated patterns.
 *
 * @param rootField - The root field to query (e.g., 'user', 'product')
 * @param paths - Array of dot-notation field paths
 * @param options - Build options including variables, operation name, etc.
 * @returns The built query with metadata (may be from cache)
 *
 * @example
 * ```typescript
 * const { query } = buildQueryFromPathsCached('user', [
 *   'id', 'name', 'profile.avatar'
 * ], { operationName: 'GetUserBasic' });
 * ```
 *
 * @see {@link buildQueryFromPaths} for non-cached path-based building
 * @see {@link buildQueryCached} for cached query building from field selections
 */
export function buildQueryFromPathsCached(
  rootField: string,
  paths: string[],
  options: QueryBuildOptions = {},
): BuiltQuery {
  const fields = pathsToFieldSelections(paths);
  return buildQueryCached(rootField, fields, options);
}

// === Internal helpers ===

function buildSelectionSet(
  fields: FieldSelection[],
  fieldMappings: Record<string, string>,
): string {
  if (fields.length === 0) return '';

  const fieldStrings = fields.map((field) => {
    const mappedName = fieldMappings[field.name] ?? field.name;
    let str =
      field.alias && field.alias !== mappedName ? `${field.alias}: ${mappedName}` : mappedName;

    if (field.arguments && Object.keys(field.arguments).length > 0) {
      str += `(${formatArguments(field.arguments)})`;
    }

    if (field.selections?.length) {
      str += buildSelectionSet(field.selections, fieldMappings);
    }

    return str;
  });

  return ` { ${fieldStrings.join(' ')} }`;
}

function formatArguments(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([key, value]) => {
      if (isVariableRef(value)) {
        return `${key}: $${(value as { __variable: string }).__variable}`;
      }
      return `${key}: ${formatValue(value)}`;
    })
    .join(', ');
}

function formatRootField(rootField: string, rootArguments: Record<string, unknown>): string {
  if (!rootArguments || Object.keys(rootArguments).length === 0) return rootField;
  return `${rootField}(${formatArguments(rootArguments)})`;
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`;
  if (typeof value === 'object') {
    if (isVariableRef(value)) return `$${(value as { __variable: string }).__variable}`;
    const fields = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `${k}: ${formatValue(v)}`,
    );
    return `{ ${fields.join(', ')} }`;
  }
  return String(value);
}

function isVariableRef(value: unknown): value is { __variable: string } {
  return typeof value === 'object' && value !== null && '__variable' in value;
}

function collectVariableDefinitions(
  fields: FieldSelection[],
  variables: Record<string, unknown>,
  variableTypes: Record<string, string>,
  rootArguments: Record<string, unknown>,
): Record<string, string> {
  const defs: Record<string, string> = {};

  function collectFromValue(value: unknown): void {
    if (isVariableRef(value)) {
      const name = value.__variable;
      defs[name] = variableTypes[name] ?? inferType(variables[name]);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) collectFromValue(item);
      return;
    }

    if (typeof value === 'object' && value !== null) {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        collectFromValue(nested);
      }
    }
  }

  function traverse(fieldList: FieldSelection[]): void {
    for (const field of fieldList) {
      if (field.arguments) {
        collectFromValue(field.arguments);
      }
      if (field.selections) traverse(field.selections);
    }
  }

  collectFromValue(rootArguments);
  traverse(fields);
  return defs;
}

function inferType(value: unknown): string {
  if (value === null || value === undefined) return 'String';
  if (typeof value === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return 'ID!';
    }
    if (/^\d+$/.test(value)) {
      return 'ID!';
    }
    return 'String!';
  }
  if (typeof value === 'number') return Number.isInteger(value) ? 'Int!' : 'Float!';
  if (typeof value === 'boolean') return 'Boolean!';
  if (Array.isArray(value)) return value.length > 0 ? `[${inferType(value[0])}]` : '[String]';
  return 'String';
}

function formatVariableDefinitions(defs: Record<string, string>): string {
  return Object.entries(defs)
    .map(([name, type]) => `$${name}: ${type}`)
    .join(', ');
}

function mergeRequiredFields(fields: FieldSelection[], required: string[]): FieldSelection[] {
  const existing = new Set(fields.map((f) => f.name));
  const merged = [...fields];

  for (const name of required) {
    if (!existing.has(name)) {
      merged.push({ name, path: [name], depth: 1 });
    }
  }

  return merged;
}

function calculateMetadata(fields: FieldSelection[]): { fieldCount: number; depth: number } {
  let count = 0;
  let maxDepth = 0;

  function traverse(list: FieldSelection[], depth: number): void {
    for (const field of list) {
      count++;
      if (depth > maxDepth) maxDepth = depth;
      if (field.selections) traverse(field.selections, depth + 1);
    }
  }

  traverse(fields, 1);
  return { fieldCount: count, depth: maxDepth };
}

function pathsToFieldSelections(paths: string[]): FieldSelection[] {
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
        current[part] = { name: part, path: [...pathSoFar], depth: i + 1, children: {} };
      }

      if (i < parts.length - 1) {
        current = current[part].children;
      }
    }
  }

  function toSelections(nodes: Record<string, TreeNode>): FieldSelection[] {
    return Object.values(nodes).map((node) => ({
      name: node.name,
      path: node.path,
      depth: node.depth,
      selections: Object.keys(node.children).length > 0 ? toSelections(node.children) : undefined,
    }));
  }

  return toSelections(root);
}
