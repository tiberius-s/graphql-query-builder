# Basic Usage

This guide explains the core workflow for preventing server-side overfetching in GraphQL resolvers.

## The Problem

When your GraphQL server proxies queries to an upstream service, a naive approach fetches all fields:

```text
Client requests:          Upstream receives:
{ user { email } }   →    { user { id email name phone address ... } }
```

This wastes bandwidth and increases latency.

## The Solution

Extract the exact fields the client requested and build a minimal upstream query:

```text
Client requests:          Upstream receives:
{ user { email } }   →    { user { email } }
```

## Step 1: Configure the Library

Configure at application startup:

```typescript
import { configure, initializeCache } from 'graphql-query-builder';

configure({
  maxDepth: 10, // Maximum query depth
  maxFields: 100, // Maximum fields per query
  requiredFields: ['id'], // Always include these fields
  blockedFields: ['password', 'ssn'], // Never include these
  fieldMappings: { email: 'emailAddress' }, // Rename fields
});

// Enable caching for performance
initializeCache({ maxSize: 500, ttl: 60000 });
```

## Step 2: Extract Fields in Resolver

```typescript
import { extractFieldsFromInfo } from 'graphql-query-builder';

const userResolver = async (_parent, args, context, info) => {
  // Extract the fields the client requested
  const { fields, fieldCount, depth } = extractFieldsFromInfo(info);

  console.log(`Client requested ${fieldCount} fields at depth ${depth}`);
};
```

## Step 3: Validate the Request

```typescript
import { validateFields } from 'graphql-query-builder';

const userResolver = async (_parent, args, context, info) => {
  const { fields } = extractFieldsFromInfo(info);

  // Check against security limits
  const validation = validateFields(fields);
  if (!validation.valid) {
    throw new Error(`Invalid query: ${validation.errors.join(', ')}`);
  }
};
```

## Step 4: Build the Upstream Query

```typescript
import { buildQueryCached } from 'graphql-query-builder';

const userResolver = async (_parent, args, context, info) => {
  const { fields } = extractFieldsFromInfo(info);
  const validation = validateFields(fields);
  if (!validation.valid) {
    throw new Error(`Invalid query: ${validation.errors.join(', ')}`);
  }

  // Build optimized query
  const { query, variables } = buildQueryCached('user', fields, {
    operationName: 'GetUser',
    variables: { id: args.id },
  });

  console.log('Generated query:', query);
  // query GetUser($id: ID!) { user { id email } }
};
```

## Step 5: Send to Upstream

```typescript
const userResolver = async (_parent, args, context, info) => {
  const { fields } = extractFieldsFromInfo(info);
  const validation = validateFields(fields);
  if (!validation.valid) {
    throw new Error(`Invalid query: ${validation.errors.join(', ')}`);
  }

  const { query, variables } = buildQueryCached('user', fields, {
    operationName: 'GetUser',
    variables: { id: args.id },
  });

  // Send optimized query to upstream
  return context.upstream.query(query, variables);
};
```

## Complete Example

```typescript
import type { GraphQLResolveInfo } from 'graphql';
import { extractFieldsFromInfo, buildQueryCached, validateFields } from 'graphql-query-builder';

interface Context {
  upstream: {
    query: (q: string, v: Record<string, unknown>) => Promise<unknown>;
  };
}

const userResolver = async (
  _parent: unknown,
  args: { id: string },
  context: Context,
  info: GraphQLResolveInfo,
) => {
  // 1. Extract fields
  const { fields } = extractFieldsFromInfo(info);

  // 2. Validate
  const validation = validateFields(fields);
  if (!validation.valid) {
    throw new Error(`Invalid query: ${validation.errors.join(', ')}`);
  }

  // 3. Build query
  const { query, variables } = buildQueryCached('user', fields, {
    operationName: 'GetUser',
    variables: { id: args.id },
  });

  // 4. Send to upstream
  return context.upstream.query(query, variables);
};
```

## Building Without Resolver Info

For cases where you know the fields upfront:

```typescript
import { buildQuery } from 'graphql-query-builder';

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

const { query } = buildQuery('product', fields, {
  operationName: 'GetProduct',
  variables: { id: '123' },
});
```

## Next Steps

- [Caching](caching/caching.md) - Improve performance with query caching
- [Validation](validation/validation.md) - Protect against abuse with field validation
- [Schema Mapping](./schema-mapping-zod/schema-mapping-zod.md) - Handle schema differences
