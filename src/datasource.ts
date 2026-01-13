/**
 * graphql-query-builder
 *
 * DataSource Integration Module
 *
 * This module provides a GraphQL DataSource class that integrates with
 * Apollo Server 4's datasource patterns. It combines field extraction
 * and query building to automatically optimize upstream GraphQL requests.
 */

import type { GraphQLResolveInfo } from 'graphql';
import type { BuiltQuery, QueryBuildOptions } from './builder.js';
import { buildMutation, buildQuery, buildQueryFromPaths } from './builder.js';
import type { QueryBuilderConfig, UpstreamServiceConfig } from './config.js';
import { getConfig, getUpstreamServiceConfig } from './config.js';
import { ConfigurationError, UpstreamServiceError } from './errors.js';
import type { ExtractedFields, ExtractionOptions } from './extractor.js';
import { extractFieldsFromInfo } from './extractor.js';
import { validateQuery } from './security.js';

// ============================================================================
// Type Definitions (Inlined for Clean Architecture)
// ============================================================================

/**
 * Options for the GraphQL DataSource.
 */
export interface GraphQLDataSourceOptions {
  /** The upstream service configuration override */
  serviceConfig?: Partial<UpstreamServiceConfig>;
  /** Custom fetch implementation */
  fetch?: typeof fetch;
  /** Request interceptor */
  willSendRequest?: (request: RequestInit) => Promise<RequestInit> | RequestInit;
  /** Response interceptor */
  didReceiveResponse?: <T>(response: T) => Promise<T> | T;
}

/**
 * Context passed during query building operations.
 */
export interface QueryBuilderContext {
  /** The service name being queried */
  serviceName: string;
  /** The operation name */
  operationName: string;
  /** Start time of the operation */
  startTime: number;
}

/**
 * Abstract base class for GraphQL data sources.
 *
 * This class provides the foundation for creating data sources that
 * communicate with upstream GraphQL services. It handles:
 * - Field extraction from client queries
 * - Optimized query building
 * - Security validation
 * - Request caching
 *
 * @example
 * ```typescript
 * class UserServiceDataSource extends GraphQLDataSource {
 *   constructor() {
 *     super('userService');
 *   }
 *
 *   async getUser(id: string, info: GraphQLResolveInfo) {
 *     return this.executeQuery('user', { id }, info);
 *   }
 * }
 * ```
 */
export abstract class GraphQLDataSource {
  protected serviceConfig: UpstreamServiceConfig;
  protected globalConfig: QueryBuilderConfig;
  protected cache: Map<string, { data: unknown; timestamp: number }>;

  /**
   * Creates a new GraphQL data source instance.
   *
   * @param serviceName - The name of the upstream service (must match config)
   * @param options - Optional configuration overrides
   */
  constructor(
    protected readonly serviceName: string,
    protected readonly options: GraphQLDataSourceOptions = {},
  ) {
    this.globalConfig = getConfig();
    const serviceConfig = getUpstreamServiceConfig(serviceName);

    if (!serviceConfig) {
      throw new ConfigurationError(
        `No configuration found for service: ${serviceName}`,
        'upstreamServices',
      );
    }

    this.serviceConfig = { ...serviceConfig, ...options.serviceConfig };
    this.cache = new Map();
  }

  /**
   * Executes a query against the upstream GraphQL service.
   *
   * This method:
   * 1. Extracts fields from the client's GraphQL request
   * 2. Builds an optimized query for the upstream service
   * 3. Validates the query against security rules
   * 4. Executes the request and returns the result
   *
   * @param rootField - The root field to query (e.g., 'user', 'product')
   * @param variables - Variables to pass to the query
   * @param info - The GraphQL resolve info from the resolver
   * @param options - Additional options for extraction and building
   * @returns The query result from the upstream service
   */
  async executeQuery<T = unknown>(
    rootField: string,
    variables: Record<string, unknown>,
    info: GraphQLResolveInfo,
    options: {
      extraction?: ExtractionOptions;
      build?: QueryBuildOptions;
      skipCache?: boolean;
    } = {},
  ): Promise<T> {
    // Create context for this request
    const context = this.createContext(info, rootField);

    // Extract fields from client request
    const extracted = this.extractFields(info, options.extraction);

    // Add required fields from service config
    const requiredFields = this.serviceConfig.requiredFields || [];

    // Build optimized query
    const builtQuery = buildQuery(rootField, extracted.fields, {
      operationName: `${this.serviceName}_${rootField}`,
      variables,
      requiredFields,
      fieldMappings: this.serviceConfig.fieldMappings,
      ...options.build,
    });

    // Validate query against security rules
    this.validateQuerySecurity(builtQuery, context);

    // Check cache if enabled
    const cacheKey = this.getCacheKey(builtQuery);
    if (!options.skipCache && this.serviceConfig.cacheConfig?.enabled) {
      const cached = this.getFromCache(cacheKey);
      if (cached !== undefined) {
        return cached as T;
      }
    }

    // Execute the query
    const result = await this.performRequest<T>(builtQuery);

    // Cache the result if enabled
    if (this.serviceConfig.cacheConfig?.enabled) {
      this.setInCache(cacheKey, result);
    }

    return result;
  }

  /**
   * Executes a mutation against the upstream GraphQL service.
   *
   * @param mutationName - The mutation name
   * @param input - The input for the mutation
   * @param returnFieldPaths - Array of field paths to return
   * @param options - Additional options
   * @returns The mutation result
   */
  async executeMutation<T = unknown>(
    mutationName: string,
    input: Record<string, unknown>,
    returnFieldPaths: string[],
    options: { build?: QueryBuildOptions } = {},
  ): Promise<T> {
    // Convert paths to field selections
    const fields = this.pathsToFields(returnFieldPaths);

    // Build the mutation
    const builtMutation = buildMutation(mutationName, { input }, fields, {
      operationName: `${this.serviceName}_${mutationName}`,
      ...options.build,
    });

    // Execute the mutation
    return this.performRequest<T>(builtMutation);
  }

  /**
   * Executes a simple query using field paths instead of GraphQL info.
   * Useful when you know exactly which fields you need.
   *
   * @param rootField - The root field to query
   * @param variables - Variables for the query
   * @param fieldPaths - Array of dot-separated field paths
   * @param options - Additional options
   * @returns The query result
   */
  async executeSimpleQuery<T = unknown>(
    rootField: string,
    variables: Record<string, unknown>,
    fieldPaths: string[],
    options: { build?: QueryBuildOptions; skipCache?: boolean } = {},
  ): Promise<T> {
    // Build query from paths
    const builtQuery = buildQueryFromPaths(rootField, fieldPaths, {
      operationName: `${this.serviceName}_${rootField}`,
      variables,
      ...options.build,
    });

    // Check cache if enabled
    const cacheKey = this.getCacheKey(builtQuery);
    if (!options.skipCache && this.serviceConfig.cacheConfig?.enabled) {
      const cached = this.getFromCache(cacheKey);
      if (cached !== undefined) {
        return cached as T;
      }
    }

    // Execute the query
    const result = await this.performRequest<T>(builtQuery);

    // Cache the result if enabled
    if (this.serviceConfig.cacheConfig?.enabled) {
      this.setInCache(cacheKey, result);
    }

    return result;
  }

  /**
   * Extracts fields from the GraphQL resolve info.
   *
   * @param info - The GraphQL resolve info
   * @param options - Extraction options
   * @returns The extracted fields
   */
  protected extractFields(info: GraphQLResolveInfo, options?: ExtractionOptions): ExtractedFields {
    const mergedOptions: ExtractionOptions = {
      maxDepth: this.serviceConfig.maxDepth || this.globalConfig.maxDepth,
      includeTypename: false,
      ...options,
    };

    return extractFieldsFromInfo(info, mergedOptions);
  }

  /**
   * Validates the built query against security rules.
   */
  protected validateQuerySecurity(builtQuery: BuiltQuery, context: QueryBuilderContext): void {
    const validation = validateQuery(
      builtQuery.metadata.fieldCount,
      builtQuery.metadata.depth,
      this.getRequestedFieldNames(builtQuery),
      {
        maxDepth: this.serviceConfig.maxDepth || this.globalConfig.maxDepth,
        maxFields: this.serviceConfig.maxFields || this.globalConfig.maxFields,
        blockedFields: this.serviceConfig.blockedFields || this.globalConfig.blockedFields,
      },
    );

    if (!validation.valid) {
      throw new UpstreamServiceError(
        `Query validation failed: ${validation.errors.join(', ')}`,
        this.serviceName,
        {
          validation,
          query: builtQuery.query,
          context,
        },
      );
    }
  }

  /**
   * Performs the actual HTTP request to the upstream service.
   * Subclasses can override this to customize request behavior.
   *
   * @param builtQuery - The built query to execute
   * @returns The query result
   */
  protected async performRequest<T>(builtQuery: BuiltQuery): Promise<T> {
    const endpoint = this.serviceConfig.endpoint;
    const timeout = this.serviceConfig.timeout || 30000;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
      ...this.serviceConfig.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: builtQuery.query,
          variables: builtQuery.variables,
          operationName: builtQuery.operationName,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new UpstreamServiceError(
          `HTTP ${response.status}: ${response.statusText}`,
          this.serviceName,
          { status: response.status },
        );
      }

      const result = (await response.json()) as {
        data?: T;
        errors?: Array<{ message: string }>;
      };

      if (result.errors && result.errors.length > 0) {
        throw new UpstreamServiceError(
          `GraphQL errors: ${result.errors.map((e) => e.message).join(', ')}`,
          this.serviceName,
          { errors: result.errors },
        );
      }

      return result.data as T;
    } catch (error) {
      if (error instanceof UpstreamServiceError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new UpstreamServiceError(`Request timeout after ${timeout}ms`, this.serviceName, {
            timeout,
          });
        }

        throw new UpstreamServiceError(error.message, this.serviceName, { originalError: error });
      }

      throw new UpstreamServiceError('Unknown error occurred', this.serviceName);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Gets authentication headers for the upstream request.
   * Subclasses should override this to provide authentication.
   */
  protected getAuthHeaders(): Record<string, string> {
    return {};
  }

  /**
   * Creates a context object for the current request.
   */
  protected createContext(_info: GraphQLResolveInfo, operationName: string): QueryBuilderContext {
    return {
      serviceName: this.serviceName,
      operationName,
      startTime: Date.now(),
    };
  }

  /**
   * Generates a cache key for the query.
   */
  protected getCacheKey(builtQuery: BuiltQuery): string {
    return `${this.serviceName}:${builtQuery.operationName}:${JSON.stringify(
      builtQuery.variables,
    )}`;
  }

  /**
   * Gets a value from the cache.
   */
  protected getFromCache(key: string): unknown | undefined {
    const cached = this.cache.get(key);

    if (!cached) {
      return undefined;
    }

    const ttl = this.serviceConfig.cacheConfig?.ttl || 60000;
    const now = Date.now();

    if (now - cached.timestamp > ttl) {
      this.cache.delete(key);
      return undefined;
    }

    return cached.data;
  }

  /**
   * Sets a value in the cache.
   */
  protected setInCache(key: string, data: unknown): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Clears all cached data for this data source.
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Converts field paths to field selections.
   */
  private pathsToFields(paths: string[]): Array<{
    name: string;
    path: string[];
    depth: number;
  }> {
    return paths.map((path) => {
      const parts = path.split('.');
      return {
        name: parts[parts.length - 1],
        path: parts,
        depth: parts.length,
      };
    });
  }

  /**
   * Extracts field names from the built query.
   */
  private getRequestedFieldNames(builtQuery: BuiltQuery): string[] {
    // Simple extraction from query string
    const matches = builtQuery.query.match(/\b\w+(?=\s*[:{]|\s+\w)/g);
    return matches || [];
  }
}

/**
 * Creates a data source factory function.
 *
 * This is useful for Apollo Server 4's datasource pattern where
 * you need to create new instances per request.
 *
 * @param DataSourceClass - The data source class to instantiate
 * @param args - Arguments to pass to the constructor
 * @returns A factory function that creates data source instances
 *
 * @example
 * ```typescript
 * const userServiceFactory = createDataSourceFactory(
 *   UserServiceDataSource,
 *   'userService'
 * );
 *
 * // In Apollo Server context
 * const server = new ApolloServer({
 *   // ...
 * });
 *
 * const { url } = await startStandaloneServer(server, {
 *   context: async () => ({
 *     dataSources: {
 *       userService: userServiceFactory(),
 *     },
 *   }),
 * });
 * ```
 */
export function createDataSourceFactory<T extends GraphQLDataSource>(
  DataSourceClass: new (...args: ConstructorParameters<typeof GraphQLDataSource>) => T,
  ...args: ConstructorParameters<typeof GraphQLDataSource>
): () => T {
  return () => new DataSourceClass(...args);
}

/**
 * A simpler data source that doesn't require subclassing.
 *
 * Use this when you don't need custom authentication or request handling.
 *
 * @example
 * ```typescript
 * const userService = new SimpleGraphQLDataSource('userService');
 *
 * const user = await userService.executeQuery('user', { id: '123' }, info);
 * ```
 */
export class SimpleGraphQLDataSource extends GraphQLDataSource {}

/**
 * Data source with Bearer token authentication.
 *
 * @example
 * ```typescript
 * const userService = new BearerAuthDataSource('userService', 'my-api-token');
 * ```
 */
export class BearerAuthDataSource extends GraphQLDataSource {
  constructor(
    serviceName: string,
    private readonly token: string,
    options?: GraphQLDataSourceOptions,
  ) {
    super(serviceName, options);
  }

  protected override getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
    };
  }
}

/**
 * Data source with custom header authentication.
 *
 * @example
 * ```typescript
 * const userService = new HeaderAuthDataSource('userService', {
 *   'X-API-Key': 'my-api-key',
 *   'X-Tenant-Id': 'tenant-123',
 * });
 * ```
 */
export class HeaderAuthDataSource extends GraphQLDataSource {
  constructor(
    serviceName: string,
    private readonly authHeaders: Record<string, string>,
    options?: GraphQLDataSourceOptions,
  ) {
    super(serviceName, options);
  }

  protected override getAuthHeaders(): Record<string, string> {
    return this.authHeaders;
  }
}
