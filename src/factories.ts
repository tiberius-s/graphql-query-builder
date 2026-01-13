/**
 * graphql-query-builder
 *
 * Factory Module
 *
 * This module implements the Factory design pattern for creating
 * various query builder components. Factories provide a clean API
 * for instantiation with proper defaults and validation.
 */

import type { GraphQLResolveInfo } from 'graphql';
import type { BuiltQuery, QueryBuildOptions } from './builder.js';
import { buildMutation, buildQuery, buildQueryFromPaths } from './builder.js';
import type { QueryBuilderConfig, UpstreamServiceConfig } from './config.js';
import { getConfig, getUpstreamServiceConfig } from './config.js';
import type { GraphQLDataSourceOptions } from './datasource.js';
import type { ExtractedFields, ExtractionOptions, FieldSelection } from './extractor.js';
import { extractFieldsFromInfo } from './extractor.js';
import { type SecurityConfig, validateFieldSelections } from './security.js';

/**
 * Options for creating a QueryBuilder instance.
 */
export interface QueryBuilderFactoryOptions {
  /** Service name to use for configuration */
  serviceName?: string;
  /** Override extraction options */
  extractionOptions?: ExtractionOptions;
  /** Override build options */
  buildOptions?: QueryBuildOptions;
  /** Override security configuration */
  securityConfig?: Partial<SecurityConfig>;
}

/**
 * A QueryBuilder instance that provides a fluent API for building queries.
 */
export interface QueryBuilder {
  /** Extract fields from GraphQL resolver info */
  extract(info: GraphQLResolveInfo): ExtractedFields;
  /** Build a query from field selections */
  buildFromFields(
    rootField: string,
    fields: FieldSelection[],
    variables?: Record<string, unknown>,
  ): BuiltQuery;
  /** Build a query from field paths */
  buildFromPaths(
    rootField: string,
    paths: string[],
    variables?: Record<string, unknown>,
  ): BuiltQuery;
  /** Build a mutation */
  buildMutation(
    name: string,
    input: Record<string, unknown>,
    returnFields: FieldSelection[],
  ): BuiltQuery;
  /** Validate field selections against security rules */
  validate(fields: FieldSelection[]): { valid: boolean; errors: string[] };
  /** One-shot: extract and build query in one call */
  extractAndBuild(
    info: GraphQLResolveInfo,
    rootField: string,
    variables?: Record<string, unknown>,
  ): BuiltQuery;
}

/**
 * Factory for creating QueryBuilder instances.
 *
 * The QueryBuilderFactory provides a clean API for creating pre-configured
 * query builder instances. It follows the Factory Method pattern.
 *
 * @example
 * ```typescript
 * // Create a factory instance
 * const factory = new QueryBuilderFactory();
 *
 * // Create a query builder for a specific service
 * const builder = factory.create({ serviceName: 'userService' });
 *
 * // Use the builder in a resolver
 * const resolver = async (parent, args, context, info) => {
 *   const { query, variables } = builder.extractAndBuild(info, 'user', { id: args.id });
 *   // Execute query...
 * };
 * ```
 */
export class QueryBuilderFactory {
  private readonly globalConfig: QueryBuilderConfig;

  constructor() {
    this.globalConfig = getConfig();
  }

  /**
   * Creates a new QueryBuilder instance with the specified options.
   *
   * @param options - Configuration options for the builder
   * @returns A configured QueryBuilder instance
   */
  create(options: QueryBuilderFactoryOptions = {}): QueryBuilder {
    const serviceConfig = options.serviceName
      ? getUpstreamServiceConfig(options.serviceName)
      : undefined;

    const extractionOptions: ExtractionOptions = {
      maxDepth: serviceConfig?.maxDepth ?? this.globalConfig.maxDepth ?? 10,
      maxFields: serviceConfig?.maxFields ?? this.globalConfig.maxFields ?? 100,
      ...options.extractionOptions,
    };

    const buildOptions: QueryBuildOptions = {
      fieldMappings: serviceConfig?.fieldMappings ?? {},
      requiredFields: serviceConfig?.requiredFields ?? [],
      ...options.buildOptions,
    };

    const securityConfig: Partial<SecurityConfig> = {
      maxDepth: extractionOptions.maxDepth,
      maxFields: extractionOptions.maxFields,
      blockedFields: serviceConfig?.blockedFields ?? this.globalConfig.blockedFields,
      ...options.securityConfig,
    };

    return {
      extract: (info: GraphQLResolveInfo) => {
        return extractFieldsFromInfo(info, extractionOptions);
      },

      buildFromFields: (
        rootField: string,
        fields: FieldSelection[],
        variables?: Record<string, unknown>,
      ) => {
        return buildQuery(rootField, fields, {
          ...buildOptions,
          variables: variables ?? {},
        });
      },

      buildFromPaths: (rootField: string, paths: string[], variables?: Record<string, unknown>) => {
        return buildQueryFromPaths(rootField, paths, {
          ...buildOptions,
          variables: variables ?? {},
        });
      },

      buildMutation: (
        name: string,
        input: Record<string, unknown>,
        returnFields: FieldSelection[],
      ) => {
        return buildMutation(name, input, returnFields, buildOptions);
      },

      validate: (fields: FieldSelection[]) => {
        return validateFieldSelections(fields, securityConfig);
      },

      extractAndBuild: (
        info: GraphQLResolveInfo,
        rootField: string,
        variables?: Record<string, unknown>,
      ) => {
        const extracted = extractFieldsFromInfo(info, extractionOptions);
        return buildQuery(rootField, extracted.fields, {
          ...buildOptions,
          variables: variables ?? {},
        });
      },
    };
  }

  /**
   * Creates a QueryBuilder pre-configured for a specific upstream service.
   *
   * @param serviceName - The name of the upstream service
   * @param overrides - Optional configuration overrides
   * @returns A QueryBuilder configured for the service
   *
   * @example
   * ```typescript
   * const userQueryBuilder = factory.forService('userService');
   * const { query } = userQueryBuilder.extractAndBuild(info, 'user', { id });
   * ```
   */
  forService(serviceName: string, overrides?: Partial<QueryBuilderFactoryOptions>): QueryBuilder {
    return this.create({
      serviceName,
      ...overrides,
    });
  }
}

/**
 * Options for the DataSource factory.
 */
export interface DataSourceFactoryOptions {
  /** Default options to pass to all created data sources */
  defaultOptions?: GraphQLDataSourceOptions;
  /** Custom fetch implementation */
  fetch?: typeof fetch;
}

/**
 * Registry entry for data source types.
 */
interface DataSourceTypeEntry<T> {
  /** Constructor for the data source class */
  constructor: new (
    serviceName: string,
    options?: GraphQLDataSourceOptions,
  ) => T;
  /** Optional default options for this type */
  defaultOptions?: GraphQLDataSourceOptions;
}

/**
 * Abstract factory for creating DataSource instances.
 *
 * This factory supports registration of custom data source types
 * and provides methods to create instances by service name or type.
 *
 * @example
 * ```typescript
 * // Create a factory
 * const factory = new DataSourceFactory();
 *
 * // Register custom data source types
 * factory.registerType('bearer', BearerAuthDataSource);
 * factory.registerType('apiKey', ApiKeyDataSource);
 *
 * // Create instances
 * const dataSource = factory.createForService('userService');
 * ```
 */
export class DataSourceFactory<T = unknown> {
  private readonly options: DataSourceFactoryOptions;
  private readonly typeRegistry: Map<string, DataSourceTypeEntry<T>> = new Map();

  constructor(options: DataSourceFactoryOptions = {}) {
    this.options = options;
  }

  /**
   * Registers a data source type with the factory.
   *
   * @param typeName - Unique name for this type
   * @param ctor - The data source class constructor
   * @param defaultOptions - Optional default options for this type
   */
  registerType<U extends T>(
    typeName: string,
    ctor: new (serviceName: string, options?: GraphQLDataSourceOptions) => U,
    defaultOptions?: GraphQLDataSourceOptions,
  ): void {
    this.typeRegistry.set(typeName, {
      constructor: ctor as unknown as new (
        serviceName: string,
        options?: GraphQLDataSourceOptions,
      ) => T,
      defaultOptions,
    });
  }

  /**
   * Creates a data source instance for a registered type.
   *
   * @param typeName - The registered type name
   * @param serviceName - The upstream service name
   * @param options - Additional options to merge
   * @returns A new data source instance
   */
  createByType(typeName: string, serviceName: string, options?: GraphQLDataSourceOptions): T {
    const entry = this.typeRegistry.get(typeName);

    if (!entry) {
      throw new Error(`Unknown data source type: ${typeName}`);
    }

    const mergedOptions: GraphQLDataSourceOptions = {
      ...this.options.defaultOptions,
      ...entry.defaultOptions,
      ...options,
    };

    return new entry.constructor(serviceName, mergedOptions);
  }

  /**
   * Gets the registered type names.
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.typeRegistry.keys());
  }

  /**
   * Checks if a type is registered.
   */
  hasType(typeName: string): boolean {
    return this.typeRegistry.has(typeName);
  }
}

/**
 * Configuration builder using the Builder pattern.
 *
 * Provides a fluent API for building QueryBuilderConfig objects.
 *
 * @example
 * ```typescript
 * const config = new ConfigBuilder()
 *   .setMaxDepth(5)
 *   .setMaxFields(50)
 *   .addBlockedField('password')
 *   .addUpstreamService('userService', {
 *     endpoint: 'https://api.example.com/graphql',
 *   })
 *   .build();
 * ```
 */
export class ConfigBuilder {
  private config: QueryBuilderConfig = {
    upstreamServices: {},
  };

  /**
   * Sets the maximum query depth.
   */
  setMaxDepth(depth: number): this {
    this.config.maxDepth = depth;
    return this;
  }

  /**
   * Sets the maximum number of fields.
   */
  setMaxFields(fields: number): this {
    this.config.maxFields = fields;
    return this;
  }

  /**
   * Adds a field to the blocked list.
   */
  addBlockedField(field: string): this {
    if (!this.config.blockedFields) {
      this.config.blockedFields = [];
    }
    this.config.blockedFields.push(field);
    return this;
  }

  /**
   * Sets the blocked fields list.
   */
  setBlockedFields(fields: string[]): this {
    this.config.blockedFields = fields;
    return this;
  }

  /**
   * Enables or disables debug mode.
   */
  setDebug(enabled: boolean): this {
    this.config.debug = enabled;
    return this;
  }

  /**
   * Enables or disables strict mode.
   */
  setStrictMode(enabled: boolean): this {
    this.config.strictMode = enabled;
    return this;
  }

  /**
   * Adds an upstream service configuration.
   */
  addUpstreamService(name: string, config: UpstreamServiceConfig): this {
    this.config.upstreamServices[name] = config;
    return this;
  }

  /**
   * Builds the final configuration object.
   */
  build(): QueryBuilderConfig {
    return { ...this.config };
  }

  /**
   * Resets the builder to initial state.
   */
  reset(): this {
    this.config = {
      upstreamServices: {},
    };
    return this;
  }
}

/**
 * Creates a singleton QueryBuilderFactory instance.
 * Use this when you want a shared factory across your application.
 */
let queryBuilderFactoryInstance: QueryBuilderFactory | null = null;

export function getQueryBuilderFactory(): QueryBuilderFactory {
  if (!queryBuilderFactoryInstance) {
    queryBuilderFactoryInstance = new QueryBuilderFactory();
  }
  return queryBuilderFactoryInstance;
}

/**
 * Resets the singleton factory instance.
 * Useful for testing.
 */
export function resetQueryBuilderFactory(): void {
  queryBuilderFactoryInstance = null;
}
