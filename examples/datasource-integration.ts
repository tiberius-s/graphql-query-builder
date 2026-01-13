/**
 * graphql-query-builder Examples
 *
 * DataSource Integration Examples
 *
 * This file demonstrates how to integrate the query builder with
 * Apollo Server 4's data source patterns.
 */

import type { GraphQLResolveInfo } from 'graphql';
import {
  GraphQLDataSource,
  BearerAuthDataSource,
  HeaderAuthDataSource,
  SimpleGraphQLDataSource,
  createDataSourceFactory,
  registerUpstreamService,
  setConfig,
} from 'graphql-query-builder';

// ============================================================================
// Configuration Setup
// ============================================================================

/**
 * Example 1: Configure Upstream Services
 *
 * Configure your upstream services before using data sources.
 */
export function configureServices() {
  // Option 1: Use setConfig for full configuration
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
          'X-Service-Name': 'federation-gateway',
        },
      },
      productService: {
        endpoint: 'https://products.internal.example.com/graphql',
        timeout: 10000,
        requiredFields: ['sku'],
        cacheConfig: {
          enabled: true,
          ttl: 60000, // 1 minute
        },
      },
    },
  });

  // Option 2: Register services individually
  registerUpstreamService('orderService', {
    endpoint: 'https://orders.internal.example.com/graphql',
    timeout: 15000,
  });
}

// ============================================================================
// Custom Data Source Classes
// ============================================================================

/**
 * Example 2: Simple Data Source
 *
 * Using the SimpleGraphQLDataSource for basic use cases.
 */
export function simpleDataSourceExample() {
  // Make sure service is configured first
  registerUpstreamService('userService', {
    endpoint: 'https://users.example.com/graphql',
    timeout: 5000,
  });

  const userService = new SimpleGraphQLDataSource('userService');

  return userService;
}

/**
 * Example 3: Custom Data Source with Bearer Token Auth
 *
 * Create a data source that authenticates with a bearer token.
 */
export function bearerAuthExample() {
  registerUpstreamService('protectedService', {
    endpoint: 'https://protected.example.com/graphql',
    timeout: 5000,
  });

  const apiToken = process.env.API_TOKEN || 'your-api-token';
  const protectedService = new BearerAuthDataSource('protectedService', apiToken);

  return protectedService;
}

/**
 * Example 4: Custom Data Source with Header Auth
 *
 * Create a data source that authenticates with custom headers.
 */
export function headerAuthExample() {
  registerUpstreamService('internalService', {
    endpoint: 'https://internal.example.com/graphql',
    timeout: 5000,
  });

  const internalService = new HeaderAuthDataSource('internalService', {
    'X-API-Key': process.env.API_KEY || 'your-api-key',
    'X-Tenant-ID': 'tenant-123',
    'X-Request-Source': 'graphql-gateway',
  });

  return internalService;
}

/**
 * Example 5: Fully Custom Data Source
 *
 * Extend GraphQLDataSource for complete customization.
 */
export class UserServiceDataSource extends GraphQLDataSource {
  private requestContext?: { userId?: string; traceId?: string };

  constructor() {
    super('userService');
  }

  /**
   * Set the request context for tracing and authentication.
   */
  setContext(context: { userId?: string; traceId?: string }) {
    this.requestContext = context;
  }

  /**
   * Override to add custom authentication headers.
   */
  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this.requestContext?.userId) {
      headers['X-User-ID'] = this.requestContext.userId;
    }

    if (this.requestContext?.traceId) {
      headers['X-Trace-ID'] = this.requestContext.traceId;
    }

    // Add a service-to-service token
    headers['Authorization'] = `Bearer ${process.env.SERVICE_TOKEN}`;

    return headers;
  }

  /**
   * Get a user by ID with automatic field optimization.
   */
  async getUser(id: string, info: GraphQLResolveInfo) {
    return this.executeQuery<{ user: User }>('user', { id }, info);
  }

  /**
   * Get multiple users with automatic field optimization.
   */
  async getUsers(ids: string[], info: GraphQLResolveInfo) {
    return this.executeQuery<{ users: User[] }>('users', { ids }, info);
  }

  /**
   * Update a user and return optimized fields.
   */
  async updateUser(id: string, input: UserInput, returnFieldPaths: string[]) {
    return this.executeMutation<{ updateUser: User }>(
      'updateUser',
      { id, ...input },
      returnFieldPaths,
    );
  }

  /**
   * Simple query without GraphQL info (specify fields manually).
   */
  async getUserEmail(id: string) {
    return this.executeSimpleQuery<{ user: { email: string } }>('user', { id }, ['id', 'email']);
  }
}

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

interface UserInput {
  email?: string;
  firstName?: string;
  lastName?: string;
}

// ============================================================================
// Apollo Server Integration
// ============================================================================

/**
 * Example 6: Apollo Server 4 Context Setup
 *
 * Shows how to set up data sources in Apollo Server 4's context.
 */
export function apolloServerSetup() {
  // First, configure services
  setConfig({
    upstreamServices: {
      userService: {
        endpoint: process.env.USER_SERVICE_URL || 'http://localhost:4001/graphql',
        timeout: 5000,
        requiredFields: ['id'],
      },
      productService: {
        endpoint: process.env.PRODUCT_SERVICE_URL || 'http://localhost:4002/graphql',
        timeout: 10000,
      },
    },
  });

  // Create factory functions for request-scoped data sources
  const createUserService = createDataSourceFactory(
    UserServiceDataSource as unknown as new (
      ...args: ConstructorParameters<typeof GraphQLDataSource>
    ) => UserServiceDataSource,
    'userService',
  );

  const createProductService = createDataSourceFactory(SimpleGraphQLDataSource, 'productService');

  // Example Apollo Server 4 setup (pseudocode)
  const contextFunction = async ({ req }: { req: { headers: Record<string, string> } }) => {
    // Create fresh data sources for each request
    const userService = createUserService();
    const productService = createProductService();

    // Set request-specific context
    if (userService instanceof UserServiceDataSource) {
      userService.setContext({
        userId: req.headers['x-user-id'],
        traceId: req.headers['x-trace-id'],
      });
    }

    return {
      dataSources: {
        userService,
        productService,
      },
    };
  };

  return { contextFunction };
}

/**
 * Example 7: Complete Resolver with Data Source
 *
 * Shows the full pattern of using data sources in resolvers.
 */
export const resolversWithDataSource = {
  Query: {
    user: async (
      _parent: unknown,
      args: { id: string },
      context: { dataSources: { userService: UserServiceDataSource } },
      info: GraphQLResolveInfo,
    ) => {
      // The data source handles:
      // 1. Field extraction from info
      // 2. Query building with only requested fields
      // 3. Security validation
      // 4. Request execution with auth
      // 5. Response caching (if configured)
      return context.dataSources.userService.getUser(args.id, info);
    },

    users: async (
      _parent: unknown,
      args: { ids: string[] },
      context: { dataSources: { userService: UserServiceDataSource } },
      info: GraphQLResolveInfo,
    ) => {
      return context.dataSources.userService.getUsers(args.ids, info);
    },
  },

  Mutation: {
    updateUser: async (
      _parent: unknown,
      args: { id: string; input: UserInput },
      context: { dataSources: { userService: UserServiceDataSource } },
      _info: GraphQLResolveInfo,
    ) => {
      // For mutations, specify which fields to return
      return context.dataSources.userService.updateUser(args.id, args.input, [
        'id',
        'email',
        'firstName',
        'lastName',
        'updatedAt',
      ]);
    },
  },
};

// ============================================================================
// Advanced Patterns
// ============================================================================

/**
 * Example 8: Federated Subgraph with Reference Resolver
 *
 * Shows how to use query builder in Apollo Federation reference resolvers.
 */
export const federationExample = {
  User: {
    // Reference resolver - called when another subgraph references User
    __resolveReference: async (
      reference: { __typename: string; id: string },
      context: { dataSources: { userService: UserServiceDataSource } },
      info: GraphQLResolveInfo,
    ) => {
      // The gateway may request various fields based on the client query
      // Our data source will extract and request only those fields
      return context.dataSources.userService.getUser(reference.id, info);
    },
  },
};

/**
 * Example 9: Batch Loading Pattern
 *
 * Shows how to combine query builder with DataLoader for batching.
 */
export class BatchingUserDataSource extends GraphQLDataSource {
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

      // Schedule batch execution
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

    // Get all unique field paths across all requests
    // (In a real implementation, you'd merge field selections)
    const firstInfo = queue.values().next().value?.[0]?.info;

    if (!firstInfo) return;

    try {
      const result = await this.executeQuery<{ users: User[] }>('users', { ids }, firstInfo);

      // Resolve all pending promises
      const userMap = new Map(result.users.map((u) => [u.id, u]));

      for (const [id, promises] of Array.from(queue.entries())) {
        const user = userMap.get(id);
        for (const { resolve, reject } of promises) {
          if (user) {
            resolve(user);
          } else {
            reject(new Error(`User ${id} not found`));
          }
        }
      }
    } catch (error) {
      // Reject all pending promises
      for (const promises of Array.from(queue.values())) {
        for (const { reject } of promises) {
          reject(error as Error);
        }
      }
    }
  }
}
