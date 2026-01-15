# DataSource Integration Tutorial

A comprehensive guide to integrating `graphql-query-builder` with Apollo Server 4's DataSource pattern for production-ready GraphQL APIs.

---

## Introduction

In the [Basic Usage](../basic-usage/basic-usage.md) tutorial, you learned how to extract fields and build queries. Now let's integrate this into a proper production architecture using **DataSources**—Apollo Server's recommended pattern for fetching data from external services.

DataSources provide:

- Request-scoped instances for each GraphQL operation
- Built-in caching and deduplication
- Clean separation of data fetching logic

This tutorial shows you how to combine DataSources with query optimization.

---

## Prerequisites

- Completed the [Basic Usage](../basic-usage/basic-usage.md) tutorial
- Familiarity with Apollo Server 4
- Understanding of class-based patterns in TypeScript

```bash
npm install graphql-query-builder graphql @apollo/server
```

---

## What You'll Learn

1. Configuring upstream services
2. Using the built-in `SimpleGraphQLDataSource`
3. Creating custom data sources with authentication
4. Setting up Apollo Server context
5. Advanced patterns like batching and federation

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Apollo Server                             │
│  ┌─────────────┐    ┌──────────────────────────────────────┐   │
│  │  Resolvers  │───▶│           DataSources                 │   │
│  └─────────────┘    │  ┌────────────────────────────────┐  │   │
│                     │  │   GraphQLDataSource (base)      │  │   │
│                     │  │   - Field extraction            │  │   │
│                     │  │   - Query building              │  │   │
│                     │  │   - Security validation         │  │   │
│                     │  │   - Request execution           │  │   │
│                     │  └────────────────────────────────┘  │   │
│                     └──────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                    ┌───────────────────────────┐
                    │    Upstream Services      │
                    │  - User Service           │
                    │  - Product Service        │
                    │  - Order Service          │
                    └───────────────────────────┘
```

---

## Step 1: Configure Upstream Services

Before creating DataSources, configure your upstream services:

```typescript
import { setConfig, registerUpstreamService } from 'graphql-query-builder';

// Option 1: Configure all at once
setConfig({
  maxDepth: 10,
  maxFields: 100,
  blockedFields: ['password', 'ssn', 'secretKey'],
  upstreamServices: {
    userService: {
      endpoint: 'https://users.internal.example.com/graphql',
      timeout: 5000,
      requiredFields: ['id'],
      maxDepth: 5,
      headers: {
        'X-Service-Name': 'my-gateway',
      },
    },
    productService: {
      endpoint: 'https://products.internal.example.com/graphql',
      timeout: 10000,
      requiredFields: ['sku'],
    },
  },
});

// Option 2: Register services individually
registerUpstreamService('orderService', {
  endpoint: 'https://orders.internal.example.com/graphql',
  timeout: 15000,
});
```

### Service Configuration Options

| Option           | Description             | Default       |
| ---------------- | ----------------------- | ------------- |
| `endpoint`       | GraphQL endpoint URL    | Required      |
| `timeout`        | Request timeout in ms   | 30000         |
| `requiredFields` | Fields always included  | `[]`          |
| `maxDepth`       | Max query depth         | Global config |
| `maxFields`      | Max fields per query    | Global config |
| `blockedFields`  | Fields to never include | Global config |
| `headers`        | Custom request headers  | `{}`          |
| `cacheConfig`    | Cache settings          | `undefined`   |

---

## Step 2: Using SimpleGraphQLDataSource

The simplest way to get started is with `SimpleGraphQLDataSource`:

```typescript
import { SimpleGraphQLDataSource, registerUpstreamService } from 'graphql-query-builder';

// Configure the service
registerUpstreamService('userService', {
  endpoint: 'https://users.example.com/graphql',
  timeout: 5000,
});

// Create the data source
const userService = new SimpleGraphQLDataSource('userService');
```

### Using in a Resolver

```typescript
const resolvers = {
  Query: {
    user: async (_, args, context, info) => {
      return context.dataSources.userService.executeQuery(
        'user', // Root field to query
        { id: args.id }, // Variables
        info, // GraphQL resolve info
      );
    },
  },
};
```

The `executeQuery` method automatically:

1. Extracts fields from `info`
2. Builds an optimized query
3. Validates against security rules
4. Executes the request
5. Returns the result

---

## Step 3: Authentication with Built-in Classes

### Bearer Token Authentication

```typescript
import { BearerAuthDataSource } from 'graphql-query-builder';

// Service with API token
const protectedService = new BearerAuthDataSource('protectedService', process.env.API_TOKEN);
```

### Custom Header Authentication

```typescript
import { HeaderAuthDataSource } from 'graphql-query-builder';

// Service with custom auth headers
const internalService = new HeaderAuthDataSource('internalService', {
  'X-API-Key': process.env.API_KEY,
  'X-Tenant-ID': 'tenant-123',
  'X-Request-Source': 'graphql-gateway',
});
```

---

## Step 4: Creating Custom DataSources

For more control, extend the `GraphQLDataSource` class:

```typescript
import { GraphQLDataSource } from 'graphql-query-builder';
import type { GraphQLResolveInfo } from 'graphql';

class UserServiceDataSource extends GraphQLDataSource {
  private requestContext?: {
    userId?: string;
    traceId?: string;
  };

  constructor() {
    super('userService');
  }

  // Set request-specific context
  setContext(context: { userId?: string; traceId?: string }) {
    this.requestContext = context;
  }

  // Override to add custom authentication headers
  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this.requestContext?.userId) {
      headers['X-User-ID'] = this.requestContext.userId;
    }

    if (this.requestContext?.traceId) {
      headers['X-Trace-ID'] = this.requestContext.traceId;
    }

    headers['Authorization'] = `Bearer ${process.env.SERVICE_TOKEN}`;

    return headers;
  }

  // Typed convenience methods
  async getUser(id: string, info: GraphQLResolveInfo) {
    return this.executeQuery<{ user: User }>('user', { id }, info);
  }

  async getUsers(ids: string[], info: GraphQLResolveInfo) {
    return this.executeQuery<{ users: User[] }>('users', { ids }, info);
  }
}
```

---

## Step 5: Apollo Server 4 Setup

Here's how to integrate with Apollo Server 4:

```typescript
import { ApolloServer } from '@apollo/server';
import { setConfig, BearerAuthDataSource, createDataSourceFactory } from 'graphql-query-builder';

// Configure services at startup
setConfig({
  upstreamServices: {
    userService: {
      endpoint: process.env.USER_SERVICE_URL,
      timeout: 5000,
      requiredFields: ['id'],
    },
    productService: {
      endpoint: process.env.PRODUCT_SERVICE_URL,
      timeout: 10000,
    },
  },
});

// Create factory functions for request-scoped data sources
const createUserService = createDataSourceFactory(BearerAuthDataSource, 'userService');

const createProductService = createDataSourceFactory(BearerAuthDataSource, 'productService');

// Apollo Server context function
interface Context {
  dataSources: {
    userService: BearerAuthDataSource;
    productService: BearerAuthDataSource;
  };
}

const server = new ApolloServer<Context>({
  typeDefs,
  resolvers,
});

// Context creation for each request
async function context({ req }): Promise<Context> {
  const token = req.headers.authorization?.replace('Bearer ', '') ?? '';

  return {
    dataSources: {
      userService: createUserService(token),
      productService: createProductService(token),
    },
  };
}
```

---

## Step 6: Complete Resolver Examples

### Basic Query Resolver

```typescript
const resolvers = {
  Query: {
    user: async (_parent, args: { id: string }, context: Context, info: GraphQLResolveInfo) => {
      // DataSource handles everything automatically
      return context.dataSources.userService.executeQuery('user', { id: args.id }, info);
    },
  },
};
```

### Mutation Resolver

```typescript
const resolvers = {
  Mutation: {
    updateUser: async (_parent, args: { id: string; input: UserInput }, context: Context) => {
      // For mutations, specify which fields to return
      return context.dataSources.userService.executeMutation(
        'updateUser',
        { id: args.id, ...args.input },
        ['id', 'email', 'firstName', 'lastName', 'updatedAt'],
      );
    },
  },
};
```

### Simple Query (Without Info)

When you know exactly which fields you need:

```typescript
async function getUserEmail(id: string, context: Context) {
  return context.dataSources.userService.executeSimpleQuery(
    'user',
    { id },
    ['id', 'email'], // Just these fields
  );
}
```

---

## Step 7: Apollo Federation Integration

For federated subgraphs, use DataSources in reference resolvers:

```typescript
const resolvers = {
  User: {
    // Called when another subgraph references User
    __resolveReference: async (
      reference: { __typename: string; id: string },
      context: Context,
      info: GraphQLResolveInfo,
    ) => {
      // Fetch only fields the gateway needs
      return context.dataSources.userService.executeQuery('user', { id: reference.id }, info);
    },
  },
};
```

---

## Step 8: Advanced - Batch Loading

Combine DataSources with batching for optimal performance:

```typescript
class BatchingUserDataSource extends GraphQLDataSource {
  private batchQueue: Map<
    string,
    {
      resolve: (value: User) => void;
      reject: (error: Error) => void;
      info: GraphQLResolveInfo;
    }[]
  > = new Map();

  private batchTimeout: NodeJS.Timeout | null = null;

  constructor() {
    super('userService');
  }

  async getUser(id: string, info: GraphQLResolveInfo): Promise<User> {
    return new Promise((resolve, reject) => {
      // Add to batch queue
      if (!this.batchQueue.has(id)) {
        this.batchQueue.set(id, []);
      }
      this.batchQueue.get(id)!.push({ resolve, reject, info });

      // Schedule batch execution after short delay
      if (!this.batchTimeout) {
        this.batchTimeout = setTimeout(() => this.executeBatch(), 10);
      }
    });
  }

  private async executeBatch() {
    const queue = new Map(this.batchQueue);
    this.batchQueue.clear();
    this.batchTimeout = null;

    const ids = Array.from(queue.keys());
    const firstInfo = queue.values().next().value?.[0]?.info;

    if (!firstInfo) return;

    try {
      // Fetch all users in one request
      const result = await this.executeQuery<{ users: User[] }>('users', { ids }, firstInfo);

      // Resolve all pending promises
      const userMap = new Map(result.users.map((u) => [u.id, u]));

      for (const [id, promises] of queue) {
        const user = userMap.get(id);
        for (const { resolve, reject } of promises) {
          user ? resolve(user) : reject(new Error(`User ${id} not found`));
        }
      }
    } catch (error) {
      // Reject all on error
      for (const promises of queue.values()) {
        for (const { reject } of promises) {
          reject(error as Error);
        }
      }
    }
  }
}
```

---

## Best Practices

### 1. Configure at Startup

```typescript
// ✅ Configure once at application startup
setConfig({
  /* ... */
});

// ❌ Don't configure per-request
```

### 2. Use Factory Functions

```typescript
// ✅ Create fresh data sources per request
const context = {
  dataSources: {
    userService: createUserService(token),
  },
};

// ❌ Don't reuse data source instances across requests
```

### 3. Type Your Data Sources

```typescript
// ✅ Define typed interfaces
interface MyContext {
  dataSources: {
    userService: UserServiceDataSource;
    productService: SimpleGraphQLDataSource;
  };
}
```

### 4. Handle Errors Gracefully

```typescript
try {
  return await context.dataSources.userService.executeQuery('user', args, info);
} catch (error) {
  if (error instanceof UpstreamServiceError) {
    // Handle upstream failures
  }
  throw error;
}
```

---

## Summary

| Pattern                    | Use Case                     |
| -------------------------- | ---------------------------- |
| `SimpleGraphQLDataSource`  | Basic integration, no auth   |
| `BearerAuthDataSource`     | API token authentication     |
| `HeaderAuthDataSource`     | Custom header authentication |
| Custom `GraphQLDataSource` | Full control over requests   |

---

## Next Steps

- **[Security Configuration](../security-configuration/security-configuration.md)** - Add security rules
- **[Performance Optimization](../performance-optimization/performance-optimization.md)** - Enable caching
- **[Framework Integration](../framework-integration/framework-integration.md)** - Other frameworks

---

_Build resilient, optimized GraphQL APIs! 🏗️_
