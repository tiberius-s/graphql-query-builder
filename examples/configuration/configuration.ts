/**
 * Configuration Examples - graphql-query-builder
 * 
 * See configuration.md for the full tutorial.
 */

import {
  initializeConfig,
  setConfig,
  getConfig,
  resetConfig,
  getConfigFromEnv,
  createNodeConfigProvider,
  registerUpstreamService,
  getUpstreamServiceConfig,
} from 'graphql-query-builder';

// Default configuration
export function setupDefaultConfig() {
  initializeConfig();
  return getConfig();
}

// Programmatic configuration
export function setupProgrammaticConfig() {
  setConfig({
    maxDepth: 10,
    maxFields: 100,
    blockedFields: ['password', 'ssn', 'creditCard'],
    upstreamServices: {
      userService: {
        endpoint: 'https://users.example.com/graphql',
        timeout: 5000,
        requiredFields: ['id'],
        maxDepth: 5,
      },
      productService: {
        endpoint: 'https://products.example.com/graphql',
        timeout: 10000,
        requiredFields: ['sku'],
      },
    },
  });
  return getConfig();
}

// Environment variables
export function demonstrateEnvVars() {
  process.env.GRAPHQL_QUERY_BUILDER_MAX_DEPTH = '8';
  process.env.GRAPHQL_QUERY_BUILDER_MAX_FIELDS = '50';
  process.env.GRAPHQL_QUERY_BUILDER_BLOCKED_FIELDS = 'password,ssn,secret';
  process.env.GRAPHQL_QUERY_BUILDER_USERSERVICE_ENDPOINT = 'https://users.internal.example.com/graphql';
  return getConfigFromEnv();
}

// Custom provider
export function setupCustomProvider() {
  const configStore = new Map([
    ['graphqlQueryBuilder', {
      maxDepth: 10,
      maxFields: 100,
      blockedFields: ['password'],
      upstreamServices: {
        myService: { endpoint: 'https://api.example.com/graphql', timeout: 5000 },
      },
    }],
  ]);

  initializeConfig({
    provider: {
      get: <T>(key: string) => configStore.get(key) as T | undefined,
      has: (key: string) => configStore.has(key),
    },
  });
  return getConfig();
}

// Node-config integration
export function setupNodeConfigProvider() {
  const mockNodeConfig = {
    has: (key: string) => key === 'graphqlQueryBuilder',
    get: <T>(key: string): T => {
      if (key === 'graphqlQueryBuilder') {
        return { maxDepth: 10, maxFields: 100, upstreamServices: {} } as T;
      }
      throw new Error(`Config key not found: ${key}`);
    },
  };
  initializeConfig({ provider: createNodeConfigProvider(mockNodeConfig) });
  return getConfig();
}

// Dynamic service registration
export function registerServicesAtRuntime() {
  setConfig({ maxDepth: 10, maxFields: 100, blockedFields: [], upstreamServices: {} });

  registerUpstreamService('userService', {
    endpoint: process.env.USER_SERVICE_URL || 'http://localhost:4001/graphql',
    timeout: 5000,
    requiredFields: ['id'],
  });

  registerUpstreamService('productService', {
    endpoint: process.env.PRODUCT_SERVICE_URL || 'http://localhost:4002/graphql',
    timeout: 10000,
  });

  return getConfig();
}

// Service config override
export function overrideServiceConfig() {
  const existing = getUpstreamServiceConfig('userService');
  if (existing) {
    registerUpstreamService('userService', { ...existing, timeout: 10000, maxDepth: 3 });
  }
  return getUpstreamServiceConfig('userService');
}

// Environment-specific configuration
export function setupEnvironmentConfig() {
  const env = process.env.NODE_ENV || 'development';

  const configs: Record<string, Parameters<typeof setConfig>[0]> = {
    development: {
      maxDepth: 15,
      maxFields: 200,
      blockedFields: ['password'],
      upstreamServices: {
        userService: { endpoint: 'http://localhost:4001/graphql', timeout: 30000 },
      },
    },
    production: {
      maxDepth: 8,
      maxFields: 50,
      blockedFields: ['password', 'ssn', 'creditCard', 'internalNotes'],
      upstreamServices: {
        userService: {
          endpoint: 'https://users.example.com/graphql',
          timeout: 5000,
          requiredFields: ['id'],
          maxDepth: 5,
        },
      },
    },
  };

  setConfig(configs[env] || configs.development);
  return getConfig();
}

// Reset to defaults
export function resetToDefaults() {
  resetConfig();
  return getConfig();
}
