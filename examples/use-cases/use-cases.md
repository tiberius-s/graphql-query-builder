# Real-World Use Cases Tutorial

A collection of practical patterns for common GraphQL architecture challenges.

---

## Introduction

This tutorial showcases real-world scenarios where `graphql-query-builder` shines. Each use case demonstrates a specific architectural pattern you might encounter in production systems.

---

## Prerequisites

- Completed previous tutorials
- Familiarity with GraphQL architecture patterns

---

## Use Case 1: Apollo Federation Subgraph

### The Problem

Your federation subgraph resolves User data from an upstream service. Without optimization, you fetch ALL user fields even when the client only needs a name.

### The Solution

```typescript
import {
  extractFieldsFromInfo,
  buildQueryCached,
  SimpleGraphQLDataSource,
} from 'graphql-query-builder';

class UserSubgraphResolvers {
  static resolvers = {
    Query: {
      user: async (_, args, context, info) => {
        // Only fetch fields the client requested
        return context.dataSources.userService.executeQuery('user', { id: args.id }, info);
      },
    },

    User: {
      // Federation reference resolver
      __resolveReference: async (reference, context, info) => {
        // Gateway requests specific fields - honor that!
        return context.dataSources.userService.executeQuery('user', { id: reference.id }, info);
      },
    },
  };
}
```

### Before vs After

```
Before: Client requests name → Subgraph fetches ALL 50 fields
After:  Client requests name → Subgraph fetches only name

Network savings: ~98% reduction in payload size
```

---

## Use Case 2: BFF (Backend for Frontend)

### The Problem

Your mobile app's dashboard needs data from three services. You want to aggregate them efficiently without overfetching from any service.

### The Solution

```typescript
class MobileDashboardResolver {
  static resolvers = {
    Query: {
      mobileDashboard: async (_, __, context, info) => {
        const extracted = extractFieldsFromInfo(info);

        // Determine which services to call
        const needsUser = extracted.fields.some((f) => f.name === 'user');
        const needsOrders = extracted.fields.some((f) => f.name === 'recentOrders');
        const needsNotifications = extracted.fields.some((f) => f.name === 'notifications');

        // Parallel fetch only what's needed
        const [user, orders, notifications] = await Promise.all([
          needsUser
            ? context.dataSources.userService.executeSimpleQuery('user', { id: context.userId }, [
                'id',
                'name',
                'avatar',
              ])
            : null,
          needsOrders
            ? context.dataSources.orderService.executeSimpleQuery(
                'orders',
                { userId: context.userId, first: 5 },
                ['id', 'status', 'total'],
              )
            : null,
          needsNotifications
            ? context.dataSources.notificationService.executeSimpleQuery(
                'notifications',
                { userId: context.userId, unreadOnly: true },
                ['id', 'message', 'type'],
              )
            : null,
        ]);

        return { user, recentOrders: orders, notifications };
      },
    },
  };
}
```

### Benefits

- Only calls services for fields actually requested
- Parallel execution for minimum latency
- Each service query is optimized

---

## Use Case 3: Multi-Tenant SaaS

### The Problem

Different tenants have different plans with different query limits. You need to enforce tenant-specific restrictions.

### The Solution

```typescript
import { GraphQLDataSource, extractFieldsFromInfo } from 'graphql-query-builder';

class MultiTenantDataSource extends GraphQLDataSource {
  constructor(
    serviceName: string,
    private tenantId: string,
    private tenantTier: 'basic' | 'pro' | 'enterprise',
  ) {
    super(serviceName);
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'X-Tenant-ID': this.tenantId,
    };
  }

  // Tier-based query limits
  getExtractionOptions() {
    const limits = {
      basic: { maxDepth: 3 },
      pro: { maxDepth: 5 },
      enterprise: { maxDepth: 10 },
    };
    return limits[this.tenantTier];
  }

  async executeQuery(rootField, variables, info) {
    const options = this.getExtractionOptions();
    const extracted = extractFieldsFromInfo(info, options);

    // Proceed with tenant-limited query
    return super.executeQuery(rootField, variables, info, {
      extraction: options,
    });
  }
}

// Usage
const dataSource = new MultiTenantDataSource(
  'userService',
  'tenant-123',
  context.tenantTier, // 'basic', 'pro', or 'enterprise'
);
```

---

## Use Case 4: Rate-Limited External API

### The Problem

You're calling a third-party API with strict rate limits. You need to minimize requests and request only essential data.

### The Solution

```typescript
import {
  GraphQLDataSource,
  extractFieldsFromInfo,
  validateFieldSelections,
} from 'graphql-query-builder';

class RateLimitedAPIDataSource extends GraphQLDataSource {
  private requestCount = 0;
  private windowStart = Date.now();
  private readonly maxRequests = 100; // per minute
  private readonly windowMs = 60000;

  constructor() {
    super('externalAPI');
  }

  async executeQuery(rootField, variables, info) {
    // Check rate limit
    const now = Date.now();
    if (now - this.windowStart > this.windowMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    if (this.requestCount >= this.maxRequests) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    this.requestCount++;

    // Extract minimal fields to reduce response size
    const extracted = extractFieldsFromInfo(info, {
      maxDepth: 3, // Keep requests simple
    });

    // Validate complexity
    const validation = validateFieldSelections(extracted.fields, {
      maxFields: 20,
      maxDepth: 3,
    });

    if (!validation.valid) {
      throw new Error(`Query too complex: ${validation.errors.join(', ')}`);
    }

    return super.executeQuery(rootField, variables, info);
  }
}
```

---

## Use Case 5: Security-First API

### The Problem

Your API handles sensitive data. You need multiple layers of security: validation, sanitization, and role-based access.

### The Solution

```typescript
import {
  extractFieldsFromInfo,
  sanitizeFieldSelections,
  validateFieldSelections,
  buildQueryCached,
} from 'graphql-query-builder';

function createSecureResolver(allowedFields: string[], blockedFields: string[]) {
  return async (_, args, context, info) => {
    // Layer 1: Extract fields
    const extracted = extractFieldsFromInfo(info);

    // Layer 2: Sanitize (remove blocked fields)
    const sanitized = sanitizeFieldSelections(extracted.fields, blockedFields);

    // Layer 3: Validate remaining fields
    const validation = validateFieldSelections(sanitized, {
      maxFields: 20,
      maxDepth: 3,
    });

    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Layer 4: Build with sanitized fields
    const { query, variables } = buildQueryCached('secureData', sanitized, {
      operationName: 'SecureQuery',
      variables: { id: args.id },
      requiredFields: ['id'],
    });

    // Layer 5: Execute
    return context.dataSources.secureService.executeQuery('secureData', { id: args.id }, info);
  };
}

// Usage
const resolvers = {
  Query: {
    sensitiveData: createSecureResolver(
      ['id', 'name', 'publicInfo'], // allowed
      ['ssn', 'creditCard', 'internalId'], // blocked
    ),
  },
};
```

---

## Use Case 6: GraphQL Gateway with Schema Stitching

### The Problem

Your gateway stitches schemas from multiple services. Each downstream query should be optimized independently.

### The Solution

```typescript
import {
  setConfig,
  createDataSourceFactory,
  SimpleGraphQLDataSource,
  initializeQueryCache,
} from 'graphql-query-builder';

function setupStitchingGateway() {
  // Initialize caches
  initializeQueryCache({ maxSize: 2000, ttl: 300000 });

  // Configure all upstream services
  setConfig({
    maxDepth: 10,
    maxFields: 100,
    blockedFields: ['password', 'internalId'],
    upstreamServices: {
      usersSchema: {
        endpoint: 'https://users.example.com/graphql',
        timeout: 5000,
        requiredFields: ['id'],
      },
      productsSchema: {
        endpoint: 'https://products.example.com/graphql',
        timeout: 5000,
        requiredFields: ['sku'],
      },
      ordersSchema: {
        endpoint: 'https://orders.example.com/graphql',
        timeout: 10000,
        requiredFields: ['id'],
      },
    },
  });

  // Create factory functions
  return {
    createUsersDataSource: createDataSourceFactory(SimpleGraphQLDataSource, 'usersSchema'),
    createProductsDataSource: createDataSourceFactory(SimpleGraphQLDataSource, 'productsSchema'),
    createOrdersDataSource: createDataSourceFactory(SimpleGraphQLDataSource, 'ordersSchema'),
  };
}
```

---

## Use Case 7: Field-Based Response Caching

### The Problem

You want to cache responses, but the cache key needs to account for which fields were requested.

### The Solution

```typescript
import {
  extractFieldsFromInfo,
  buildQueryCached,
  getRequestedFieldNames,
} from 'graphql-query-builder';
import { createHash } from 'crypto';

class CachingResolver {
  private cache = new Map<string, { data: any; expires: number }>();

  async resolve(rootField: string, args: any, context: any, info: any) {
    // Generate cache key from fields + args
    const fieldNames = getRequestedFieldNames(info);
    const cacheKey = this.generateCacheKey(rootField, args, fieldNames);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    // Execute query
    const result = await context.dataSources.service.executeQuery(rootField, args, info);

    // Cache result
    this.cache.set(cacheKey, {
      data: result,
      expires: Date.now() + 60000, // 1 minute
    });

    return result;
  }

  private generateCacheKey(rootField: string, args: any, fields: string[]): string {
    const data = JSON.stringify({ rootField, args, fields: fields.sort() });
    return createHash('sha256').update(data).digest('hex');
  }
}
```

---

## Use Case 8: Performance Monitoring

### The Problem

You need visibility into query patterns and performance for optimization.

### The Solution

```typescript
import {
  GraphQLDataSource,
  extractFieldsFromInfo,
  getQueryCacheStats,
} from 'graphql-query-builder';

class MonitoredDataSource extends GraphQLDataSource {
  private metrics = {
    queryCount: new Map<string, number>(),
    queryDuration: new Map<string, number[]>(),
    fieldCounts: [] as number[],
  };

  async executeQuery(rootField, variables, info) {
    const startTime = Date.now();
    const extracted = extractFieldsFromInfo(info);

    // Record metrics
    this.metrics.fieldCounts.push(extracted.fieldCount);
    const count = this.metrics.queryCount.get(rootField) || 0;
    this.metrics.queryCount.set(rootField, count + 1);

    try {
      const result = await super.executeQuery(rootField, variables, info);

      // Record duration
      const duration = Date.now() - startTime;
      const durations = this.metrics.queryDuration.get(rootField) || [];
      durations.push(duration);
      this.metrics.queryDuration.set(rootField, durations);

      return result;
    } catch (error) {
      // Record error
      throw error;
    }
  }

  getMetrics() {
    const cacheStats = getQueryCacheStats();

    return {
      queries: Object.fromEntries(this.metrics.queryCount),
      avgFieldCount:
        this.metrics.fieldCounts.reduce((a, b) => a + b, 0) / this.metrics.fieldCounts.length,
      cacheHitRatio: cacheStats.hitRatio,
    };
  }
}
```

---

## Use Case 9: Testing and Mocking

### The Problem

You need to test resolvers without making real network calls.

### The Solution

```typescript
import { GraphQLDataSource } from 'graphql-query-builder';

class MockDataSource extends GraphQLDataSource {
  private mockResponses: Map<string, any> = new Map();
  private capturedQueries: Array<{ query: string; variables: any }> = [];

  constructor(serviceName: string) {
    super(serviceName);
  }

  // Set up mock response
  mockResponse(rootField: string, response: any) {
    this.mockResponses.set(rootField, response);
  }

  // Override to return mocks
  protected async performRequest(builtQuery: any) {
    this.capturedQueries.push({
      query: builtQuery.query,
      variables: builtQuery.variables,
    });

    // Extract root field from query
    const match = builtQuery.query.match(/{\s*(\w+)/);
    const rootField = match?.[1];

    if (rootField && this.mockResponses.has(rootField)) {
      return this.mockResponses.get(rootField);
    }

    throw new Error(`No mock for: ${rootField}`);
  }

  // Get captured queries for assertions
  getCapturedQueries() {
    return this.capturedQueries;
  }
}

// Usage in tests
describe('UserResolver', () => {
  it('should fetch only requested fields', async () => {
    const mockDS = new MockDataSource('userService');
    mockDS.mockResponse('user', { id: '1', name: 'Test' });

    await resolver(null, { id: '1' }, { dataSources: { userService: mockDS } }, mockInfo);

    const [captured] = mockDS.getCapturedQueries();
    expect(captured.query).toContain('name');
    expect(captured.query).not.toContain('email');
  });
});
```

---

## Summary

| Use Case      | Pattern                      |
| ------------- | ---------------------------- |
| Federation    | Optimize reference resolvers |
| BFF           | Conditional service calls    |
| Multi-tenant  | Tier-based limits            |
| Rate limiting | Minimize external calls      |
| Security      | Multi-layer validation       |
| Gateway       | Per-service optimization     |
| Caching       | Field-based cache keys       |
| Monitoring    | Track query patterns         |
| Testing       | Mock data sources            |

---

## Next Steps

- **[Framework Integration](../framework-integration/framework-integration.md)** - Specific framework patterns
- **[Schema Mapping](../schema-mapping/schema-mapping.md)** - Transform between schemas

---

_Build production-ready GraphQL APIs! 🚀_
