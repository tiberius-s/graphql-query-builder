# graphql-query-builder Examples

Welcome to the examples and tutorials for `graphql-query-builder`! This directory contains comprehensive guides designed for developers getting started with GraphQL optimization.

---

## 🚀 Quick Start

New to the library? Start here:

1. **[Basic Usage](./basic-usage/basic-usage.md)** - Learn the fundamentals of field extraction and query building
2. **[DataSource Integration](./datasource-integration/datasource-integration.md)** - Integrate with Apollo Server
3. **[Security Configuration](./security-configuration/security-configuration.md)** - Protect your API

---

## 📚 Tutorial Index

### Getting Started

| Tutorial                                          | Description                                | Difficulty |
| ------------------------------------------------- | ------------------------------------------ | ---------- |
| [Basic Usage](./basic-usage/basic-usage.md)       | Extract fields and build optimized queries | Beginner   |
| [Configuration](./configuration/configuration.md) | Environment variables, providers, services | Beginner   |

### Integration Guides

| Tutorial                                                                     | Description                      | Difficulty   |
| ---------------------------------------------------------------------------- | -------------------------------- | ------------ |
| [DataSource Integration](./datasource-integration/datasource-integration.md) | Apollo Server 4 data sources     | Intermediate |
| [Framework Integration](./framework-integration/framework-integration.md)    | NestJS, Yoga, Mercurius, AppSync | Intermediate |

### Security & Performance

| Tutorial                                                                           | Description                              | Difficulty   |
| ---------------------------------------------------------------------------------- | ---------------------------------------- | ------------ |
| [Security Configuration](./security-configuration/security-configuration.md)       | Field blocking, depth limits, validation | Intermediate |
| [Performance Optimization](./performance-optimization/performance-optimization.md) | Query caching, AST caching, warmup       | Intermediate |

### Advanced Patterns

| Tutorial                                             | Description                                             | Difficulty |
| ---------------------------------------------------- | ------------------------------------------------------- | ---------- |
| [Schema Mapping](./schema-mapping/schema-mapping.md) | Translate between service and upstream schemas with Zod | Advanced   |
| [Use Cases](./use-cases/use-cases.md)                | Federation, BFF, multi-tenant, rate limiting            | Advanced   |

---

## 🎯 Learn by Use Case

### "I want to prevent overfetching in my resolvers"

→ Start with [Basic Usage](./basic-usage/basic-usage.md), then [DataSource Integration](./datasource-integration/datasource-integration.md)

### "I need to secure my GraphQL API"

→ Read [Security Configuration](./security-configuration/security-configuration.md)

### "I want to maximize performance"

→ Check out [Performance Optimization](./performance-optimization/performance-optimization.md)

### "My upstream schema differs from my API schema"

→ See [Schema Mapping](./schema-mapping/schema-mapping.md) for Zod-based transformations

### "I'm using Apollo Federation"

→ Look at [Use Cases - Federation](./use-cases/use-cases.md#use-case-1-apollo-federation-subgraph)

### "I'm building a BFF (Backend for Frontend)"

→ See [Use Cases - BFF Pattern](./use-cases/use-cases.md#use-case-2-bff-backend-for-frontend)

### "I'm using NestJS / Yoga / Fastify"

→ Check [Framework Integration](./framework-integration/framework-integration.md)

---

## 📁 Directory Structure

```
examples/
├── README.md                    # This file
├── basic-usage/
│   ├── basic-usage.md          # Tutorial
│   └── basic-usage.ts          # Code examples
├── configuration/
│   ├── configuration.md        # Tutorial
│   └── configuration.ts        # Code examples
├── datasource-integration/
│   ├── datasource-integration.md
│   └── datasource-integration.ts
├── framework-integration/
│   ├── framework-integration.md
│   └── framework-integration.ts
├── performance-optimization/
│   ├── performance-optimization.md
│   └── performance-optimization.ts
├── schema-mapping/
│   ├── schema-mapping.md       # Tutorial
│   └── schema-mapping.ts       # Code examples
├── security-configuration/
│   ├── security-configuration.md
│   └── security-configuration.ts
└── use-cases/
    ├── use-cases.md
    └── use-cases.ts
```

---

## 💡 Quick Code Example

```typescript
import {
  extractFieldsFromInfo,
  buildQuery,
  SimpleGraphQLDataSource,
  setConfig,
  initializeQueryCache,
} from 'graphql-query-builder';
import type { GraphQLResolveInfo } from 'graphql';

// 1. Initialize caching
initializeQueryCache({ maxSize: 500, ttl: 300000 });

// 2. Configure services
setConfig({
  maxDepth: 10,
  maxFields: 100,
  upstreamServices: {
    userService: {
      endpoint: 'http://localhost:4001/graphql',
      timeout: 5000,
    },
  },
});

// 3. Create data source
const dataSource = new SimpleGraphQLDataSource('userService');

// 4. Use in resolver
async function userResolver(
  parent: unknown,
  args: { id: string },
  context: unknown,
  info: GraphQLResolveInfo,
) {
  // Automatically extracts only requested fields
  // and builds an optimized upstream query
  return dataSource.executeQuery('user', { id: args.id }, info);
}
```

---

## 🔗 Related Resources

- [Package README](../readme.md)
- [API Reference](../readme.md#api-reference)

---

## 🤝 Contributing

Found an issue with the examples? Have a use case we should cover?

1. Open an issue describing what's missing
2. Submit a PR with your example or improvement

---

_Happy querying! 🚀_
