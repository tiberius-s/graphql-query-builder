/**
 * graphql-query-builder
 *
 * Field Extractor Module
 *
 * Extracts field selections from GraphQL resolver info objects.
 * Uses graphql-parse-resolve-info for reliable AST parsing.
 */

import type { GraphQLResolveInfo } from 'graphql';
import {
  type FieldsByTypeName,
  parseResolveInfo,
  type ResolveTree,
} from 'graphql-parse-resolve-info';

/**
 * Represents a field selection from a GraphQL query.
 */
export interface FieldSelection {
  /** Field name */
  name: string;
  /** Alias if the field was aliased */
  alias?: string;
  /** Arguments passed to the field */
  arguments?: Record<string, unknown>;
  /** Nested field selections */
  selections?: FieldSelection[];
  /** Path from root to this field */
  path: string[];
  /** Depth in the selection tree */
  depth: number;
}

/**
 * Result of field extraction.
 */
export interface ExtractedFields {
  /** The field selections */
  fields: FieldSelection[];
  /** Root type name */
  rootType: string;
  /** Maximum depth */
  depth: number;
  /** Total field count */
  fieldCount: number;
}

/**
 * Options for field extraction.
 */
export interface ExtractionOptions {
  /** Maximum depth to traverse (default: 10) */
  maxDepth?: number;
  /** Fields to exclude from extraction */
  excludeFields?: string[];
  /** Whether to include __typename fields (default: false) */
  includeTypename?: boolean;
}

const DEFAULT_OPTIONS: Required<ExtractionOptions> = {
  maxDepth: 10,
  excludeFields: [],
  includeTypename: false,
};

/**
 * Extracts requested fields from a GraphQL resolver's info argument.
 *
 * @param info - The GraphQL resolver info object
 * @param options - Extraction options
 * @returns The extracted fields with metadata
 *
 * @example
 * ```typescript
 * const resolver = async (parent, args, context, info) => {
 *   const { fields, depth, fieldCount } = extractFieldsFromInfo(info);
 *   // fields contains the exact fields requested by the client
 * };
 * ```
 */
export function extractFieldsFromInfo(
  info: GraphQLResolveInfo,
  options: ExtractionOptions = {},
): ExtractedFields {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let totalFields = 0;
  let maxDepth = 0;

  const parsed = parseResolveInfo(info);

  if (!parsed) {
    return { fields: [], rootType: info.parentType.name, fieldCount: 0, depth: 0 };
  }

  const fields = convertResolveTree(parsed as ResolveTree, [], 0, opts, {
    incrementField: () => {
      totalFields++;
    },
    updateDepth: (d) => {
      if (d > maxDepth) maxDepth = d;
    },
  });

  return {
    fields,
    rootType: info.parentType.name,
    fieldCount: totalFields,
    depth: maxDepth,
  };
}

function convertResolveTree(
  tree: ResolveTree,
  path: string[],
  depth: number,
  options: Required<ExtractionOptions>,
  counters: { incrementField: () => void; updateDepth: (d: number) => void },
): FieldSelection[] {
  if (depth > options.maxDepth) return [];

  counters.updateDepth(depth);
  const fields: FieldSelection[] = [];

  for (const typeName of Object.keys(tree.fieldsByTypeName)) {
    const typeFields = tree.fieldsByTypeName[typeName];

    for (const [fieldName, fieldTree] of Object.entries(typeFields)) {
      if (fieldName === '__typename' && !options.includeTypename) continue;
      if (options.excludeFields.includes(fieldName)) continue;

      counters.incrementField();
      const currentPath = [...path, fieldTree.alias || fieldName];

      const field: FieldSelection = {
        name: fieldName,
        alias: fieldTree.alias !== fieldName ? fieldTree.alias : undefined,
        path: currentPath,
        depth: depth + 1,
      };

      if (fieldTree.args && Object.keys(fieldTree.args).length > 0) {
        field.arguments = fieldTree.args as Record<string, unknown>;
      }

      if (fieldTree.fieldsByTypeName && Object.keys(fieldTree.fieldsByTypeName).length > 0) {
        field.selections = convertFieldsByTypeName(
          fieldTree.fieldsByTypeName,
          currentPath,
          depth + 1,
          options,
          counters,
        );
      }

      fields.push(field);
    }
  }

  return fields;
}

function convertFieldsByTypeName(
  fieldsByTypeName: FieldsByTypeName,
  path: string[],
  depth: number,
  options: Required<ExtractionOptions>,
  counters: { incrementField: () => void; updateDepth: (d: number) => void },
): FieldSelection[] {
  if (depth > options.maxDepth) return [];

  counters.updateDepth(depth);
  const fields: FieldSelection[] = [];

  for (const typeName of Object.keys(fieldsByTypeName)) {
    const typeFields = fieldsByTypeName[typeName];

    for (const [fieldName, fieldTree] of Object.entries(typeFields)) {
      if (fieldName === '__typename' && !options.includeTypename) continue;
      if (options.excludeFields.includes(fieldName)) continue;

      counters.incrementField();
      const currentPath = [...path, fieldTree.alias || fieldName];

      const field: FieldSelection = {
        name: fieldName,
        alias: fieldTree.alias !== fieldName ? fieldTree.alias : undefined,
        path: currentPath,
        depth: depth + 1,
      };

      if (fieldTree.args && Object.keys(fieldTree.args).length > 0) {
        field.arguments = fieldTree.args as Record<string, unknown>;
      }

      if (fieldTree.fieldsByTypeName && Object.keys(fieldTree.fieldsByTypeName).length > 0) {
        field.selections = convertFieldsByTypeName(
          fieldTree.fieldsByTypeName,
          currentPath,
          depth + 1,
          options,
          counters,
        );
      }

      fields.push(field);
    }
  }

  return fields;
}

/**
 * Gets just the field names as a flat array.
 *
 * @example
 * ```typescript
 * const fieldNames = getRequestedFieldNames(info);
 * // ['id', 'name', 'email']
 * ```
 */
export function getRequestedFieldNames(
  info: GraphQLResolveInfo,
  options: ExtractionOptions = {},
): string[] {
  const { fields } = extractFieldsFromInfo(info, options);
  return flattenFieldNames(fields);
}

function flattenFieldNames(fields: FieldSelection[]): string[] {
  const names: string[] = [];
  for (const field of fields) {
    names.push(field.name);
    if (field.selections) names.push(...flattenFieldNames(field.selections));
  }
  return names;
}

/**
 * Checks if a specific field path was requested.
 *
 * @example
 * ```typescript
 * if (isFieldRequested(info, 'user.profile.avatar')) {
 *   // Fetch avatar data
 * }
 * ```
 */
export function isFieldRequested(
  info: GraphQLResolveInfo,
  fieldPath: string,
  options: ExtractionOptions = {},
): boolean {
  const { fields } = extractFieldsFromInfo(info, options);
  const parts = fieldPath.split('.');

  function find(fieldList: FieldSelection[], remaining: string[]): boolean {
    if (remaining.length === 0) return true;
    const [current, ...rest] = remaining;
    const field = fieldList.find((f) => f.name === current);
    if (!field) return false;
    if (rest.length === 0) return true;
    return field.selections ? find(field.selections, rest) : false;
  }

  return find(fields, parts);
}
