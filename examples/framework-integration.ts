/**
 * graphql-query-builder Examples
 *
 * Framework Integration Patterns
 *
 * This file demonstrates how to integrate graphql-query-builder
 * with popular GraphQL frameworks and tools.
 */

import type { GraphQLResolveInfo } from 'graphql';
import {
  extractFieldsFromInfo,
  buildQueryCached,
  GraphQLDataSource,
  SimpleGraphQLDataSource,
  BearerAuthDataSource,
  setConfig,
  initializeQueryCache,
  initializeASTCache,
  getQueryCacheStats,
  parseQueryCached,
} from 'graphql-query-builder';

// ============================================================================
// Apollo Server Integration
// ============================================================================

/**
 * Apollo Server 4 with graphql-query-builder data sources.
 *
 * This pattern shows how to use data sources with Apollo Server's
 * context function.
 */
export function createApolloServerContext() {
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
      productService: {
        endpoint: process.env.PRODUCT_SERVICE_URL || 'http://localhost:4002/graphql',
        timeout: 5000,
        requiredFields: ['sku'],
      },
    },
  });

  // Context function for Apollo Server
  return async ({ req }: { req: { headers: Record<string, string> } }) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    return {
      token,
      dataSources: {
        userService: new BearerAuthDataSource('userService', token ?? ''),
        productService: new BearerAuthDataSource('productService', token ?? ''),
      },
    };
  };
}

/**
 * Example Apollo Server resolver using the data source.
 */
export const apolloResolvers = {
  Query: {
    user: async (
      _: unknown,
      args: { id: string },
      context: {
        dataSources: {
          userService: BearerAuthDataSource;
        };
      },
      info: GraphQLResolveInfo,
    ) => {
      return context.dataSources.userService.executeQuery('user', { id: args.id }, info);
    },
  },
};

// ============================================================================
// Express GraphQL Middleware
// ============================================================================

/**
 * Express middleware that adds data sources to request context.
 */
export function createExpressGraphQLMiddleware() {
  // Initialize caches
  initializeQueryCache({ maxSize: 1000, ttl: 300000 });
  initializeASTCache({ maxSize: 500, ttl: 600000 });

  return function graphqlMiddleware(
    req: { headers: Record<string, string>; graphqlContext?: unknown },
    res: unknown,
    next: () => void,
  ) {
    const token = req.headers.authorization?.replace('Bearer ', '') ?? '';

    req.graphqlContext = {
      dataSources: {
        userService: new BearerAuthDataSource('userService', token),
      },
    };

    next();
  };
}

// ============================================================================
// NestJS Integration
// ============================================================================

/**
 * NestJS GraphQL module configuration with query builder.
 *
 * This pattern shows how to integrate with NestJS's dependency injection.
 */

// Data source service that can be injected
export class UserServiceDataSource extends BearerAuthDataSource {
  constructor(token: string) {
    super('userService', token);
  }

  // NestJS-style service method
  async findUser(id: string, info: GraphQLResolveInfo) {
    return this.executeQuery('user', { id }, info);
  }

  async findUsers(filter: { status?: string }, info: GraphQLResolveInfo) {
    return this.executeQuery('users', filter, info);
  }
}

// Factory provider example
export const UserServiceDataSourceFactory = {
  provide: 'USER_DATA_SOURCE',
  useFactory: (token: string) => new UserServiceDataSource(token),
  inject: ['AUTH_TOKEN'], // Would come from request context
};

// Resolver using injected service
export class UserResolver {
  constructor(private userService: UserServiceDataSource) {}

  async user(id: string, info: GraphQLResolveInfo) {
    return this.userService.findUser(id, info);
  }
}

// ============================================================================
// GraphQL Yoga Integration
// ============================================================================

/**
 * GraphQL Yoga context factory.
 */
export function createYogaContext() {
  initializeQueryCache({ maxSize: 1000, ttl: 300000 });
  initializeASTCache({ maxSize: 500, ttl: 600000 });

  setConfig({
    maxDepth: 10,
    maxFields: 100,
    upstreamServices: {
      userService: {
        endpoint: 'http://localhost:4001/graphql',
        timeout: 5000,
        requiredFields: ['id'],
      },
    },
  });

  return function contextFactory({ request }: { request: Request }) {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? '';

    return {
      dataSources: {
        userService: new BearerAuthDataSource('userService', token),
      },
    };
  };
}

// ============================================================================
// Mercurius (Fastify) Integration
// ============================================================================

/**
 * Mercurius context function for Fastify.
 */
export function createMercuriusContext() {
  initializeQueryCache({ maxSize: 1000, ttl: 300000 });

  setConfig({
    maxDepth: 10,
    upstreamServices: {
      userService: {
        endpoint: 'http://localhost:4001/graphql',
        timeout: 5000,
        requiredFields: ['id'],
      },
    },
  });

  return function buildContext(request: { headers: Record<string, string> }, reply: unknown) {
    const token = request.headers.authorization?.replace('Bearer ', '') ?? '';

    return {
      dataSources: {
        userService: new BearerAuthDataSource('userService', token),
      },
    };
  };
}

// ============================================================================
// AWS AppSync Integration Pattern
// ============================================================================

/**
 * AWS AppSync resolver using Lambda.
 *
 * In AppSync, you can use graphql-query-builder in Lambda resolvers
 * to optimize downstream service calls.
 */
export async function appSyncLambdaResolver(event: {
  info: { selectionSetList: string[] };
  arguments: Record<string, unknown>;
}) {
  // AppSync provides selection set as paths
  // Use buildQueryFromPathsCached for this use case
  const { buildQueryFromPathsCached } = await import('graphql-query-builder');

  const { query, variables } = buildQueryFromPathsCached('user', event.info.selectionSetList, {
    operationName: 'GetUser',
    variables: event.arguments,
  });

  // Execute against downstream service
  const response = await fetch('http://user-service/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  const data = (await response.json()) as { data?: { user?: unknown } };
  return data.data?.user;
}

// ============================================================================
// Testing with Jest/Vitest
// ============================================================================

/**
 * Test utilities for graphql-query-builder.
 */
export class TestingUtilities {
  /**
   * Create a mock GraphQLResolveInfo for testing.
   */
  static createMockInfo(fields: string[]): Partial<GraphQLResolveInfo> {
    // Note: This is a simplified mock. Real tests would use graphql-tools
    // or similar to create proper resolve info objects.
    return {
      fieldName: 'testField',
      fieldNodes: [],
      returnType: null as any,
      parentType: null as any,
      path: { key: 'test', typename: 'Query', prev: undefined },
      schema: null as any,
      fragments: {},
      rootValue: null,
      operation: null as any,
      variableValues: {},
    };
  }

  /**
   * Verify query structure matches expected fields.
   */
  static verifyQueryFields(query: string, expectedFields: string[]): boolean {
    // Parse and check the query contains expected fields
    const ast = parseQueryCached(query);
    if (!ast) return false;

    // Simple check - in production, traverse AST properly
    return expectedFields.every((field) => query.includes(field));
  }

  /**
   * Create a test data source that captures queries.
   */
  static createCapturingDataSource(serviceName: string) {
    const capturedQueries: Array<{ query: string; variables: Record<string, unknown> }> = [];

    class CapturingDataSource extends GraphQLDataSource {
      constructor() {
        super(serviceName);
      }

      protected async performRequest<T>(builtQuery: {
        query: string;
        variables: Record<string, unknown>;
        operationName: string;
        metadata: { fieldCount: number; depth: number; hasVariables: boolean };
      }): Promise<T> {
        capturedQueries.push({
          query: builtQuery.query,
          variables: builtQuery.variables,
        });
        return { data: {} } as T;
      }

      getCapturedQueries() {
        return capturedQueries;
      }
    }

    return new CapturingDataSource();
  }
}

// ============================================================================
// Monitoring & Observability Integration
// ============================================================================

/**
 * DataDog APM integration example.
 */
export class DataDogTracedDataSource extends GraphQLDataSource {
  private tracer: { trace: (name: string, fn: () => Promise<unknown>) => Promise<unknown> };

  constructor(serviceName: string, tracer: any) {
    super(serviceName);
    this.tracer = tracer;
  }

  async executeQuery<T>(
    rootField: string,
    variables: Record<string, unknown>,
    info: GraphQLResolveInfo,
  ): Promise<T> {
    return this.tracer.trace(`graphql.${rootField}`, async () => {
      const extracted = extractFieldsFromInfo(info);

      // Add custom span tags
      console.log('Span tags:', {
        'graphql.field_count': extracted.fieldCount,
        'graphql.depth': extracted.depth,
      });

      return super.executeQuery<T>(rootField, variables, info);
    }) as Promise<T>;
  }
}

/**
 * Prometheus metrics integration example.
 */
export class PrometheusMetricsDataSource extends GraphQLDataSource {
  private metrics: {
    queryCount: Map<string, number>;
    queryDuration: Map<string, number[]>;
    fieldCounts: number[];
  };

  constructor(serviceName: string) {
    super(serviceName);
    this.metrics = {
      queryCount: new Map(),
      queryDuration: new Map(),
      fieldCounts: [],
    };
  }

  async executeQuery<T>(
    rootField: string,
    variables: Record<string, unknown>,
    info: GraphQLResolveInfo,
  ): Promise<T> {
    const startTime = Date.now();
    const extracted = extractFieldsFromInfo(info);

    // Record field count histogram
    this.metrics.fieldCounts.push(extracted.fieldCount);

    try {
      const result = await super.executeQuery<T>(rootField, variables, info);

      // Increment query counter
      const count = this.metrics.queryCount.get(rootField) || 0;
      this.metrics.queryCount.set(rootField, count + 1);

      // Record duration
      const durations = this.metrics.queryDuration.get(rootField) || [];
      durations.push(Date.now() - startTime);
      this.metrics.queryDuration.set(rootField, durations);

      return result;
    } catch (error) {
      // Record error metrics
      const errorKey = `${rootField}_error`;
      const errorCount = this.metrics.queryCount.get(errorKey) || 0;
      this.metrics.queryCount.set(errorKey, errorCount + 1);
      throw error;
    }
  }

  /**
   * Export metrics in Prometheus format.
   */
  exportMetrics(): string {
    const lines: string[] = [];

    // Query counts
    lines.push('# HELP graphql_queries_total Total number of GraphQL queries');
    lines.push('# TYPE graphql_queries_total counter');
    for (const [field, count] of Array.from(this.metrics.queryCount.entries())) {
      lines.push(`graphql_queries_total{field="${field}"} ${count}`);
    }

    // Average durations
    lines.push('# HELP graphql_query_duration_seconds Query duration in seconds');
    lines.push('# TYPE graphql_query_duration_seconds histogram');
    for (const [field, durations] of Array.from(this.metrics.queryDuration.entries())) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length / 1000;
      lines.push(`graphql_query_duration_seconds{field="${field}",quantile="0.5"} ${avg}`);
    }

    return lines.join('\n');
  }
}

// ============================================================================
// Cache Warming Utility
// ============================================================================

/**
 * Warm caches with common queries at startup.
 */
export async function warmCaches(commonQueries: Array<{ fields: string[]; rootField: string }>) {
  // Import buildQueryFromPathsCached for warming with field paths
  const { buildQueryFromPathsCached } = await import('graphql-query-builder');

  console.log('Warming query cache...');

  for (const { fields, rootField } of commonQueries) {
    // Pre-build common queries using field paths
    buildQueryFromPathsCached(rootField, fields, {
      operationName: `Warmup${rootField}`,
    });
  }

  const stats = getQueryCacheStats?.() ?? { size: 0 };
  console.log(`Cache warmed with ${stats.size} queries`);
}
