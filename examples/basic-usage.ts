/**
 * graphql-query-builder Examples
 *
 * Basic Usage Examples
 *
 * This file demonstrates the core functionality of the GraphQL Query Builder
 * package with simple, easy-to-understand examples.
 */

import type { GraphQLResolveInfo } from 'graphql';
import {
  extractFieldsFromInfo,
  buildQuery,
  buildQueryFromPaths,
  getRequestedFieldNames,
  isFieldRequested,
} from 'graphql-query-builder';

/**
 * Example 1: Basic Field Extraction
 *
 * Shows how to extract only the fields that the client requested
 * from a GraphQL query.
 */
export function basicFieldExtraction(info: GraphQLResolveInfo) {
  // Extract all fields from the client's query
  const extracted = extractFieldsFromInfo(info);

  console.log('Extracted fields:', extracted.fields);
  console.log('Root type:', extracted.rootType);
  console.log('Query depth:', extracted.depth);
  console.log('Total fields:', extracted.fieldCount);

  // Get just the field names (flat list)
  const fieldNames = getRequestedFieldNames(info);
  console.log('Field names:', fieldNames);

  // Check if a specific field was requested
  if (isFieldRequested(info, 'profile.avatar')) {
    console.log('Client requested avatar!');
  }

  return extracted;
}

/**
 * Example 2: Building an Optimized Query
 *
 * Shows how to build a GraphQL query string from extracted fields.
 */
export function buildOptimizedQuery(info: GraphQLResolveInfo, userId: string) {
  // Extract fields from client request
  const extracted = extractFieldsFromInfo(info);

  // Build query for upstream service
  const { query, variables, metadata } = buildQuery('user', extracted.fields, {
    operationName: 'GetUserOptimized',
    variables: { id: userId },
  });

  console.log('Generated query:', query);
  console.log('Variables:', variables);
  console.log('Query metadata:', metadata);

  return { query, variables };
}

/**
 * Example 3: Using Field Paths
 *
 * When you know exactly which fields you need, you can build
 * queries directly from field paths without extracting from info.
 */
export function buildFromPaths() {
  // Define the fields you want to request
  const fieldPaths = [
    'id',
    'email',
    'profile.firstName',
    'profile.lastName',
    'profile.avatar.url',
    'profile.avatar.alt',
  ];

  // Build the query
  const { query } = buildQueryFromPaths('user', fieldPaths, {
    operationName: 'GetUserProfile',
    variables: { id: '123' },
  });

  console.log('Generated query:');
  console.log(query);
  // Output:
  // query GetUserProfile($id: ID!) {
  //   user(id: $id) {
  //     id
  //     email
  //     profile {
  //       firstName
  //       lastName
  //       avatar { url alt }
  //     }
  //   }
  // }

  return query;
}

/**
 * Example 4: Pretty Printing
 *
 * Generate nicely formatted queries for debugging.
 */
export function prettyPrintedQuery(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);

  const { query } = buildQuery('user', extracted.fields, {
    operationName: 'DebugQuery',
    pretty: true,
    indent: '  ',
  });

  console.log(query);
  return query;
}

/**
 * Example 5: Adding Required Fields
 *
 * Ensure certain fields are always included in the upstream query,
 * even if the client didn't request them.
 */
export function withRequiredFields(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);

  // Always include 'id' and '__typename' for Apollo cache
  const { query } = buildQuery('user', extracted.fields, {
    operationName: 'GetUserWithRequired',
    requiredFields: ['id', '__typename'],
  });

  console.log('Query with required fields:', query);
  return query;
}

/**
 * Example 6: Field Mappings
 *
 * Map client-facing field names to different upstream field names.
 */
export function withFieldMappings(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);

  // Client requests 'email', upstream uses 'emailAddress'
  const { query } = buildQuery('user', extracted.fields, {
    operationName: 'GetUserMapped',
    fieldMappings: {
      email: 'emailAddress',
      phone: 'phoneNumber',
      fullName: 'displayName',
    },
  });

  console.log('Query with mapped fields:', query);
  return query;
}

/**
 * Example 7: Limiting Extraction Depth
 *
 * Prevent deeply nested queries by limiting extraction depth.
 */
export function limitedDepthExtraction(info: GraphQLResolveInfo) {
  // Only extract up to 3 levels deep
  const extracted = extractFieldsFromInfo(info, {
    maxDepth: 3,
  });

  console.log('Limited depth extraction:', extracted.depth);
  console.log('Fields:', extracted.fields);

  return extracted;
}

/**
 * Example 8: Excluding __typename
 *
 * Exclude Apollo's automatic __typename field from extraction.
 */
export function excludeTypename(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info, {
    includeTypename: false,
  });

  return extracted;
}

// ============================================================================
// Usage in Apollo Server Resolver
// ============================================================================

/**
 * Example 9: Complete Resolver Example
 *
 * Shows how to use the query builder in an Apollo Server resolver
 * to optimize upstream requests.
 */
export const resolverExample = {
  Query: {
    /**
     * Without query builder (overfetching):
     *
     * ```graphql
     * # Client requests:
     * query { user(id: "123") { email } }
     *
     * # Subgraph sends to upstream:
     * query { user(id: "123") {
     *   id email firstName lastName phone address { ... } settings { ... }
     * }}
     * ```
     *
     * With query builder (optimized):
     *
     * ```graphql
     * # Client requests:
     * query { user(id: "123") { email } }
     *
     * # Subgraph sends to upstream:
     * query { user(id: "123") { email } }
     * ```
     */
    user: async (
      _parent: unknown,
      args: { id: string },
      context: {
        dataSources: {
          upstream: { query: (q: string, v: Record<string, unknown>) => Promise<unknown> };
        };
      },
      info: GraphQLResolveInfo,
    ) => {
      // Extract only what the client needs
      const extracted = extractFieldsFromInfo(info);

      // Build optimized query
      const { query, variables } = buildQuery('user', extracted.fields, {
        operationName: 'GetUser',
        variables: { id: args.id },
        requiredFields: ['id'], // Always need ID for caching
      });

      // Execute against upstream
      const result = await context.dataSources.upstream.query(query, variables);

      return result;
    },
  },
};
