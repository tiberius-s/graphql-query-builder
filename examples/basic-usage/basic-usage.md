# Basic Usage Tutorial

A beginner-friendly guide to getting started with `graphql-query-builder` for optimizing your GraphQL API performance.

---

## Introduction

Welcome! If you're building a GraphQL API that fetches data from other services (like a REST API, database, or another GraphQL server), you've probably encountered **overfetching**—the problem where your server requests far more data than your client actually needs.

Imagine a client asks for just a user's name:

```graphql
query {
  user(id: "123") {
    name
  }
}
```

But your resolver fetches the _entire_ user object from your upstream service—email, addresses, payment methods, preferences, and dozens of other fields. That's wasteful!

This tutorial shows you how to use `graphql-query-builder` to solve this problem.

---

## Prerequisites

Before starting, you should be familiar with:

- Basic JavaScript/TypeScript
- GraphQL concepts (queries, resolvers, fields)
- Node.js and npm/yarn

Install the package:

```bash
npm install graphql-query-builder graphql
```

---

## What You'll Learn

1. How to extract fields from a client's GraphQL request
2. How to build optimized queries that include only needed fields
3. Various helper functions for field inspection
4. Pretty-printing queries for debugging

---

## Understanding the Problem

Let's visualize the overfetching problem:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Client      │     │   Your Server   │     │ Upstream Service│
│                 │     │   (Subgraph)    │     │                 │
│ Requests:       │────▶│ Fetches:        │────▶│ Returns:        │
│ - name          │     │ - ALL fields    │     │ - ALL fields    │
│                 │     │ - Wasteful!     │     │ - 100+ KB       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

With `graphql-query-builder`:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Client      │     │   Your Server   │     │ Upstream Service│
│                 │     │   (Optimized)   │     │                 │
│ Requests:       │────▶│ Fetches:        │────▶│ Returns:        │
│ - name          │     │ - name only     │     │ - name only     │
│                 │     │ - Efficient!    │     │ - 50 bytes      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Step 1: Field Extraction

The first step is extracting fields from the client's request. Every GraphQL resolver receives an `info` parameter containing details about what fields were requested.

```typescript
import { extractFieldsFromInfo } from 'graphql-query-builder';
import type { GraphQLResolveInfo } from 'graphql';

function myResolver(parent, args, context, info: GraphQLResolveInfo) {
  // Extract fields from the client's query
  const extracted = extractFieldsFromInfo(info);

  console.log('Fields requested:', extracted.fields);
  console.log('Query depth:', extracted.depth);
  console.log('Total field count:', extracted.fieldCount);
}
```

### What does `extracted` contain?

The `extractFieldsFromInfo` function returns an object with:

| Property     | Description                                                        |
| ------------ | ------------------------------------------------------------------ |
| `fields`     | Array of field selections with names, paths, and nested selections |
| `rootType`   | The GraphQL type being queried (e.g., "User")                      |
| `depth`      | How many levels deep the query goes                                |
| `fieldCount` | Total number of fields requested                                   |

---

## Step 2: Building Optimized Queries

Once you know which fields the client needs, build a query for your upstream service:

```typescript
import { buildQuery } from 'graphql-query-builder';

function myResolver(parent, args, context, info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);

  // Build an optimized query
  const { query, variables, metadata } = buildQuery('user', extracted.fields, {
    operationName: 'GetUser',
    variables: { id: args.id },
  });

  // Now send this optimized query to your upstream service
  const result = await context.upstreamService.query(query, variables);

  return result;
}
```

### The `buildQuery` Function

The `buildQuery` function takes three arguments:

1. **`rootField`** - The field name in your upstream schema (e.g., `'user'`, `'product'`)
2. **`fields`** - The extracted field selections
3. **`options`** - Configuration options

```typescript
buildQuery('user', fields, {
  operationName: 'GetUser', // Optional: names the operation
  variables: { id: '123' }, // Variables to pass to the query
  pretty: false, // Set to true for formatted output
  indent: '  ', // Indentation for pretty printing
  requiredFields: ['id'], // Fields to always include
});
```

---

## Step 3: Quick Field Inspection

Sometimes you just need to check which fields were requested without building a full query.

### Get Field Names as a Flat List

```typescript
import { getRequestedFieldNames } from 'graphql-query-builder';

const fieldNames = getRequestedFieldNames(info);
// Returns: ['id', 'name', 'email', 'profile', 'profile.avatar']
```

### Check if a Specific Field Was Requested

```typescript
import { isFieldRequested } from 'graphql-query-builder';

if (isFieldRequested(info, 'profile.avatar')) {
  console.log('Client wants the avatar!');
}

// Works with nested paths too:
if (isFieldRequested(info, 'orders.items.product.name')) {
  console.log('Client wants product names in their orders');
}
```

This is useful for:

- Conditional data loading
- Authorization checks
- Analytics/logging

---

## Step 4: Building from Field Paths

If you know exactly which fields you need (without extracting from `info`), use `buildQueryFromPaths`:

```typescript
import { buildQueryFromPaths } from 'graphql-query-builder';

const fieldPaths = [
  'id',
  'email',
  'profile.firstName',
  'profile.lastName',
  'profile.avatar.url',
  'profile.avatar.alt',
];

const { query } = buildQueryFromPaths('user', fieldPaths, {
  operationName: 'GetUserProfile',
  variables: { id: '123' },
});
```

This generates:

```graphql
query GetUserProfile($id: ID!) {
  user(id: $id) {
    id
    email
    profile {
      firstName
      lastName
      avatar {
        url
        alt
      }
    }
  }
}
```

---

## Step 5: Pretty Printing for Debugging

When debugging, formatted queries are much easier to read:

```typescript
const { query } = buildQuery('user', extracted.fields, {
  operationName: 'DebugQuery',
  pretty: true,
  indent: '  ', // Two spaces per level
});

console.log(query);
```

Output:

```graphql
query DebugQuery($id: ID!) {
  user(id: $id) {
    id
    email
    profile {
      firstName
      lastName
    }
  }
}
```

---

## Step 6: Adding Required Fields

Your upstream service or caching layer might always need certain fields (like `id` for cache keys). Use `requiredFields`:

```typescript
const { query } = buildQuery('user', extracted.fields, {
  operationName: 'GetUser',
  requiredFields: ['id', '__typename'],
});
```

Even if the client only asked for `email`, the generated query will include:

```graphql
query GetUser {
  user {
    id
    __typename
    email
  }
}
```

---

## Step 7: Field Mappings

Sometimes your client-facing field names differ from your upstream service. Use `fieldMappings`:

```typescript
const { query } = buildQuery('user', extracted.fields, {
  operationName: 'GetUser',
  fieldMappings: {
    email: 'emailAddress', // client's 'email' → upstream's 'emailAddress'
    phone: 'phoneNumber',
    fullName: 'displayName',
  },
});
```

---

## Step 8: Limiting Extraction Depth

Prevent deeply nested queries by limiting extraction depth:

```typescript
const extracted = extractFieldsFromInfo(info, {
  maxDepth: 3, // Only extract up to 3 levels deep
});
```

This protects against queries like:

```graphql
query MaliciousQuery {
  user {
    friends {
      friends {
        friends {
          friends {
            # ... infinite nesting attack
          }
        }
      }
    }
  }
}
```

---

## Complete Resolver Example

Here's everything together in a real resolver:

```typescript
import { extractFieldsFromInfo, buildQuery } from 'graphql-query-builder';
import type { GraphQLResolveInfo } from 'graphql';

const resolvers = {
  Query: {
    user: async (
      _parent: unknown,
      args: { id: string },
      context: { dataSources: { userAPI: any } },
      info: GraphQLResolveInfo,
    ) => {
      // 1. Extract only what the client needs
      const extracted = extractFieldsFromInfo(info, {
        maxDepth: 5,
      });

      // 2. Build optimized query
      const { query, variables } = buildQuery('user', extracted.fields, {
        operationName: 'GetUser',
        variables: { id: args.id },
        requiredFields: ['id'], // Always need ID for caching
      });

      // 3. Execute against upstream
      const result = await context.dataSources.userAPI.query(query, variables);

      return result;
    },
  },
};
```

---

## Summary

You've learned how to:

| Task                               | Function                                         |
| ---------------------------------- | ------------------------------------------------ |
| Extract fields from client request | `extractFieldsFromInfo(info)`                    |
| Build optimized queries            | `buildQuery(rootField, fields, options)`         |
| Build from known paths             | `buildQueryFromPaths(rootField, paths, options)` |
| Get field names list               | `getRequestedFieldNames(info)`                   |
| Check for specific field           | `isFieldRequested(info, 'field.path')`           |

---

## Next Steps

Now that you understand the basics, explore:

- **[DataSource Integration](../datasource-integration/datasource-integration.md)** - Integrate with Apollo Server data sources
- **[Security Configuration](../security-configuration/security-configuration.md)** - Protect against malicious queries
- **[Performance Optimization](../performance-optimization/performance-optimization.md)** - Add caching for maximum performance

---

## Troubleshooting

### "Fields array is empty"

Make sure you're passing the `info` object from your resolver, not `undefined`.

### "Query doesn't include expected fields"

Check that `includeTypename` is set appropriately. Apollo Client adds `__typename` by default.

### "Nested fields not appearing"

Ensure `maxDepth` in extraction options is high enough for your query structure.

---

_Happy querying! 🚀_
