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
 * Extracts all requested field names as a flat array.
 *
 * This is a convenience function that extracts fields and flattens them
 * into a simple array of field names, useful for quick checks or logging.
 *
 * @param info - The GraphQL resolver info object
 * @param options - Extraction options (maxDepth, excludeFields, etc.)
 * @returns Array of all requested field names (including nested fields)
 *
 * @example
 * ```typescript
 * const resolver = (parent, args, context, info) => {
 *   const fieldNames = getRequestedFieldNames(info);
 *   console.log('Requested fields:', fieldNames);
 *   // ['id', 'name', 'email', 'profile', 'bio', 'avatar']
 * };
 * ```
 *
 * @see {@link extractFieldsFromInfo} for structured field extraction
 * @see {@link isFieldRequested} to check for specific field paths
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
 * Checks if a specific field path was requested in the query.
 *
 * Useful for conditionally fetching data or performing operations only when
 * specific fields are requested. Supports dot-notation paths for nested fields.
 *
 * @param info - The GraphQL resolver info object
 * @param fieldPath - Dot-notation path to the field (e.g., 'user.profile.avatar')
 * @param options - Extraction options
 * @returns `true` if the field path was requested, `false` otherwise
 *
 * @example
 * ```typescript
 * const resolver = async (parent, args, context, info) => {
 *   const user = await fetchUser(args.id);
 *
 *   // Only fetch avatar if it was requested
 *   if (isFieldRequested(info, 'avatar')) {
 *     user.avatar = await fetchAvatar(user.id);
 *   }
 *
 *   // Check for nested field
 *   if (isFieldRequested(info, 'profile.bio')) {
 *     user.profile = await fetchProfile(user.id);
 *   }
 *
 *   return user;
 * };
 * ```
 *
 * @remarks
 * - Field names must match exactly (case-sensitive)
 * - For nested fields, all intermediate paths must exist
 * - Does not consider field aliases
 *
 * @see {@link extractFieldsFromInfo} for full field structure
 * @see {@link getRequestedFieldNames} for all field names
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
