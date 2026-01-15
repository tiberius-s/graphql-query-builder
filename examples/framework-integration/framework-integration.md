# Framework Integration Tutorial

A comprehensive guide to integrating `graphql-query-builder` with popular GraphQL frameworks and tools.

---

## Introduction

`graphql-query-builder` is framework-agnostic, but each framework has its own patterns. This tutorial shows you how to integrate with the most popular GraphQL frameworks.

---

## Prerequisites

- Completed previous tutorials
- Familiarity with your chosen framework

---

## Supported Frameworks

- [Apollo Server 4](#apollo-server-4)
- [Express GraphQL](#express-graphql)
- [NestJS](#nestjs)
- [GraphQL Yoga](#graphql-yoga)
- [Mercurius (Fastify)](#mercurius-fastify)
- [AWS AppSync](#aws-appsync)
- [Testing (Jest/Vitest)](#testing)

---

## Apollo Server 4

Apollo Server 4 is the most common choice for Node.js GraphQL APIs.

### Setup

```typescript
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import {
  setConfig,
  initializeQueryCache,
  initializeASTCache,
  BearerAuthDataSource,
} from 'graphql-query-builder';

// Initialize caches once at startup
initializeQueryCache({ maxSize: 1000, ttl: 300000 });
initializeASTCache({ maxSize: 500, ttl: 600000 });

// Configure services
setConfig({
  maxDepth: 10,
  maxFields: 100,
  upstreamServices: {
    userService: {
      endpoint: process.env.USER_SERVICE_URL || 'http://localhost:4001/graphql',
      timeout: 5000,
      requiredFields: ['id'],
    },
  },
});

// Define context type
interface MyContext {
  dataSources: {
    userService: BearerAuthDataSource;
  };
}

// Create server
const server = new ApolloServer<MyContext>({
  typeDefs,
  resolvers,
});

// Start with context
const { url } = await startStandaloneServer(server, {
  listen: { port: 4000 },
  context: async ({ req }) => {
    const token = req.headers.authorization?.replace('Bearer ', '') ?? '';

    return {
      dataSources: {
        userService: new BearerAuthDataSource('userService', token),
      },
    };
  },
});
```

### Resolvers

```typescript
const resolvers = {
  Query: {
    user: async (_, args, context: MyContext, info) => {
      return context.dataSources.userService.executeQuery('user', { id: args.id }, info);
    },
  },
};
```

---

## Express GraphQL

For traditional Express-based setups.

### Setup

```typescript
import express from 'express';
import { graphqlHTTP } from 'express-graphql';
import { setConfig, initializeQueryCache, BearerAuthDataSource } from 'graphql-query-builder';

const app = express();

// Initialize query builder
initializeQueryCache({ maxSize: 1000, ttl: 300000 });
setConfig({
  upstreamServices: {
    userService: {
      endpoint: 'http://localhost:4001/graphql',
      timeout: 5000,
    },
  },
});

// Middleware to create data sources
app.use('/graphql', (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '') ?? '';

  req.dataSources = {
    userService: new BearerAuthDataSource('userService', token),
  };

  next();
});

// GraphQL endpoint
app.use(
  '/graphql',
  graphqlHTTP((req) => ({
    schema,
    context: {
      dataSources: req.dataSources,
    },
  })),
);

app.listen(4000);
```

---

## NestJS

NestJS provides excellent GraphQL support with decorators.

### Module Setup

```typescript
// graphql.module.ts
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { setConfig, initializeQueryCache } from 'graphql-query-builder';

// Initialize at module load
initializeQueryCache({ maxSize: 1000, ttl: 300000 });
setConfig({
  upstreamServices: {
    userService: {
      endpoint: process.env.USER_SERVICE_URL,
      timeout: 5000,
    },
  },
});

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      context: ({ req }) => ({
        token: req.headers.authorization?.replace('Bearer ', ''),
      }),
    }),
  ],
})
export class GraphQLConfigModule {}
```

### Data Source Service

```typescript
// user-datasource.service.ts
import { Injectable, Scope, Inject } from '@nestjs/common';
import { CONTEXT } from '@nestjs/graphql';
import { BearerAuthDataSource } from 'graphql-query-builder';

@Injectable({ scope: Scope.REQUEST })
export class UserDataSourceService extends BearerAuthDataSource {
  constructor(@Inject(CONTEXT) context: { token: string }) {
    super('userService', context.token);
  }
}
```

### Resolver

```typescript
// user.resolver.ts
import { Resolver, Query, Args, Info } from '@nestjs/graphql';
import { GraphQLResolveInfo } from 'graphql';
import { UserDataSourceService } from './user-datasource.service';

@Resolver('User')
export class UserResolver {
  constructor(private userService: UserDataSourceService) {}

  @Query()
  async user(@Args('id') id: string, @Info() info: GraphQLResolveInfo) {
    return this.userService.executeQuery('user', { id }, info);
  }
}
```

---

## GraphQL Yoga

Yoga is a modern, lightweight GraphQL server.

### Setup

```typescript
import { createYoga, createSchema } from 'graphql-yoga';
import { createServer } from 'http';
import { setConfig, initializeQueryCache, BearerAuthDataSource } from 'graphql-query-builder';

// Initialize
initializeQueryCache({ maxSize: 1000, ttl: 300000 });
setConfig({
  upstreamServices: {
    userService: {
      endpoint: 'http://localhost:4001/graphql',
      timeout: 5000,
    },
  },
});

const yoga = createYoga({
  schema: createSchema({
    typeDefs,
    resolvers,
  }),
  context: ({ request }) => {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? '';

    return {
      dataSources: {
        userService: new BearerAuthDataSource('userService', token),
      },
    };
  },
});

const server = createServer(yoga);
server.listen(4000);
```

---

## Mercurius (Fastify)

Mercurius is optimized for the Fastify framework.

### Setup

```typescript
import Fastify from 'fastify';
import mercurius from 'mercurius';
import { setConfig, initializeQueryCache, BearerAuthDataSource } from 'graphql-query-builder';

const app = Fastify();

// Initialize
initializeQueryCache({ maxSize: 1000, ttl: 300000 });
setConfig({
  upstreamServices: {
    userService: {
      endpoint: 'http://localhost:4001/graphql',
      timeout: 5000,
    },
  },
});

app.register(mercurius, {
  schema,
  resolvers,
  context: (request) => {
    const token = request.headers.authorization?.replace('Bearer ', '') ?? '';

    return {
      dataSources: {
        userService: new BearerAuthDataSource('userService', token),
      },
    };
  },
});

app.listen({ port: 4000 });
```

---

## AWS AppSync

For serverless GraphQL with AWS AppSync Lambda resolvers.

### Lambda Resolver

```typescript
import { buildQueryFromPathsCached, initializeQueryCache } from 'graphql-query-builder';

// Initialize cache (reused across warm Lambda invocations)
initializeQueryCache({ maxSize: 100, ttl: 300000 });

interface AppSyncEvent {
  info: {
    selectionSetList: string[];
    fieldName: string;
  };
  arguments: Record<string, unknown>;
}

export async function handler(event: AppSyncEvent) {
  // AppSync provides selection set as paths
  const { query, variables } = buildQueryFromPathsCached(
    event.info.fieldName,
    event.info.selectionSetList,
    {
      operationName: `AppSync_${event.info.fieldName}`,
      variables: event.arguments,
    },
  );

  // Execute against downstream service
  const response = await fetch('http://user-service/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  const data = await response.json();
  return data.data?.[event.info.fieldName];
}
```

---

## Testing

Testing utilities for Jest and Vitest.

### Mock Data Source

```typescript
import { GraphQLDataSource } from 'graphql-query-builder';
import type { BuiltQuery } from 'graphql-query-builder';

class MockDataSource extends GraphQLDataSource {
  private mockResponses = new Map<string, any>();
  private capturedQueries: BuiltQuery[] = [];

  constructor(serviceName: string) {
    super(serviceName);
  }

  mockResponse(rootField: string, response: any) {
    this.mockResponses.set(rootField, response);
  }

  protected async performRequest<T>(builtQuery: BuiltQuery): Promise<T> {
    this.capturedQueries.push(builtQuery);

    const match = builtQuery.query.match(/{\s*(\w+)/);
    const rootField = match?.[1];

    if (rootField && this.mockResponses.has(rootField)) {
      return this.mockResponses.get(rootField);
    }

    throw new Error(`No mock for: ${rootField}`);
  }

  getCapturedQueries() {
    return this.capturedQueries;
  }

  getLastQuery() {
    return this.capturedQueries[this.capturedQueries.length - 1];
  }
}
```

### Test Examples

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { setConfig, resetConfig, registerUpstreamService } from 'graphql-query-builder';

describe('UserResolver', () => {
  let mockUserService: MockDataSource;

  beforeEach(() => {
    resetConfig();
    registerUpstreamService('userService', {
      endpoint: 'http://mock/graphql',
      timeout: 5000,
    });

    mockUserService = new MockDataSource('userService');
    mockUserService.mockResponse('user', {
      id: '1',
      name: 'Test User',
      email: 'test@example.com',
    });
  });

  it('should fetch only requested fields', async () => {
    // Create mock info that requests only 'name'
    const mockInfo = createMockInfo(['name']);

    await mockUserService.executeQuery('user', { id: '1' }, mockInfo);

    const query = mockUserService.getLastQuery();
    expect(query.query).toContain('name');
    expect(query.query).not.toContain('email');
  });

  it('should include required fields', async () => {
    const mockInfo = createMockInfo(['name']);

    await mockUserService.executeQuery('user', { id: '1' }, mockInfo);

    const query = mockUserService.getLastQuery();
    expect(query.query).toContain('id'); // Required field
  });
});
```

### Creating Mock GraphQL Info

```typescript
import { parse } from 'graphql';
import type { GraphQLResolveInfo, FieldNode } from 'graphql';

function createMockInfo(fields: string[]): Partial<GraphQLResolveInfo> {
  const fieldSelections = fields.map((name) => `${name}`).join(' ');
  const document = parse(`query { user { ${fieldSelections} } }`);
  const operationDef = document.definitions[0];

  if (operationDef.kind !== 'OperationDefinition') {
    throw new Error('Invalid operation');
  }

  const userField = operationDef.selectionSet.selections[0] as FieldNode;

  return {
    fieldName: 'user',
    fieldNodes: [userField],
    returnType: null as any,
    parentType: null as any,
    path: { key: 'user', typename: 'Query', prev: undefined },
    schema: null as any,
    fragments: {},
    rootValue: null,
    operation: operationDef,
    variableValues: {},
  };
}
```

---

## Observability Integration

### DataDog APM

```typescript
import tracer from 'dd-trace';
import { GraphQLDataSource, extractFieldsFromInfo } from 'graphql-query-builder';

class DataDogTracedDataSource extends GraphQLDataSource {
  async executeQuery(rootField, variables, info) {
    return tracer.trace(`graphql.${rootField}`, async (span) => {
      const extracted = extractFieldsFromInfo(info);

      span?.setTag('graphql.field_count', extracted.fieldCount);
      span?.setTag('graphql.depth', extracted.depth);

      return super.executeQuery(rootField, variables, info);
    });
  }
}
```

### Prometheus Metrics

```typescript
import { Counter, Histogram } from 'prom-client';
import { GraphQLDataSource, extractFieldsFromInfo } from 'graphql-query-builder';

const queryCounter = new Counter({
  name: 'graphql_queries_total',
  help: 'Total GraphQL queries',
  labelNames: ['rootField'],
});

const queryDuration = new Histogram({
  name: 'graphql_query_duration_seconds',
  help: 'GraphQL query duration',
  labelNames: ['rootField'],
});

class PrometheusDataSource extends GraphQLDataSource {
  async executeQuery(rootField, variables, info) {
    queryCounter.inc({ rootField });
    const timer = queryDuration.startTimer({ rootField });

    try {
      return await super.executeQuery(rootField, variables, info);
    } finally {
      timer();
    }
  }
}
```

---

## Summary

| Framework       | Key Pattern                             |
| --------------- | --------------------------------------- |
| Apollo Server 4 | Context function with data sources      |
| Express GraphQL | Middleware for data sources             |
| NestJS          | Injectable request-scoped services      |
| GraphQL Yoga    | Context factory function                |
| Mercurius       | Fastify context hook                    |
| AWS AppSync     | Lambda with `buildQueryFromPathsCached` |
| Testing         | Mock data source with captured queries  |

---

## Next Steps

- **[Schema Mapping](../schema-mapping/schema-mapping.md)** - Transform between schemas
- **[Use Cases](../use-cases/use-cases.md)** - More patterns

---

_Integrate with your favorite framework! 🔧_
