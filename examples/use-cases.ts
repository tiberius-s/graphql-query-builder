/**
 * graphql-query-builder Examples
 *
 * Real-World Use Cases
 *
 * This file demonstrates common real-world scenarios where
 * the GraphQL Query Builder shines.
 */

import type { GraphQLResolveInfo } from 'graphql';
import {
  extractFieldsFromInfo,
  buildQuery,
  buildQueryCached,
  buildQueryFromPathsCached,
  GraphQLDataSource,
  SimpleGraphQLDataSource,
  BearerAuthDataSource,
  QueryBuilderFactory,
  createDataSourceFactory,
  validateFieldSelections,
  sanitizeFieldSelections,
  setConfig,
  registerUpstreamService,
  initializeQueryCache,
  initializeASTCache,
  parseQueryCached,
  validateQuerySyntax,
} from 'graphql-query-builder';

// ============================================================================
// Use Case 1: Apollo Federation Subgraph
// ============================================================================

/**
 * Prevent overfetching in Apollo Federation subgraphs.
 *
 * When your subgraph resolves data from an upstream service,
 * this pattern ensures you only request the fields the client needs.
 */
export class UserSubgraphResolvers {
  static resolvers = {
    Query: {
      /**
       * Optimized user resolver that only fetches requested fields.
       */
      user: async (
        _parent: unknown,
        args: { id: string },
        context: { dataSources: { userService: SimpleGraphQLDataSource } },
        info: GraphQLResolveInfo,
      ) => {
        // Extract only the fields the client requested
        const extracted = extractFieldsFromInfo(info);

        // Build query with just those fields
        const { query, variables } = buildQueryCached('user', extracted.fields, {
          operationName: 'GetUser',
          variables: { id: args.id },
          requiredFields: ['id'], // Always need ID for caching
        });

        // Execute against upstream
        return context.dataSources.userService.executeQuery('user', { id: args.id }, info);
      },
    },

    User: {
      /**
       * Federation reference resolver - called when other subgraphs reference User.
       */
      __resolveReference: async (
        reference: { __typename: string; id: string },
        context: { dataSources: { userService: SimpleGraphQLDataSource } },
        info: GraphQLResolveInfo,
      ) => {
        // Only fetch fields that the federation gateway needs
        return context.dataSources.userService.executeQuery('user', { id: reference.id }, info);
      },
    },
  };
}

// ============================================================================
// Use Case 2: BFF (Backend for Frontend) Pattern
// ============================================================================

/**
 * Aggregate data from multiple services for a mobile app.
 *
 * Mobile clients often need data from multiple sources combined
 * into a single response. This pattern fetches only what's needed
 * from each service.
 */
export class MobileDashboardResolver {
  static resolvers = {
    Query: {
      mobileDashboard: async (
        _parent: unknown,
        _args: unknown,
        context: {
          dataSources: {
            userService: SimpleGraphQLDataSource;
            orderService: SimpleGraphQLDataSource;
            notificationService: SimpleGraphQLDataSource;
          };
          userId: string;
        },
        info: GraphQLResolveInfo,
      ) => {
        const extracted = extractFieldsFromInfo(info);

        // Determine which services need to be called based on requested fields
        const needsUser = extracted.fields.some((f) => f.name === 'user');
        const needsOrders = extracted.fields.some((f) => f.name === 'recentOrders');
        const needsNotifications = extracted.fields.some((f) => f.name === 'notifications');

        // Parallel fetch only needed services
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
                ['id', 'status', 'total', 'createdAt'],
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

// ============================================================================
// Use Case 3: Multi-Tenant SaaS Application
// ============================================================================

/**
 * Tenant-specific configuration and data isolation.
 *
 * Each tenant may have different security requirements and
 * service endpoints.
 */
export class MultiTenantDataSource extends GraphQLDataSource {
  private tenantId: string;
  private tenantConfig: { apiKey: string; tier: 'basic' | 'premium' };

  constructor(
    serviceName: string,
    tenantId: string,
    tenantConfig: { apiKey: string; tier: 'basic' | 'premium' },
  ) {
    super(serviceName);
    this.tenantId = tenantId;
    this.tenantConfig = tenantConfig;
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'X-Tenant-ID': this.tenantId,
      Authorization: `Bearer ${this.tenantConfig.apiKey}`,
    };
  }

  /**
   * Get extraction options with tier-based limits.
   * Basic tier has stricter depth limits.
   */
  getExtractionOptions() {
    // Basic tier has stricter limits
    if (this.tenantConfig.tier === 'basic') {
      return { maxDepth: 3 };
    }
    return { maxDepth: 10 };
  }
}

export function createTenantDataSource(
  serviceName: string,
  tenantId: string,
  tenantConfig: { apiKey: string; tier: 'basic' | 'premium' },
) {
  return new MultiTenantDataSource(serviceName, tenantId, tenantConfig);
}

// ============================================================================
// Use Case 4: Rate-Limited External API
// ============================================================================

/**
 * Minimize API calls to a rate-limited external service.
 *
 * When calling external APIs with rate limits, it's crucial
 * to request only the data you need to minimize calls.
 */
export class RateLimitedAPIDataSource extends GraphQLDataSource {
  private requestCount = 0;
  private windowStart = Date.now();
  private readonly maxRequests = 100; // per minute
  private readonly windowMs = 60000;

  constructor() {
    super('externalAPI');
  }

  async executeQuery<T>(
    rootField: string,
    variables: Record<string, unknown>,
    info: GraphQLResolveInfo,
  ): Promise<T> {
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
      maxDepth: 3, // Limit depth to reduce complexity
    });

    // Validate query complexity before making the call
    const validation = validateFieldSelections(extracted.fields, {
      maxFields: 20, // Keep requests small
      maxDepth: 3,
    });

    if (!validation.valid) {
      throw new Error(`Query too complex for external API: ${validation.errors.join(', ')}`);
    }

    return super.executeQuery(rootField, variables, info);
  }
}

// ============================================================================
// Use Case 5: GraphQL Gateway with Schema Stitching
// ============================================================================

/**
 * Optimize queries in a schema stitching gateway.
 *
 * When stitching schemas from multiple services, ensure each
 * upstream query only requests the fields needed.
 */
export function setupStitchingGateway() {
  // Initialize caches for performance
  initializeQueryCache({ maxSize: 2000, ttl: 300000 });
  initializeASTCache({ maxSize: 1000, ttl: 600000 });

  // Configure services
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

  const createUsersDataSource = createDataSourceFactory(SimpleGraphQLDataSource, 'usersSchema');
  const createProductsDataSource = createDataSourceFactory(
    SimpleGraphQLDataSource,
    'productsSchema',
  );
  const createOrdersDataSource = createDataSourceFactory(SimpleGraphQLDataSource, 'ordersSchema');

  return {
    createUsersDataSource,
    createProductsDataSource,
    createOrdersDataSource,
  };
}

// ============================================================================
// Use Case 6: Microservices with Event Sourcing
// ============================================================================

/**
 * Query event-sourced microservices with projection.
 *
 * When querying event-sourced systems, you often need to specify
 * which projections/views to query and which fields to materialize.
 */
export class EventSourcedDataSource extends GraphQLDataSource {
  constructor(serviceName: string) {
    super(serviceName);
  }

  /**
   * Query a specific projection with field optimization.
   */
  async queryProjection<T>(
    projectionName: string,
    filters: Record<string, unknown>,
    info: GraphQLResolveInfo,
  ): Promise<T> {
    // Use executeQuery which handles field extraction internally
    return this.executeQuery<T>(projectionName, filters, info, {
      build: {
        requiredFields: ['aggregateId', 'version'], // Event sourcing metadata
      },
    });
  }
}

// ============================================================================
// Use Case 7: Security-First API
// ============================================================================

/**
 * Implement security-first querying with field whitelisting.
 *
 * For sensitive APIs, validate and sanitize all queries
 * before execution.
 */
export function createSecureResolver(
  allowedFields: string[],
  blockedFields: string[],
  maxComplexity: number,
) {
  return async (
    _parent: unknown,
    args: { id: string },
    context: { dataSources: { secureService: SimpleGraphQLDataSource } },
    info: GraphQLResolveInfo,
  ) => {
    // Extract and validate fields
    const extracted = extractFieldsFromInfo(info);

    // Sanitize: remove blocked fields
    const sanitized = sanitizeFieldSelections(extracted.fields, blockedFields);

    // Validate complexity
    const validation = validateFieldSelections(sanitized, {
      maxFields: 20,
      maxDepth: 3,
      blockedFields,
    });

    if (!validation.valid) {
      throw new Error(`Query validation failed: ${validation.errors.join(', ')}`);
    }

    // Build and execute with sanitized fields
    const { query, variables } = buildQueryCached('secureData', sanitized, {
      operationName: 'SecureQuery',
      variables: { id: args.id },
      requiredFields: ['id'],
    });

    // Validate generated query syntax
    const syntaxResult = validateQuerySyntax(query);
    if (!syntaxResult.valid) {
      throw new Error('Query generation error');
    }

    return context.dataSources.secureService.executeQuery('secureData', { id: args.id }, info);
  };
}

// ============================================================================
// Use Case 8: Caching Layer with Field-Based Keys
// ============================================================================

/**
 * Implement a caching layer that uses field structure as cache keys.
 *
 * This ensures queries with identical field structures share cache entries,
 * even with different variable values.
 */
export class CachingDataSource extends GraphQLDataSource {
  private responseCache = new Map<string, { data: unknown; expiry: number }>();
  private readonly cacheTTL = 60000; // 1 minute

  constructor(serviceName: string) {
    super(serviceName);
  }

  async executeQuery<T>(
    rootField: string,
    variables: Record<string, unknown>,
    info: GraphQLResolveInfo,
  ): Promise<T> {
    const extracted = extractFieldsFromInfo(info);

    // Generate cache key from field structure + variables
    const fieldHash = JSON.stringify(extracted.fields);
    const varHash = JSON.stringify(variables);
    const cacheKey = `${rootField}:${fieldHash}:${varHash}`;

    // Check cache
    const cached = this.responseCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      console.log('Cache hit for:', cacheKey.substring(0, 50));
      return cached.data as T;
    }

    // Execute query
    const result = await super.executeQuery<T>(rootField, variables, info);

    // Cache result
    this.responseCache.set(cacheKey, {
      data: result,
      expiry: Date.now() + this.cacheTTL,
    });

    return result;
  }

  clearCache() {
    this.responseCache.clear();
  }
}

// ============================================================================
// Use Case 9: Testing & Mocking
// ============================================================================

/**
 * Create mock data sources for testing.
 *
 * When testing resolvers, use simplified data sources that
 * verify correct field extraction without network calls.
 */
export class MockDataSource extends GraphQLDataSource {
  private mockResponses = new Map<string, unknown>();

  constructor(serviceName: string) {
    super(serviceName);
  }

  setMockResponse(rootField: string, response: unknown) {
    this.mockResponses.set(rootField, response);
  }

  async executeQuery<T>(
    rootField: string,
    variables: Record<string, unknown>,
    info: GraphQLResolveInfo,
  ): Promise<T> {
    // Log extracted fields for test assertions
    const extracted = extractFieldsFromInfo(info);
    console.log('Mock query - extracted fields:', extracted.fieldCount);
    console.log('Mock query - depth:', extracted.depth);
    console.log('Mock query - variables:', variables);

    // Return mock response
    const mock = this.mockResponses.get(rootField);
    if (!mock) {
      throw new Error(`No mock response set for: ${rootField}`);
    }

    return mock as T;
  }
}

// ============================================================================
// Use Case 10: Performance Monitoring
// ============================================================================

/**
 * Monitor query performance with field-level metrics.
 *
 * Track how field complexity affects response times.
 */
export class MonitoredDataSource extends GraphQLDataSource {
  private metrics: Array<{
    timestamp: Date;
    rootField: string;
    fieldCount: number;
    depth: number;
    duration: number;
  }> = [];

  constructor(serviceName: string) {
    super(serviceName);
  }

  async executeQuery<T>(
    rootField: string,
    variables: Record<string, unknown>,
    info: GraphQLResolveInfo,
  ): Promise<T> {
    const startTime = Date.now();
    const extracted = extractFieldsFromInfo(info);

    try {
      const result = await super.executeQuery<T>(rootField, variables, info);

      // Record metrics
      this.metrics.push({
        timestamp: new Date(),
        rootField,
        fieldCount: extracted.fieldCount,
        depth: extracted.depth,
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      // Record failed query metrics too
      this.metrics.push({
        timestamp: new Date(),
        rootField,
        fieldCount: extracted.fieldCount,
        depth: extracted.depth,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  getMetrics() {
    return [...this.metrics];
  }

  getAverageResponseTime() {
    if (this.metrics.length === 0) return 0;
    return this.metrics.reduce((sum, m) => sum + m.duration, 0) / this.metrics.length;
  }

  getFieldCountCorrelation() {
    // Calculate correlation between field count and response time
    const data = this.metrics.map((m) => ({
      x: m.fieldCount,
      y: m.duration,
    }));

    // Return data for analysis
    return data;
  }

  clearMetrics() {
    this.metrics = [];
  }
}
