/**
 * graphql-query-builder
 *
 * Configuration Module
 *
 * This module provides a flexible configuration system that allows consumers
 * to provide configuration through any mechanism they choose (environment
 * variables, config files, secret managers, etc.) via the ConfigProvider interface.
 *
 * Usage:
 * ```typescript
 * import { initializeConfig, setConfig } from 'graphql-query-builder';
 *
 * // Option 1: Direct configuration
 * setConfig({
 *   maxDepth: 10,
 *   maxFields: 100,
 *   upstreamServices: {
 *     userService: {
 *       endpoint: 'https://api.example.com/graphql',
 *     },
 *   },
 * });
 *
 * // Option 2: Custom provider
 * const myProvider: ConfigProvider = {
 *   get: (key) => myConfigSource.get(key),
 *   has: (key) => myConfigSource.has(key),
 * };
 * await initializeConfig({ provider: myProvider });
 * ```
 */

import { ConfigurationError } from './errors.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Cache configuration for upstream services.
 */
export interface CacheConfig {
  /** Whether caching is enabled */
  enabled: boolean;
  /** Time-to-live in milliseconds */
  ttl?: number;
}

/**
 * Configuration for an upstream GraphQL service endpoint.
 */
export interface UpstreamServiceConfig {
  /** Base URL for the upstream GraphQL endpoint */
  endpoint: string;
  /** Optional timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Optional headers to include with every request */
  headers?: Record<string, string>;
  /** Maximum query depth allowed (for security) */
  maxDepth?: number;
  /** Maximum number of fields allowed in a single query (for security) */
  maxFields?: number;
  /** Fields that are always required regardless of client selection */
  requiredFields?: string[];
  /** Fields that should never be requested from upstream */
  blockedFields?: string[];
  /** Field name mappings (local field name -> upstream field name) */
  fieldMappings?: Record<string, string>;
  /** Cache configuration */
  cacheConfig?: CacheConfig;
}

/**
 * Configuration for field selection and query building.
 */
export interface QueryBuilderConfig {
  /** Map of upstream service configurations by service name */
  upstreamServices: Record<string, UpstreamServiceConfig>;
  /** Global maximum query depth (overridden by service-specific settings) */
  maxDepth?: number;
  /** Global maximum fields per query */
  maxFields?: number;
  /** Global list of blocked fields */
  blockedFields?: string[];
  /** Enable debug logging */
  debug?: boolean;
  /** Enable strict mode (throws on validation failures) */
  strictMode?: boolean;
}

/**
 * Abstract configuration provider interface.
 *
 * Implement this interface to integrate with your preferred configuration source:
 * - Environment variables
 * - AWS Parameter Store / Secrets Manager
 * - HashiCorp Vault
 * - Config files (JSON, YAML, etc.)
 * - node-config
 * - Any other configuration system
 *
 * @example
 * ```typescript
 * // Environment variable provider
 * const envProvider: ConfigProvider = {
 *   get: <T>(key: string) => {
 *     const value = process.env[key];
 *     return value ? JSON.parse(value) as T : undefined;
 *   },
 *   has: (key: string) => key in process.env,
 * };
 *
 * // node-config provider
 * import config from 'config';
 * const nodeConfigProvider: ConfigProvider = {
 *   get: <T>(key: string) => config.get<T>(key),
 *   has: (key: string) => config.has(key),
 * };
 * ```
 */
export interface ConfigProvider {
  /**
   * Gets a configuration value by key.
   * @param key - The configuration key
   * @returns The configuration value or undefined if not found
   */
  get<T>(key: string): T | undefined;

  /**
   * Checks if a configuration key exists.
   * @param key - The configuration key
   * @returns true if the key exists
   */
  has(key: string): boolean;
}

/**
 * Options for initializing configuration.
 */
export interface ConfigInitOptions {
  /** Custom configuration provider */
  provider?: ConfigProvider;
  /** Configuration key to look up in the provider (default: 'graphqlQueryBuilder') */
  configKey?: string;
  /** Direct configuration overrides (highest priority) */
  overrides?: Partial<QueryBuilderConfig>;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * The default configuration key.
 */
const DEFAULT_CONFIG_KEY = 'graphqlQueryBuilder';

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: QueryBuilderConfig = {
  maxDepth: 10,
  maxFields: 100,
  blockedFields: [],
  upstreamServices: {},
};

/**
 * Cached configuration instance.
 */
let cachedConfig: QueryBuilderConfig | null = null;

/**
 * Gets the configuration synchronously.
 *
 * This function returns the cached configuration. If you haven't called
 * initializeConfig() or setConfig() yet, this will return default configuration.
 *
 * @returns The query builder configuration
 *
 * @example
 * ```typescript
 * // First, set up configuration
 * setConfig({ maxDepth: 5 });
 *
 * // Then use it anywhere
 * const config = getConfig();
 * console.log(config.maxDepth); // 5
 * ```
 */
export function getConfig(): QueryBuilderConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Return defaults if no cached config
  cachedConfig = { ...DEFAULT_CONFIG };
  return cachedConfig;
}

/**
 * Sets the configuration programmatically.
 *
 * This is the simplest way to configure the library. Pass a partial
 * configuration object and it will be merged with defaults.
 *
 * @param config - The configuration to set
 *
 * @example
 * ```typescript
 * setConfig({
 *   maxDepth: 5,
 *   maxFields: 50,
 *   upstreamServices: {
 *     userService: {
 *       endpoint: 'https://api.example.com/graphql',
 *       timeout: 5000,
 *     },
 *   },
 * });
 * ```
 */
export function setConfig(config: Partial<QueryBuilderConfig>): void {
  validateConfig(config);
  cachedConfig = mergeConfig(DEFAULT_CONFIG, config);
}

/**
 * Resets the configuration to defaults and clears the cache.
 *
 * Useful for testing or reinitializing the configuration.
 */
export function resetConfig(): void {
  cachedConfig = null;
}

/**
 * Gets the configuration for a specific upstream service.
 *
 * @param serviceName - The name of the upstream service
 * @returns The service configuration or undefined if not found
 *
 * @example
 * ```typescript
 * const userServiceConfig = getUpstreamServiceConfig('userService');
 * if (userServiceConfig) {
 *   console.log(userServiceConfig.endpoint);
 * }
 * ```
 */
export function getUpstreamServiceConfig(serviceName: string): UpstreamServiceConfig | undefined {
  const config = getConfig();
  return config.upstreamServices[serviceName];
}

/**
 * Registers an upstream service configuration.
 *
 * @param serviceName - The name of the upstream service
 * @param config - The service configuration
 *
 * @example
 * ```typescript
 * registerUpstreamService('userService', {
 *   endpoint: 'https://users.example.com/graphql',
 *   timeout: 5000,
 *   requiredFields: ['id'],
 *   maxDepth: 5,
 * });
 * ```
 */
export function registerUpstreamService(serviceName: string, config: UpstreamServiceConfig): void {
  validateServiceConfig(serviceName, config);
  const currentConfig = getConfig();
  cachedConfig = {
    ...currentConfig,
    upstreamServices: {
      ...currentConfig.upstreamServices,
      [serviceName]: config,
    },
  };
}

/**
 * Validates the configuration.
 *
 * @param config - The configuration to validate
 * @throws ConfigurationError if the configuration is invalid
 */
export function validateConfig(config: Partial<QueryBuilderConfig>): void {
  if (config.maxDepth !== undefined) {
    if (typeof config.maxDepth !== 'number' || config.maxDepth < 1) {
      throw new ConfigurationError('maxDepth must be a positive number', 'maxDepth');
    }
  }

  if (config.maxFields !== undefined) {
    if (typeof config.maxFields !== 'number' || config.maxFields < 1) {
      throw new ConfigurationError('maxFields must be a positive number', 'maxFields');
    }
  }

  if (config.blockedFields !== undefined) {
    if (!Array.isArray(config.blockedFields)) {
      throw new ConfigurationError('blockedFields must be an array', 'blockedFields');
    }
  }

  if (config.upstreamServices !== undefined) {
    for (const [name, serviceConfig] of Object.entries(config.upstreamServices)) {
      validateServiceConfig(name, serviceConfig);
    }
  }
}

/**
 * Validates a service configuration.
 *
 * @param serviceName - The service name for error messages
 * @param config - The service configuration to validate
 * @throws ConfigurationError if the configuration is invalid
 */
function validateServiceConfig(serviceName: string, config: UpstreamServiceConfig): void {
  if (!config.endpoint) {
    throw new ConfigurationError(
      `Missing endpoint for service: ${serviceName}`,
      `upstreamServices.${serviceName}.endpoint`,
    );
  }

  if (typeof config.endpoint !== 'string') {
    throw new ConfigurationError(
      `Invalid endpoint for service: ${serviceName}`,
      `upstreamServices.${serviceName}.endpoint`,
    );
  }

  try {
    new URL(config.endpoint);
  } catch {
    throw new ConfigurationError(
      `Invalid endpoint URL for service: ${serviceName}`,
      `upstreamServices.${serviceName}.endpoint`,
    );
  }

  if (config.timeout !== undefined) {
    if (typeof config.timeout !== 'number' || config.timeout < 0) {
      throw new ConfigurationError(
        `Invalid timeout for service: ${serviceName}`,
        `upstreamServices.${serviceName}.timeout`,
      );
    }
  }

  if (config.maxDepth !== undefined) {
    if (typeof config.maxDepth !== 'number' || config.maxDepth < 1) {
      throw new ConfigurationError(
        `Invalid maxDepth for service: ${serviceName}`,
        `upstreamServices.${serviceName}.maxDepth`,
      );
    }
  }

  if (config.maxFields !== undefined) {
    if (typeof config.maxFields !== 'number' || config.maxFields < 1) {
      throw new ConfigurationError(
        `Invalid maxFields for service: ${serviceName}`,
        `upstreamServices.${serviceName}.maxFields`,
      );
    }
  }
}

/**
 * Merges two configuration objects.
 */
function mergeConfig(
  base: QueryBuilderConfig,
  override: Partial<QueryBuilderConfig>,
): QueryBuilderConfig {
  return {
    ...base,
    ...override,
    upstreamServices: {
      ...base.upstreamServices,
      ...override.upstreamServices,
    },
  };
}

/**
 * Creates a configuration object from environment variables.
 *
 * This is useful for containerized deployments where configuration
 * is provided via environment variables.
 *
 * Environment Variables:
 * - GRAPHQL_QUERY_BUILDER_MAX_DEPTH
 * - GRAPHQL_QUERY_BUILDER_MAX_FIELDS
 * - GRAPHQL_QUERY_BUILDER_BLOCKED_FIELDS (comma-separated)
 * - GRAPHQL_QUERY_BUILDER_<SERVICE>_ENDPOINT
 * - GRAPHQL_QUERY_BUILDER_<SERVICE>_TIMEOUT
 *
 * @returns Configuration from environment variables
 *
 * @example
 * ```typescript
 * // Set environment variables
 * process.env.GRAPHQL_QUERY_BUILDER_MAX_DEPTH = '5';
 * process.env.GRAPHQL_QUERY_BUILDER_USERSERVICE_ENDPOINT = 'https://api.example.com/graphql';
 *
 * const envConfig = getConfigFromEnv();
 * setConfig(envConfig);
 * ```
 */
export function getConfigFromEnv(): Partial<QueryBuilderConfig> {
  const prefix = 'GRAPHQL_QUERY_BUILDER_';
  const config: Partial<QueryBuilderConfig> = {};
  const upstreamServices: Record<string, UpstreamServiceConfig> = {};

  // Parse global settings
  const maxDepth = process.env[`${prefix}MAX_DEPTH`];
  if (maxDepth) {
    config.maxDepth = parseInt(maxDepth, 10);
  }

  const maxFields = process.env[`${prefix}MAX_FIELDS`];
  if (maxFields) {
    config.maxFields = parseInt(maxFields, 10);
  }

  const blockedFields = process.env[`${prefix}BLOCKED_FIELDS`];
  if (blockedFields) {
    config.blockedFields = blockedFields.split(',').map((f) => f.trim());
  }

  // Parse service configurations from environment variables
  // Looking for patterns like GRAPHQL_QUERY_BUILDER_<SERVICE>_ENDPOINT
  const servicePattern = new RegExp(`^${prefix}([A-Z_]+)_(ENDPOINT|TIMEOUT|MAX_DEPTH|MAX_FIELDS)$`);

  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(servicePattern);
    if (match && value) {
      const serviceName = match[1].toLowerCase().replace(/_/g, '');
      const setting = match[2];

      if (!upstreamServices[serviceName]) {
        upstreamServices[serviceName] = { endpoint: '' };
      }

      switch (setting) {
        case 'ENDPOINT':
          upstreamServices[serviceName].endpoint = value;
          break;
        case 'TIMEOUT':
          upstreamServices[serviceName].timeout = parseInt(value, 10);
          break;
        case 'MAX_DEPTH':
          upstreamServices[serviceName].maxDepth = parseInt(value, 10);
          break;
        case 'MAX_FIELDS':
          upstreamServices[serviceName].maxFields = parseInt(value, 10);
          break;
      }
    }
  }

  // Only add upstreamServices if we found any
  const validServices = Object.entries(upstreamServices)
    .filter(([, svc]) => svc.endpoint)
    .reduce(
      (acc, [name, svc]) => {
        acc[name] = svc;
        return acc;
      },
      {} as Record<string, UpstreamServiceConfig>,
    );

  if (Object.keys(validServices).length > 0) {
    config.upstreamServices = validServices;
  }

  return config;
}

/**
 * Initializes configuration from a custom provider.
 *
 * Use this when you want to integrate with external configuration sources
 * like node-config, AWS Parameter Store, HashiCorp Vault, etc.
 *
 * Priority (highest to lowest):
 * 1. Direct overrides passed in options
 * 2. Environment variables
 * 3. Custom provider
 * 4. Default values
 *
 * @param options - Configuration initialization options
 *
 * @example
 * ```typescript
 * // Using node-config as provider
 * import config from 'config';
 *
 * await initializeConfig({
 *   provider: {
 *     get: <T>(key: string) => config.has(key) ? config.get<T>(key) : undefined,
 *     has: (key: string) => config.has(key),
 *   },
 * });
 *
 * // Using environment-based provider
 * await initializeConfig({
 *   provider: {
 *     get: <T>(key: string) => {
 *       const envKey = key.toUpperCase().replace(/\./g, '_');
 *       const value = process.env[envKey];
 *       return value ? JSON.parse(value) as T : undefined;
 *     },
 *     has: (key: string) => {
 *       const envKey = key.toUpperCase().replace(/\./g, '_');
 *       return envKey in process.env;
 *     },
 *   },
 * });
 * ```
 */
export async function initializeConfig(options: ConfigInitOptions = {}): Promise<void> {
  const { provider, configKey = DEFAULT_CONFIG_KEY, overrides } = options;

  // Start with defaults
  let config = { ...DEFAULT_CONFIG };

  // Try to load from provider
  if (provider) {
    try {
      if (provider.has(configKey)) {
        const loadedConfig = provider.get<Partial<QueryBuilderConfig>>(configKey);
        if (loadedConfig) {
          config = mergeConfig(config, loadedConfig);
        }
      }
    } catch {
      // Provider error - continue with other sources
    }
  }

  // Apply environment variables
  const envConfig = getConfigFromEnv();
  config = mergeConfig(config, envConfig);

  // Apply programmatic overrides
  if (overrides) {
    config = mergeConfig(config, overrides);
  }

  // Validate and cache
  validateConfig(config);
  cachedConfig = config;
}

/**
 * Creates a node-config compatible provider.
 *
 * This helper creates a ConfigProvider that wraps the node-config package.
 * Use this if you want to continue using node-config with this library.
 *
 * @param nodeConfigModule - The imported node-config module
 * @returns A ConfigProvider that uses node-config
 *
 * @example
 * ```typescript
 * import config from 'config';
 * import { initializeConfig, createNodeConfigProvider } from 'graphql-query-builder';
 *
 * await initializeConfig({
 *   provider: createNodeConfigProvider(config),
 * });
 * ```
 */
export function createNodeConfigProvider(nodeConfigModule: {
  has: (key: string) => boolean;
  get: <T>(key: string) => T;
}): ConfigProvider {
  return {
    get<T>(key: string): T | undefined {
      try {
        return nodeConfigModule.has(key) ? nodeConfigModule.get<T>(key) : undefined;
      } catch {
        return undefined;
      }
    },
    has(key: string): boolean {
      try {
        return nodeConfigModule.has(key);
      } catch {
        return false;
      }
    },
  };
}
