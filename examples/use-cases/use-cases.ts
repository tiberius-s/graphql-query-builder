/**
 * Real-World Use Cases - graphql-query-builder
 * 
 * See use-cases.md for the full tutorial.
 */

import type { GraphQLResolveInfo } from 'graphql';
import {
  extractFieldsFromInfo,
  buildQueryCached,
  buildQueryFromPathsCached,
  GraphQLDataSource,
  SimpleGraphQLDataSource,
  createDataSourceFactory,
  validateFieldSelections,
  sanitizeFieldSelections,
  setConfig,
  initializeQueryCache,
  initializeASTCache,
} from 'graphql-query-builder';

// Use Case 1: Apollo Federation Subgraph
export const federationResolvers = {
  Query: {
    user: async (_: unknown, args: { id: string }, ctx: { dataSources: { userService: SimpleGraphQLDataSource } }, info: GraphQLResolveInfo) =>
      ctx.dataSources.userService.executeQuery('user', { id: args.id }, info),
  },
  User: {
    __resolveReference: async (ref: { id: string }, ctx: { dataSources: { userService: SimpleGraphQLDataSource } }, info: GraphQLResolveInfo) =>
      ctx.dataSources.userService.executeQuery('user', { id: ref.id }, info),
  },
};

// Use Case 2: BFF (Backend for Frontend)
export const bffResolvers = {
  Query: {
    mobileDashboard: async (_: unknown, __: unknown, ctx: { dataSources: Record<string, SimpleGraphQLDataSource>; userId: string }, info: GraphQLResolveInfo) => {
      const extracted = extractFieldsFromInfo(info);
      const needsUser = extracted.fields.some(f => f.name === 'user');
      const needsOrders = extracted.fields.some(f => f.name === 'recentOrders');

      const [user, orders] = await Promise.all([
        needsUser ? ctx.dataSources.userService.executeSimpleQuery('user', { id: ctx.userId }, ['id', 'name', 'avatar']) : null,
        needsOrders ? ctx.dataSources.orderService.executeSimpleQuery('orders', { userId: ctx.userId, first: 5 }, ['id', 'status', 'total']) : null,
      ]);

      return { user, recentOrders: orders };
    },
  },
};

// Use Case 3: Multi-Tenant SaaS
export class MultiTenantDataSource extends GraphQLDataSource {
  constructor(serviceName: string, private tenantId: string, private tier: 'basic' | 'pro' | 'enterprise') {
    super(serviceName);
  }

  protected getAuthHeaders() {
    return { 'X-Tenant-ID': this.tenantId };
  }

  getExtractionOptions() {
    return { maxDepth: this.tier === 'basic' ? 3 : this.tier === 'pro' ? 5 : 10 };
  }
}

// Use Case 4: Rate-Limited External API
export class RateLimitedAPIDataSource extends GraphQLDataSource {
  private requestCount = 0;
  private windowStart = Date.now();

  constructor() { super('externalAPI'); }

  async executeQuery<T>(rootField: string, variables: Record<string, unknown>, info: GraphQLResolveInfo) {
    const now = Date.now();
    if (now - this.windowStart > 60000) { this.requestCount = 0; this.windowStart = now; }
    if (this.requestCount >= 100) throw new Error('Rate limit exceeded');
    this.requestCount++;

    const extracted = extractFieldsFromInfo(info, { maxDepth: 3 });
    const validation = validateFieldSelections(extracted.fields, { maxFields: 20, maxDepth: 3 });
    if (!validation.valid) throw new Error(`Query too complex: ${validation.errors.join(', ')}`);

    return super.executeQuery<T>(rootField, variables, info);
  }
}

// Use Case 5: Schema Stitching Gateway
export function setupStitchingGateway() {
  initializeQueryCache({ maxSize: 2000, ttl: 300000 });
  initializeASTCache({ maxSize: 1000, ttl: 600000 });

  setConfig({
    maxDepth: 10,
    maxFields: 100,
    blockedFields: ['password', 'internalId'],
    upstreamServices: {
      usersSchema: { endpoint: 'https://users.example.com/graphql', timeout: 5000, requiredFields: ['id'] },
      productsSchema: { endpoint: 'https://products.example.com/graphql', timeout: 5000, requiredFields: ['sku'] },
    },
  });

  return {
    createUsersDataSource: createDataSourceFactory(SimpleGraphQLDataSource, 'usersSchema'),
    createProductsDataSource: createDataSourceFactory(SimpleGraphQLDataSource, 'productsSchema'),
  };
}

// Use Case 6: Security-First API
export function createSecureResolver(blockedFields: string[]) {
  return async (_: unknown, args: { id: string }, ctx: { dataSources: { secureService: SimpleGraphQLDataSource } }, info: GraphQLResolveInfo) => {
    const extracted = extractFieldsFromInfo(info);
    const sanitized = sanitizeFieldSelections(extracted.fields, blockedFields);
    const validation = validateFieldSelections(sanitized, { maxFields: 20, maxDepth: 3 });
    if (!validation.valid) throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    return ctx.dataSources.secureService.executeQuery('secureData', { id: args.id }, info);
  };
}

// Use Case 7: Testing Mock Data Source
export class MockDataSource extends GraphQLDataSource {
  private mockResponses = new Map<string, unknown>();
  private capturedQueries: Array<{ query: string; variables: Record<string, unknown> }> = [];

  constructor(serviceName: string) { super(serviceName); }

  mockResponse(rootField: string, response: unknown) { this.mockResponses.set(rootField, response); }

  protected async performRequest<T>(builtQuery: { query: string; variables: Record<string, unknown> }): Promise<T> {
    this.capturedQueries.push({ query: builtQuery.query, variables: builtQuery.variables });
    const match = builtQuery.query.match(/{\s*(\w+)/);
    const rootField = match?.[1];
    if (rootField && this.mockResponses.has(rootField)) return this.mockResponses.get(rootField) as T;
    throw new Error(`No mock for: ${rootField}`);
  }

  getCapturedQueries() { return this.capturedQueries; }
}
