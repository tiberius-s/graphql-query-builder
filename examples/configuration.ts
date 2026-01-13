/**
 * graphql-query-builder Examples
 *
 * Configuration Examples
 *
 * This file demonstrates the flexible configuration options,
 * including environment variables, custom providers, and
 * integration with external configuration systems.
 */

import {
  // Configuration functions
  initializeConfig,
  setConfig,
  getConfig,
  resetConfig,
  getConfigFromEnv,
  createNodeConfigProvider,
  registerUpstreamService,
  getUpstreamServiceConfig,
} from 'graphql-query-builder';

// ============================================================================
// Basic Configuration
// ============================================================================

/**
 * Example 1: Default Configuration
 *
 * Initialize with default settings and environment variables.
 * This is the simplest setup using GRAPHQL_QUERY_BUILDER_* env vars.
 */
export function setupDefaultConfig() {
  // Initialize with environment variable support
  // Looks for GRAPHQL_QUERY_BUILDER_* environment variables
  initializeConfig();

  const config = getConfig();
  console.log('Configuration loaded:', config);

  return config;
}

/**
 * Example 2: Programmatic Configuration
 *
 * Set configuration programmatically in code.
 */
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

  console.log('Configuration set programmatically');
  return getConfig();
}

// ============================================================================
// Environment Variable Configuration
// ============================================================================

/**
 * Example 3: Environment Variables
 *
 * The package automatically reads from environment variables.
 * Here's the full list of supported variables:
 *
 * Global Settings:
 * - GRAPHQL_QUERY_BUILDER_MAX_DEPTH
 * - GRAPHQL_QUERY_BUILDER_MAX_FIELDS
 * - GRAPHQL_QUERY_BUILDER_BLOCKED_FIELDS (comma-separated)
 *
 * Per-Service Settings (replace <SERVICE> with uppercase service name):
 * - GRAPHQL_QUERY_BUILDER_<SERVICE>_ENDPOINT
 * - GRAPHQL_QUERY_BUILDER_<SERVICE>_TIMEOUT
 * - GRAPHQL_QUERY_BUILDER_<SERVICE>_MAX_DEPTH
 * - GRAPHQL_QUERY_BUILDER_<SERVICE>_MAX_FIELDS
 */
export function demonstrateEnvVars() {
  // Set example environment variables
  process.env.GRAPHQL_QUERY_BUILDER_MAX_DEPTH = '8';
  process.env.GRAPHQL_QUERY_BUILDER_MAX_FIELDS = '50';
  process.env.GRAPHQL_QUERY_BUILDER_BLOCKED_FIELDS = 'password,ssn,secret';
  process.env.GRAPHQL_QUERY_BUILDER_USERSERVICE_ENDPOINT =
    'https://users.internal.example.com/graphql';
  process.env.GRAPHQL_QUERY_BUILDER_USERSERVICE_TIMEOUT = '5000';

  // Get config from environment
  const config = getConfigFromEnv();
  console.log('Config from environment:', config);

  return config;
}

// ============================================================================
// Custom Configuration Providers
// ============================================================================

/**
 * Example 4: Custom Configuration Provider
 *
 * Implement your own configuration provider for integration
 * with AWS Parameter Store, HashiCorp Vault, etc.
 */
export function setupCustomProvider() {
  // Example: In-memory configuration (for demonstration)
  const myConfigStore = new Map<string, unknown>([
    [
      'graphqlQueryBuilder',
      {
        maxDepth: 10,
        maxFields: 100,
        blockedFields: ['password'],
        upstreamServices: {
          myService: {
            endpoint: 'https://api.example.com/graphql',
            timeout: 5000,
          },
        },
      },
    ],
  ]);

  initializeConfig({
    provider: {
      get: <T>(key: string) => myConfigStore.get(key) as T | undefined,
      has: (key: string) => myConfigStore.has(key),
    },
  });

  console.log('Custom provider configured');
  return getConfig();
}

/**
 * Example 5: AWS Parameter Store Provider
 *
 * Example integration with AWS Systems Manager Parameter Store.
 * (Note: This is a conceptual example - actual implementation
 * would require the AWS SDK)
 */
export function setupAWSParameterStoreProvider() {
  // Conceptual example - in production you'd use @aws-sdk/client-ssm
  interface AWSConfig {
    getParameter(name: string): Promise<{ Parameter?: { Value?: string } }>;
  }

  // Mock AWS client for demonstration
  const mockSSMClient: AWSConfig = {
    async getParameter(name: string) {
      // In production, this would call AWS
      const params: Record<string, string> = {
        '/myapp/graphql-builder/config': JSON.stringify({
          maxDepth: 10,
          maxFields: 100,
          upstreamServices: {
            userService: {
              endpoint: 'https://users.example.com/graphql',
              timeout: 5000,
            },
          },
        }),
      };
      return { Parameter: { Value: params[name] } };
    },
  };

  // Create async loader (load at startup, then sync access)
  async function loadAWSConfig() {
    const result = await mockSSMClient.getParameter('/myapp/graphql-builder/config');
    const configData = result.Parameter?.Value ? JSON.parse(result.Parameter.Value) : {};

    initializeConfig({
      provider: {
        get: <T>(key: string) => (key === 'graphqlQueryBuilder' ? (configData as T) : undefined),
        has: (key: string) => key === 'graphqlQueryBuilder',
      },
    });

    console.log('AWS Parameter Store config loaded');
    return getConfig();
  }

  return loadAWSConfig();
}

/**
 * Example 6: Node-Config Integration
 *
 * For teams already using node-config package.
 */
export function setupNodeConfigProvider() {
  // This helper creates a provider that wraps node-config
  // Requires 'config' package to be installed
  // In your actual code, you would import config from 'config'
  const mockNodeConfig = {
    has: (key: string) => key === 'graphqlQueryBuilder',
    get: <T>(key: string): T => {
      if (key === 'graphqlQueryBuilder') {
        return {
          maxDepth: 10,
          maxFields: 100,
          upstreamServices: {},
        } as T;
      }
      throw new Error(`Config key not found: ${key}`);
    },
  };

  initializeConfig({
    provider: createNodeConfigProvider(mockNodeConfig),
  });

  console.log('Node-config provider configured');
  return getConfig();
}

// ============================================================================
// Service Registration
// ============================================================================

/**
 * Example 7: Dynamic Service Registration
 *
 * Register upstream services dynamically at runtime.
 */
export function registerServicesAtRuntime() {
  // Initialize with base config
  setConfig({
    maxDepth: 10,
    maxFields: 100,
    blockedFields: [],
    upstreamServices: {},
  });

  // Register services dynamically
  registerUpstreamService('userService', {
    endpoint: process.env.USER_SERVICE_URL || 'http://localhost:4001/graphql',
    timeout: 5000,
    requiredFields: ['id'],
    maxDepth: 5,
  });

  registerUpstreamService('productService', {
    endpoint: process.env.PRODUCT_SERVICE_URL || 'http://localhost:4002/graphql',
    timeout: 10000,
    requiredFields: ['sku', 'name'],
  });

  registerUpstreamService('orderService', {
    endpoint: process.env.ORDER_SERVICE_URL || 'http://localhost:4003/graphql',
    timeout: 15000,
    headers: {
      'X-Service-Name': 'graphql-gateway',
    },
  });

  console.log('Services registered dynamically');

  // Retrieve service configs
  const userConfig = getUpstreamServiceConfig('userService');
  console.log('User service config:', userConfig);

  return getConfig();
}

/**
 * Example 8: Service Config Override
 *
 * Update service configuration at runtime (e.g., for feature flags).
 */
export function overrideServiceConfig() {
  // Get existing config
  const existingConfig = getUpstreamServiceConfig('userService');

  if (existingConfig) {
    // Override with new settings
    registerUpstreamService('userService', {
      ...existingConfig,
      timeout: 10000, // Increased timeout
      maxDepth: 3, // Stricter depth limit
    });

    console.log('Service config updated');
  }

  return getUpstreamServiceConfig('userService');
}

// ============================================================================
// Environment-Based Configuration
// ============================================================================

/**
 * Example 9: Environment-Specific Configuration
 *
 * Different configurations for development, staging, and production.
 */
export function setupEnvironmentConfig() {
  const env = process.env.NODE_ENV || 'development';

  const configs: Record<string, Parameters<typeof setConfig>[0]> = {
    development: {
      maxDepth: 15, // More relaxed for debugging
      maxFields: 200,
      blockedFields: ['password'],
      upstreamServices: {
        userService: {
          endpoint: 'http://localhost:4001/graphql',
          timeout: 30000, // Long timeout for debugging
        },
      },
    },
    staging: {
      maxDepth: 10,
      maxFields: 100,
      blockedFields: ['password', 'ssn'],
      upstreamServices: {
        userService: {
          endpoint: 'https://staging.users.example.com/graphql',
          timeout: 10000,
        },
      },
    },
    production: {
      maxDepth: 8, // Strict limits
      maxFields: 50,
      blockedFields: ['password', 'ssn', 'creditCard', 'internalNotes'],
      upstreamServices: {
        userService: {
          endpoint: 'https://users.example.com/graphql',
          timeout: 5000,
          requiredFields: ['id'],
          maxDepth: 5,
          maxFields: 30,
        },
      },
    },
  };

  const config = configs[env] || configs.development;
  setConfig(config);

  console.log(`Configuration loaded for environment: ${env}`);
  return getConfig();
}

/**
 * Example 10: Configuration Reset
 *
 * Reset configuration to defaults (useful for testing).
 */
export function resetToDefaults() {
  resetConfig();

  console.log('Configuration reset to defaults');
  return getConfig();
}

// ============================================================================
// Complete Setup Example
// ============================================================================

/**
 * Example 11: Full Application Setup
 *
 * Complete configuration setup for a production application.
 */
export function setupProductionConfig() {
  const env = process.env.NODE_ENV || 'development';

  // Start with environment variables
  const envConfig = getConfigFromEnv();

  // Merge with programmatic config
  setConfig({
    maxDepth: envConfig.maxDepth || 10,
    maxFields: envConfig.maxFields || 100,
    blockedFields: [...(envConfig.blockedFields || []), 'password', 'ssn', 'creditCard'],
    upstreamServices: {
      ...envConfig.upstreamServices,
    },
  });

  // Register additional services from discovery
  const serviceEndpoints = discoverServices();
  for (const [name, endpoint] of Object.entries(serviceEndpoints)) {
    registerUpstreamService(name, {
      endpoint,
      timeout: env === 'production' ? 5000 : 30000,
      requiredFields: ['id'],
    });
  }

  console.log('Production configuration complete');
  return getConfig();
}

// Helper function for service discovery (mock)
function discoverServices(): Record<string, string> {
  // In production, this might call a service registry like Consul or Kubernetes
  return {
    userService: process.env.USER_SERVICE_URL || 'http://localhost:4001/graphql',
    productService: process.env.PRODUCT_SERVICE_URL || 'http://localhost:4002/graphql',
  };
}
