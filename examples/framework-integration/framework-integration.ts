/**
 * Framework Integration Patterns - graphql-query-builder
 * 
 * See framework-integration.md for the full tutorial.
 */

import type { GraphQLResolveInfo } from 'graphql';
import {
  extractFieldsFromInfo,
  buildQueryFromPathsCached,
  GraphQLDataSource,
  BearerAuthDataSource,
  setConfig,
  initializeQueryCache,
  initializeASTCache,
  getQueryCacheStats,
  parseQueryCached,
} from 'graphql-query-builder';

// Apollo Server 4 Context Factory
export function createApolloServerContext() {
  initializeQueryCache({ maxSize: 1000, ttl: 300000 });
  initializeASTCache({ maxSize: 500, ttl: 600000 });
  setConfig({
    maxDepth: 10,
    maxFields: 100,
    upstreamServices: {
      userService: { endpoint: process.env.USER_SERVICE_URL || 'http://localhost:4001/graphql', timeout: 5000, requiredFields: ['id'] },
      productService: { endpoint: process.env.PRODUCT_SERVICE_URL || 'http://localhost:4002/graphql', timeout: 5000, requiredFields: ['sku'] },
    },
  });

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

export const apolloResolvers = {
  Query: {
    user: async (_: unknown, args: { id: string }, ctx: { dataSources: { userService: BearerAuthDataSource } }, info: GraphQLResolveInfo) =>
      ctx.dataSources.userService.executeQuery('user', { id: args.id }, info),
  },
};

// Express GraphQL Middleware
export function createExpressGraphQLMiddleware() {
  initializeQueryCache({ maxSize: 1000, ttl: 300000 });
  initializeASTCache({ maxSize: 500, ttl: 600000 });

  return (req: { headers: Record<string, string>; graphqlContext?: unknown }, _res: unknown, next: () => void) => {
    const token = req.headers.authorization?.replace('Bearer ', '') ?? '';
    req.graphqlContext = { dataSources: { userService: new BearerAuthDataSource('userService', token) } };
    next();
  };
}

// NestJS Integration
export class UserServiceDataSource extends BearerAuthDataSource {
  constructor(token: string) { super('userService', token); }
  async findUser(id: string, info: GraphQLResolveInfo) { return this.executeQuery('user', { id }, info); }
  async findUsers(filter: { status?: string }, info: GraphQLResolveInfo) { return this.executeQuery('users', filter, info); }
}

export const UserServiceDataSourceFactory = {
  provide: 'USER_DATA_SOURCE',
  useFactory: (token: string) => new UserServiceDataSource(token),
  inject: ['AUTH_TOKEN'],
};

// GraphQL Yoga Context
export function createYogaContext() {
  initializeQueryCache({ maxSize: 1000, ttl: 300000 });
  initializeASTCache({ maxSize: 500, ttl: 600000 });
  setConfig({ maxDepth: 10, maxFields: 100, upstreamServices: { userService: { endpoint: 'http://localhost:4001/graphql', timeout: 5000, requiredFields: ['id'] } } });

  return ({ request }: { request: Request }) => {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? '';
    return { dataSources: { userService: new BearerAuthDataSource('userService', token) } };
  };
}

// Mercurius (Fastify) Context
export function createMercuriusContext() {
  initializeQueryCache({ maxSize: 1000, ttl: 300000 });
  setConfig({ maxDepth: 10, upstreamServices: { userService: { endpoint: 'http://localhost:4001/graphql', timeout: 5000, requiredFields: ['id'] } } });

  return (request: { headers: Record<string, string> }, _reply: unknown) => {
    const token = request.headers.authorization?.replace('Bearer ', '') ?? '';
    return { dataSources: { userService: new BearerAuthDataSource('userService', token) } };
  };
}

// AWS AppSync Lambda Resolver
export async function appSyncLambdaResolver(event: { info: { selectionSetList: string[] }; arguments: Record<string, unknown> }) {
  const { query, variables } = buildQueryFromPathsCached('user', event.info.selectionSetList, { operationName: 'GetUser', variables: event.arguments });
  const response = await fetch('http://user-service/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const data = (await response.json()) as { data?: { user?: unknown } };
  return data.data?.user;
}

// Testing Utilities
export class TestingUtilities {
  static createMockInfo(fields: string[]): Partial<GraphQLResolveInfo> {
    return { fieldName: 'testField', fieldNodes: [], returnType: null as any, parentType: null as any, path: { key: 'test', typename: 'Query', prev: undefined }, schema: null as any, fragments: {}, rootValue: null, operation: null as any, variableValues: {} };
  }

  static verifyQueryFields(query: string, expectedFields: string[]): boolean {
    const ast = parseQueryCached(query);
    return ast ? expectedFields.every(field => query.includes(field)) : false;
  }

  static createCapturingDataSource(serviceName: string) {
    const captured: Array<{ query: string; variables: Record<string, unknown> }> = [];
    class CapturingDataSource extends GraphQLDataSource {
      constructor() { super(serviceName); }
      protected async performRequest<T>(builtQuery: { query: string; variables: Record<string, unknown> }): Promise<T> {
        captured.push({ query: builtQuery.query, variables: builtQuery.variables });
        return { data: {} } as T;
      }
      getCapturedQueries() { return captured; }
    }
    return new CapturingDataSource();
  }
}

// DataDog APM Integration
export class DataDogTracedDataSource extends GraphQLDataSource {
  constructor(serviceName: string, private tracer: { trace: (name: string, fn: () => Promise<unknown>) => Promise<unknown> }) { super(serviceName); }

  async executeQuery<T>(rootField: string, variables: Record<string, unknown>, info: GraphQLResolveInfo): Promise<T> {
    return this.tracer.trace(`graphql.${rootField}`, async () => {
      const extracted = extractFieldsFromInfo(info);
      console.log('Span tags:', { 'graphql.field_count': extracted.fieldCount, 'graphql.depth': extracted.depth });
      return super.executeQuery<T>(rootField, variables, info);
    }) as Promise<T>;
  }
}

// Prometheus Metrics Integration
export class PrometheusMetricsDataSource extends GraphQLDataSource {
  private metrics = { queryCount: new Map<string, number>(), queryDuration: new Map<string, number[]>(), fieldCounts: [] as number[] };

  constructor(serviceName: string) { super(serviceName); }

  async executeQuery<T>(rootField: string, variables: Record<string, unknown>, info: GraphQLResolveInfo): Promise<T> {
    const start = Date.now();
    this.metrics.fieldCounts.push(extractFieldsFromInfo(info).fieldCount);
    try {
      const result = await super.executeQuery<T>(rootField, variables, info);
      this.metrics.queryCount.set(rootField, (this.metrics.queryCount.get(rootField) || 0) + 1);
      const durations = this.metrics.queryDuration.get(rootField) || [];
      durations.push(Date.now() - start);
      this.metrics.queryDuration.set(rootField, durations);
      return result;
    } catch (error) {
      this.metrics.queryCount.set(`${rootField}_error`, (this.metrics.queryCount.get(`${rootField}_error`) || 0) + 1);
      throw error;
    }
  }

  exportMetrics(): string {
    const lines = ['# HELP graphql_queries_total Total GraphQL queries', '# TYPE graphql_queries_total counter'];
    for (const [field, count] of this.metrics.queryCount.entries()) lines.push(`graphql_queries_total{field="${field}"} ${count}`);
    lines.push('# HELP graphql_query_duration_seconds Query duration', '# TYPE graphql_query_duration_seconds histogram');
    for (const [field, durations] of this.metrics.queryDuration.entries()) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length / 1000;
      lines.push(`graphql_query_duration_seconds{field="${field}",quantile="0.5"} ${avg}`);
    }
    return lines.join('\n');
  }
}

// Cache Warming
export async function warmCaches(commonQueries: Array<{ fields: string[]; rootField: string }>) {
  console.log('Warming query cache...');
  for (const { fields, rootField } of commonQueries) buildQueryFromPathsCached(rootField, fields, { operationName: `Warmup${rootField}` });
  console.log(`Cache warmed with ${getQueryCacheStats?.()?.size ?? 0} queries`);
}
