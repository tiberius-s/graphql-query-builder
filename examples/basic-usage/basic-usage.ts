/**
 * Basic Usage Example - graphql-query-builder
 *
 * This example demonstrates the core workflow for preventing
 * server-side overfetching in GraphQL resolvers.
 */

import type { GraphQLResolveInfo } from 'graphql';
import {
  extractFieldsFromInfo,
  buildQuery,
  configure,
  validateFields,
  initializeCache,
  buildQueryCached,
} from 'graphql-query-builder';

// Configure the library (typically done at application startup)
configure({
  maxDepth: 10,
  maxFields: 100,
  requiredFields: ['id'], // Always include 'id' in queries
  blockedFields: ['password', 'ssn'], // Never include these fields
  fieldMappings: { email: 'emailAddress' }, // Map local names to upstream names
});

// Enable caching for repeated query patterns
initializeCache({ maxSize: 500, ttl: 60000 });

// Example resolver implementation
const userResolver = async (
  _parent: unknown,
  args: { id: string },
  context: { upstream: { query: (q: string, v: Record<string, unknown>) => Promise<unknown> } },
  info: GraphQLResolveInfo,
) => {
  // 1. Extract the fields the client requested
  const { fields, fieldCount, depth } = extractFieldsFromInfo(info);

  // 2. Validate the request against security limits
  const validation = validateFields(fields);
  if (!validation.valid) {
    throw new Error(`Invalid query: ${validation.errors.join(', ')}`);
  }

  // 3. Build an optimized query for the upstream service
  const { query, variables } = buildQueryCached('user', fields, {
    operationName: 'GetUser',
    variables: { id: args.id },
    variableTypes: { id: 'ID!' },
    rootArguments: { id: { __variable: 'id' } },
  });

  // 4. Send the optimized query to the upstream GraphQL service
  return context.upstream.query(query, variables);
};

// Example: Building a query from known field paths (no resolver info needed)
function buildProductListingQuery(productId: string) {
  const fields = [
    { name: 'name', path: ['name'], depth: 1 },
    { name: 'price', path: ['price'], depth: 1 },
    {
      name: 'inventory',
      path: ['inventory'],
      depth: 1,
      selections: [{ name: 'available', path: ['inventory', 'available'], depth: 2 }],
    },
  ];

  return buildQuery('product', fields, {
    operationName: 'GetProduct',
    variables: { id: productId },
    variableTypes: { id: 'ID!' },
    rootArguments: { id: { __variable: 'id' } },
  });
}

// Usage
const { query } = buildProductListingQuery('123');
console.log('Generated query:', query);
// Output: query GetProduct($id: ID!) { product(id: $id) { id name price inventory { available } } }
