/**
 * graphql-query-builder
 *
 * Field Extractor Module
 *
 * This module provides utilities for extracting field selections from
 * GraphQL resolver info objects. It uses the battle-tested graphql-parse-resolve-info
 * library for reliable AST parsing, determining exactly which fields the client
 * has requested for optimized upstream queries.
 */

import type { GraphQLResolveInfo } from 'graphql';
import {
  type FieldsByTypeName,
  parseResolveInfo,
  type ResolveTree,
} from 'graphql-parse-resolve-info';

// ============================================================================
// Type Definitions (Inlined for Clean Architecture)
// ============================================================================

/**
 * Represents a field selection from a GraphQL query.
 */
export interface FieldSelection {
  /** The field name as it appears in the query */
  name: string;
  /** Alias if the field was aliased */
  alias?: string;
  /** Arguments passed to the field */
  arguments?: Record<string, unknown>;
  /** Nested field selections (for object types) */
  selections?: FieldSelection[];
  /** The path from the root to this field */
  path: string[];
  /** The depth of this field in the selection tree */
  depth: number;
}

/**
 * Result of extracting fields from GraphQLResolveInfo.
 */
export interface ExtractedFields {
  /** The root-level field selections */
  fields: FieldSelection[];
  /** The root type name */
  rootType: string;
  /** Maximum depth of the field tree */
  depth: number;
  /** Total number of fields extracted */
  fieldCount: number;
}

/**
 * Options for the field extraction process.
 */
export interface ExtractionOptions {
  /** Maximum depth to traverse (default: 10) */
  maxDepth?: number;
  /** Maximum total fields to extract (default: 100) */
  maxFields?: number;
  /** Fields to exclude from extraction */
  excludeFields?: string[];
  /** Whether to include __typename fields */
  includeTypename?: boolean;
  /** Custom field name transformer */
  fieldTransformer?: (fieldName: string, path: string[]) => string;
}

/**
 * Default extraction options.
 */
const DEFAULT_OPTIONS: Required<ExtractionOptions> = {
  maxDepth: 10,
  maxFields: 100,
  excludeFields: [],
  includeTypename: false,
  fieldTransformer: (name: string) => name,
};

/**
 * Extracts the requested fields from a GraphQL resolver's info argument.
 *
 * This is the primary function for determining what fields the client has
 * requested. It uses graphql-parse-resolve-info to traverse the selection
 * set AST and builds a structured representation of the field tree.
 *
 * @param info - The GraphQL resolver info object
 * @param options - Optional extraction configuration
 * @returns The extracted fields with metadata
 *
 * @example
 * ```typescript
 * const resolver = async (parent, args, context, info) => {
 *   const extracted = extractFieldsFromInfo(info, { maxDepth: 5 });
 *   console.log(extracted.fields); // Array of requested fields
 * };
 * ```
 */
export function extractFieldsFromInfo(
  info: GraphQLResolveInfo,
  options: ExtractionOptions = {},
): ExtractedFields {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let totalFields = 0;
  let maxDepthReached = 0;

  // Parse the resolve info using graphql-parse-resolve-info
  const parsedInfo = parseResolveInfo(info);

  if (!parsedInfo) {
    return {
      fields: [],
      rootType: info.parentType.name,
      fieldCount: 0,
      depth: 0,
    };
  }

  // Convert the parsed info to our FieldSelection format
  const fields = convertResolveTree(
    parsedInfo as ResolveTree,
    [],
    0,
    opts,
    () => {
      totalFields++;
      if (totalFields > opts.maxFields) {
        throw new Error(`Maximum field count (${opts.maxFields}) exceeded`);
      }
    },
    (depth) => {
      if (depth > maxDepthReached) {
        maxDepthReached = depth;
      }
    },
  );

  return {
    fields,
    rootType: info.parentType.name,
    fieldCount: totalFields,
    depth: maxDepthReached,
  };
}

/**
 * Converts a ResolveTree from graphql-parse-resolve-info to our FieldSelection format.
 */
function convertResolveTree(
  tree: ResolveTree,
  path: string[],
  depth: number,
  options: Required<ExtractionOptions>,
  incrementFieldCount: () => void,
  updateMaxDepth: (depth: number) => void,
): FieldSelection[] {
  if (depth > options.maxDepth) {
    return [];
  }

  updateMaxDepth(depth);

  const fields: FieldSelection[] = [];

  // Process the fieldsByTypeName to get all fields
  const fieldsByTypeName = tree.fieldsByTypeName;

  for (const typeName of Object.keys(fieldsByTypeName)) {
    const typeFields = fieldsByTypeName[typeName];

    for (const [fieldName, fieldTree] of Object.entries(typeFields)) {
      // Skip __typename unless explicitly included
      if (fieldName === '__typename' && !options.includeTypename) {
        continue;
      }

      // Skip excluded fields
      if (options.excludeFields.includes(fieldName)) {
        continue;
      }

      incrementFieldCount();

      const currentPath = [...path, fieldTree.alias || fieldName];
      const transformedName = options.fieldTransformer(fieldName, currentPath);

      const field: FieldSelection = {
        name: transformedName,
        alias: fieldTree.alias !== fieldName ? fieldTree.alias : undefined,
        path: currentPath,
        depth: depth + 1,
      };

      // Extract arguments
      if (fieldTree.args && Object.keys(fieldTree.args).length > 0) {
        field.arguments = fieldTree.args as Record<string, unknown>;
      }

      // Recursively process nested selections
      if (fieldTree.fieldsByTypeName && Object.keys(fieldTree.fieldsByTypeName).length > 0) {
        field.selections = convertFieldsByTypeName(
          fieldTree.fieldsByTypeName,
          currentPath,
          depth + 1,
          options,
          incrementFieldCount,
          updateMaxDepth,
        );
      }

      fields.push(field);
    }
  }

  return fields;
}

/**
 * Converts fieldsByTypeName to an array of FieldSelections.
 */
function convertFieldsByTypeName(
  fieldsByTypeName: FieldsByTypeName,
  path: string[],
  depth: number,
  options: Required<ExtractionOptions>,
  incrementFieldCount: () => void,
  updateMaxDepth: (depth: number) => void,
): FieldSelection[] {
  if (depth > options.maxDepth) {
    return [];
  }

  updateMaxDepth(depth);

  const fields: FieldSelection[] = [];

  for (const typeName of Object.keys(fieldsByTypeName)) {
    const typeFields = fieldsByTypeName[typeName];

    for (const [fieldName, fieldTree] of Object.entries(typeFields)) {
      // Skip __typename unless explicitly included
      if (fieldName === '__typename' && !options.includeTypename) {
        continue;
      }

      // Skip excluded fields
      if (options.excludeFields.includes(fieldName)) {
        continue;
      }

      incrementFieldCount();

      const currentPath = [...path, fieldTree.alias || fieldName];
      const transformedName = options.fieldTransformer(fieldName, currentPath);

      const field: FieldSelection = {
        name: transformedName,
        alias: fieldTree.alias !== fieldName ? fieldTree.alias : undefined,
        path: currentPath,
        depth: depth + 1,
      };

      // Extract arguments
      if (fieldTree.args && Object.keys(fieldTree.args).length > 0) {
        field.arguments = fieldTree.args as Record<string, unknown>;
      }

      // Recursively process nested selections
      if (fieldTree.fieldsByTypeName && Object.keys(fieldTree.fieldsByTypeName).length > 0) {
        field.selections = convertFieldsByTypeName(
          fieldTree.fieldsByTypeName,
          currentPath,
          depth + 1,
          options,
          incrementFieldCount,
          updateMaxDepth,
        );
      }

      fields.push(field);
    }
  }

  return fields;
}

/**
 * Utility function to get just the field names as a flat array.
 * Useful for simple cases where you only need field names.
 *
 * @param info - The GraphQL resolver info object
 * @param options - Optional extraction configuration
 * @returns Array of field names
 *
 * @example
 * ```typescript
 * const fields = getRequestedFieldNames(info);
 * // ['id', 'name', 'email']
 * ```
 */
export function getRequestedFieldNames(
  info: GraphQLResolveInfo,
  options: ExtractionOptions = {},
): string[] {
  const extracted = extractFieldsFromInfo(info, options);
  return flattenFieldNames(extracted.fields);
}

/**
 * Flattens a FieldSelection tree into an array of field names.
 */
function flattenFieldNames(fields: FieldSelection[]): string[] {
  const names: string[] = [];

  for (const field of fields) {
    names.push(field.name);

    if (field.selections) {
      // For nested fields, prefix with parent name
      const nestedNames = flattenFieldNames(field.selections);
      names.push(...nestedNames);
    }
  }

  return names;
}

/**
 * Gets the requested fields as a nested object structure.
 * Useful for checking if specific nested paths are requested.
 *
 * @param info - The GraphQL resolver info object
 * @param options - Optional extraction configuration
 * @returns Nested object representing the field structure
 *
 * @example
 * ```typescript
 * const structure = getFieldStructure(info);
 * if (structure.user?.address?.city) {
 *   // Client requested user.address.city
 * }
 * ```
 */
export function getFieldStructure(
  info: GraphQLResolveInfo,
  options: ExtractionOptions = {},
): Record<string, unknown> {
  const extracted = extractFieldsFromInfo(info, options);
  return buildFieldStructure(extracted.fields);
}

/**
 * Builds a nested object structure from field selections.
 */
function buildFieldStructure(fields: FieldSelection[]): Record<string, unknown> {
  const structure: Record<string, unknown> = {};

  for (const field of fields) {
    if (field.selections && field.selections.length > 0) {
      structure[field.name] = buildFieldStructure(field.selections);
    } else {
      structure[field.name] = true;
    }
  }

  return structure;
}

/**
 * Checks if a specific field path is requested.
 *
 * @param info - The GraphQL resolver info object
 * @param path - Dot-separated path (e.g., 'user.address.city')
 * @param options - Optional extraction configuration
 * @returns Whether the field path is requested
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
  path: string,
  options: ExtractionOptions = {},
): boolean {
  const structure = getFieldStructure(info, options);
  const parts = path.split('.');

  let current: unknown = structure;

  for (const part of parts) {
    if (typeof current !== 'object' || current === null) {
      return false;
    }
    current = (current as Record<string, unknown>)[part];
    if (current === undefined) {
      return false;
    }
  }

  return true;
}
