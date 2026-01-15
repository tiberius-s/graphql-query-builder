/**
 * DataSource Integration Examples - graphql-query-builder
 * 
 * See datasource-integration.md for the full tutorial.
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

// Configure upstream services
export function configureServices() {
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
      },
      productService: {
        endpoint: 'https://products.internal.example.com/graphql',
        timeout: 10000,
        requiredFields: ['sku'],
      },
    },
  });

  registerUpstreamService('orderService', {
    endpoint: 'https://orders.internal.example.com/graphql',
    timeout: 15000,
  });
}

// Simple data source
export function simpleDataSourceExample() {
  registerUpstreamService('userService', {
    endpoint: 'https://users.example.com/graphql',
    timeout: 5000,
  });
  return new SimpleGraphQLDataSource('userService');
}

// Bearer token authentication
export function bearerAuthExample() {
  registerUpstreamService('protectedService', {
    endpoint: 'https://protected.example.com/graphql',
    timeout: 5000,
  });
  return new BearerAuthDataSource('protectedService', process.env.API_TOKEN || '');
}

// Header authentication
export function headerAuthExample() {
  registerUpstreamService('internalService', {
    endpoint: 'https://internal.example.com/graphql',
    timeout: 5000,
  });
  return new HeaderAuthDataSource('internalService', {
    'X-API-Key': process.env.API_KEY || '',
    'X-Tenant-ID': 'tenant-123',
  });
}

// Custom data source
interface User { id: string; email: string; firstName?: string; lastName?: string }
interface UserInput { email?: string; firstName?: string; lastName?: string }

export class UserServiceDataSource extends GraphQLDataSource {
  private requestContext?: { userId?: string; traceId?: string };

  constructor() { super('userService'); }

  setContext(context: { userId?: string; traceId?: string }) {
    this.requestContext = context;
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      ...(this.requestContext?.userId && { 'X-User-ID': this.requestContext.userId }),
      ...(this.requestContext?.traceId && { 'X-Trace-ID': this.requestContext.traceId }),
      'Authorization': `Bearer ${process.env.SERVICE_TOKEN}`,
    };
  }

  async getUser(id: string, info: GraphQLResolveInfo) {
    return this.executeQuery<{ user: User }>('user', { id }, info);
  }

  async getUsers(ids: string[], info: GraphQLResolveInfo) {
    return this.executeQuery<{ users: User[] }>('users', { ids }, info);
  }

  async updateUser(id: string, input: UserInput, returnFieldPaths: string[]) {
    return this.executeMutation<{ updateUser: User }>('updateUser', { id, ...input }, returnFieldPaths);
  }
}

// Apollo Server 4 setup
export function apolloServerSetup() {
  setConfig({
    upstreamServices: {
      userService: {
        endpoint: process.env.USER_SERVICE_URL || 'http://localhost:4001/graphql',
        timeout: 5000,
        requiredFields: ['id'],
      },
    },
  });

  const createUserService = createDataSourceFactory(
    UserServiceDataSource as unknown as new (...args: ConstructorParameters<typeof GraphQLDataSource>) => UserServiceDataSource,
    'userService',
  );

  return {
    contextFunction: async ({ req }: { req: { headers: Record<string, string> } }) => {
      const userService = createUserService();
      if (userService instanceof UserServiceDataSource) {
        userService.setContext({
          userId: req.headers['x-user-id'],
          traceId: req.headers['x-trace-id'],
        });
      }
      return { dataSources: { userService } };
    },
  };
}

// Resolver examples
export const resolversWithDataSource = {
  Query: {
    user: async (_: unknown, args: { id: string }, ctx: { dataSources: { userService: UserServiceDataSource } }, info: GraphQLResolveInfo) =>
      ctx.dataSources.userService.getUser(args.id, info),
  },
  Mutation: {
    updateUser: async (_: unknown, args: { id: string; input: UserInput }, ctx: { dataSources: { userService: UserServiceDataSource } }) =>
      ctx.dataSources.userService.updateUser(args.id, args.input, ['id', 'email', 'firstName', 'lastName', 'updatedAt']),
  },
};

// Federation reference resolver
export const federationExample = {
  User: {
    __resolveReference: async (ref: { id: string }, ctx: { dataSources: { userService: UserServiceDataSource } }, info: GraphQLResolveInfo) =>
      ctx.dataSources.userService.getUser(ref.id, info),
  },
};
