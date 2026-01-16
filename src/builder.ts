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
  /** Variables to include in the query */
  variables?: Record<string, unknown>;
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
  variables: {},
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
    variables: options.variables ?? DEFAULT_OPTIONS.variables,
  };

  // Add required fields
  const mergedFields = mergeRequiredFields(fields, opts.requiredFields);

  // Collect variables
  const varDefs = collectVariableDefinitions(mergedFields, opts.variables);

  // Build selection set
  const selectionSet = buildSelectionSet(mergedFields, opts.fieldMappings);

  // Calculate metadata
  const metadata = calculateMetadata(mergedFields);

  // Build query string
  let query: string;
  if (Object.keys(varDefs).length > 0) {
    const varDefsStr = formatVariableDefinitions(varDefs);
    query = `query ${opts.operationName}(${varDefsStr}) { ${rootField}${selectionSet} }`;
  } else {
    query = `query ${opts.operationName} { ${rootField}${selectionSet} }`;
  }

  return {
    query,
    variables: opts.variables,
    operationName: opts.operationName,
    metadata: { ...metadata, hasVariables: Object.keys(opts.variables).length > 0 },
  };
}

/**
 * Builds a GraphQL query with caching.
 * Uses MD5 hashing for efficient cache key comparison.
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
 * Builds a query from field paths (dot-separated strings).
 *
 * @example
 * ```typescript
 * const { query } = buildQueryFromPaths('user', ['id', 'email', 'profile.avatar']);
 * ```
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
 * Builds a query from paths with caching.
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
): Record<string, string> {
  const defs: Record<string, string> = {};

  function traverse(fieldList: FieldSelection[]): void {
    for (const field of fieldList) {
      if (field.arguments) {
        for (const value of Object.values(field.arguments)) {
          if (isVariableRef(value)) {
            const name = value.__variable;
            defs[name] = inferType(variables[name]);
          }
        }
      }
      if (field.selections) traverse(field.selections);
    }
  }

  traverse(fields);
  return defs;
}

function inferType(value: unknown): string {
  if (value === null || value === undefined) return 'String';
  if (typeof value === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
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
