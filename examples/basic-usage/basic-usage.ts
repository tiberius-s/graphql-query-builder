/**
 * Basic Usage Examples - graphql-query-builder
 * 
 * See basic-usage.md for the full tutorial.
 */

import type { GraphQLResolveInfo } from 'graphql';
import {
  extractFieldsFromInfo,
  buildQuery,
  buildQueryFromPaths,
  getRequestedFieldNames,
  isFieldRequested,
} from 'graphql-query-builder';

// Field extraction from client request
export function basicFieldExtraction(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);
  const fieldNames = getRequestedFieldNames(info);
  
  if (isFieldRequested(info, 'profile.avatar')) {
    console.log('Client requested avatar');
  }
  
  return extracted;
}

// Building optimized queries
export function buildOptimizedQuery(info: GraphQLResolveInfo, userId: string) {
  const extracted = extractFieldsFromInfo(info);
  return buildQuery('user', extracted.fields, {
    operationName: 'GetUserOptimized',
    variables: { id: userId },
  });
}

// Building from known field paths
export function buildFromPaths() {
  return buildQueryFromPaths('user', [
    'id',
    'email',
    'profile.firstName',
    'profile.lastName',
    'profile.avatar.url',
  ], {
    operationName: 'GetUserProfile',
    variables: { id: '123' },
  });
}

// Pretty printing for debugging
export function prettyPrintedQuery(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);
  return buildQuery('user', extracted.fields, {
    operationName: 'DebugQuery',
    pretty: true,
    indent: '  ',
  });
}

// Adding required fields
export function withRequiredFields(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);
  return buildQuery('user', extracted.fields, {
    operationName: 'GetUserWithRequired',
    requiredFields: ['id', '__typename'],
  });
}

// Field name mappings
export function withFieldMappings(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);
  return buildQuery('user', extracted.fields, {
    operationName: 'GetUserMapped',
    fieldMappings: {
      email: 'emailAddress',
      phone: 'phoneNumber',
      fullName: 'displayName',
    },
  });
}

// Limiting extraction depth
export function limitedDepthExtraction(info: GraphQLResolveInfo) {
  return extractFieldsFromInfo(info, { maxDepth: 3 });
}

// Excluding __typename
export function excludeTypename(info: GraphQLResolveInfo) {
  return extractFieldsFromInfo(info, { includeTypename: false });
}

// Complete resolver example
export const resolverExample = {
  Query: {
    user: async (
      _parent: unknown,
      args: { id: string },
      context: { dataSources: { upstream: { query: (q: string, v: Record<string, unknown>) => Promise<unknown> } } },
      info: GraphQLResolveInfo,
    ) => {
      const extracted = extractFieldsFromInfo(info);
      const { query, variables } = buildQuery('user', extracted.fields, {
        operationName: 'GetUser',
        variables: { id: args.id },
        requiredFields: ['id'],
      });
      return context.dataSources.upstream.query(query, variables);
    },
  },
};
