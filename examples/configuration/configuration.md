# Configuration Tutorial

A comprehensive guide to configuring `graphql-query-builder` for different environments and use cases.

---

## Introduction

`graphql-query-builder` is designed to be flexible. Whether you're building a simple API or a complex multi-tenant system, you can configure it to match your needs.

This tutorial covers all configuration options and patterns.

---

## Prerequisites

- Completed the [Basic Usage](../basic-usage/basic-usage.md) tutorial
- Familiarity with environment variables

---

## What You'll Learn

1. Default and programmatic configuration
2. Environment variable configuration
3. Custom configuration providers
4. Service registration patterns
5. Environment-specific setups

---

## Configuration Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Configuration Sources                     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Environment  │  │ Programmatic │  │ Custom Provider  │  │
│  │  Variables   │  │    Config    │  │ (AWS, Vault...)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│          │                 │                   │            │
│          └─────────────────┼───────────────────┘            │
│                            ▼                                │
│                   ┌────────────────┐                        │
│                   │ QueryBuilder   │                        │
│                   │    Config      │                        │
│                   └────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 1: Default Configuration

The simplest setup uses defaults and environment variables:

```typescript
import { initializeConfig, getConfig } from 'graphql-query-builder';

// Initialize with defaults + environment variables
initializeConfig();

const config = getConfig();
console.log('Configuration:', config);
```

### Default Values

| Setting            | Default |
| ------------------ | ------- |
| `maxDepth`         | 10      |
| `maxFields`        | 100     |
| `blockedFields`    | `[]`    |
| `upstreamServices` | `{}`    |

---

## Step 2: Programmatic Configuration

Set configuration directly in code:

```typescript
import { setConfig } from 'graphql-query-builder';

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
```

### Global Configuration Options

| Option             | Type     | Description                 |
| ------------------ | -------- | --------------------------- |
| `maxDepth`         | number   | Maximum query nesting depth |
| `maxFields`        | number   | Maximum fields per query    |
| `blockedFields`    | string[] | Fields to never allow       |
| `upstreamServices` | object   | Service configurations      |

### Service Configuration Options

| Option           | Type     | Description                     |
| ---------------- | -------- | ------------------------------- |
| `endpoint`       | string   | GraphQL endpoint URL            |
| `timeout`        | number   | Request timeout (ms)            |
| `requiredFields` | string[] | Always include these fields     |
| `maxDepth`       | number   | Service-specific depth limit    |
| `maxFields`      | number   | Service-specific field limit    |
| `blockedFields`  | string[] | Service-specific blocked fields |
| `headers`        | object   | Custom request headers          |
| `fieldMappings`  | object   | Field name translations         |
| `cacheConfig`    | object   | Response caching settings       |

---

## Step 3: Environment Variables

The package reads from `GRAPHQL_QUERY_BUILDER_*` environment variables:

### Global Settings

```bash
# Global limits
GRAPHQL_QUERY_BUILDER_MAX_DEPTH=8
GRAPHQL_QUERY_BUILDER_MAX_FIELDS=50
GRAPHQL_QUERY_BUILDER_BLOCKED_FIELDS=password,ssn,secret
```

### Per-Service Settings

```bash
# User service (replace USERSERVICE with uppercase service name)
GRAPHQL_QUERY_BUILDER_USERSERVICE_ENDPOINT=https://users.example.com/graphql
GRAPHQL_QUERY_BUILDER_USERSERVICE_TIMEOUT=5000
GRAPHQL_QUERY_BUILDER_USERSERVICE_MAX_DEPTH=5
GRAPHQL_QUERY_BUILDER_USERSERVICE_MAX_FIELDS=30

# Product service
GRAPHQL_QUERY_BUILDER_PRODUCTSERVICE_ENDPOINT=https://products.example.com/graphql
GRAPHQL_QUERY_BUILDER_PRODUCTSERVICE_TIMEOUT=10000
```

### Loading from Environment

```typescript
import { getConfigFromEnv } from 'graphql-query-builder';

// Automatically reads all GRAPHQL_QUERY_BUILDER_* env vars
const config = getConfigFromEnv();
console.log('Config from environment:', config);
```

---

## Step 4: Custom Configuration Providers

Integrate with external configuration systems:

### Basic Custom Provider

```typescript
import { initializeConfig } from 'graphql-query-builder';

// Example: In-memory configuration
const myConfigStore = new Map([
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
    get: (key) => myConfigStore.get(key),
    has: (key) => myConfigStore.has(key),
  },
});
```

### AWS Parameter Store Integration

```typescript
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { initializeConfig } from 'graphql-query-builder';

const ssmClient = new SSMClient({ region: 'us-east-1' });

async function loadConfigFromAWS() {
  const command = new GetParameterCommand({
    Name: '/myapp/graphql-builder/config',
    WithDecryption: true,
  });

  const response = await ssmClient.send(command);
  const configData = JSON.parse(response.Parameter?.Value || '{}');

  initializeConfig({
    provider: {
      get: (key) => (key === 'graphqlQueryBuilder' ? configData : undefined),
      has: (key) => key === 'graphqlQueryBuilder',
    },
  });
}

// Call at startup
await loadConfigFromAWS();
```

### HashiCorp Vault Integration

```typescript
import Vault from 'node-vault';
import { initializeConfig } from 'graphql-query-builder';

const vault = Vault({
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN,
});

async function loadConfigFromVault() {
  const secret = await vault.read('secret/data/graphql-builder');
  const configData = secret.data.data;

  initializeConfig({
    provider: {
      get: (key) => (key === 'graphqlQueryBuilder' ? configData : undefined),
      has: (key) => key === 'graphqlQueryBuilder',
    },
  });
}
```

### Node-Config Integration

```typescript
import config from 'config';
import { initializeConfig, createNodeConfigProvider } from 'graphql-query-builder';

// Create provider that wraps node-config
initializeConfig({
  provider: createNodeConfigProvider(config),
});

// config/default.json:
// {
//   "graphqlQueryBuilder": {
//     "maxDepth": 10,
//     "upstreamServices": { ... }
//   }
// }
```

---

## Step 5: Dynamic Service Registration

Register services at runtime:

```typescript
import {
  setConfig,
  registerUpstreamService,
  getUpstreamServiceConfig,
} from 'graphql-query-builder';

// Start with base config
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

// Later: retrieve a service config
const userConfig = getUpstreamServiceConfig('userService');
console.log('User service endpoint:', userConfig?.endpoint);
```

### Updating Service Config at Runtime

```typescript
// Get existing config
const existing = getUpstreamServiceConfig('userService');

if (existing) {
  // Update with new settings (e.g., from feature flag)
  registerUpstreamService('userService', {
    ...existing,
    timeout: 10000, // Increased timeout
    maxDepth: 3, // Stricter limit
  });
}
```

---

## Step 6: Environment-Specific Configuration

Different settings for development, staging, and production:

```typescript
import { setConfig } from 'graphql-query-builder';

const env = process.env.NODE_ENV || 'development';

const configs = {
  development: {
    maxDepth: 15, // Relaxed for debugging
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

setConfig(configs[env] || configs.development);
console.log(`Configuration loaded for: ${env}`);
```

---

## Step 7: Resetting Configuration

Reset to defaults (useful for testing):

```typescript
import { resetConfig, getConfig } from 'graphql-query-builder';

// In tests
beforeEach(() => {
  resetConfig();
});

// Check defaults
const config = getConfig();
console.log(config.maxDepth); // 10 (default)
```

---

## Step 8: Complete Production Setup

Here's a full production configuration pattern:

```typescript
import {
  initializeConfig,
  getConfigFromEnv,
  setConfig,
  registerUpstreamService,
} from 'graphql-query-builder';

export async function setupConfiguration() {
  const env = process.env.NODE_ENV || 'development';

  // 1. Start with environment variables
  const envConfig = getConfigFromEnv();

  // 2. Merge with programmatic defaults
  setConfig({
    maxDepth: envConfig.maxDepth || 10,
    maxFields: envConfig.maxFields || 100,
    blockedFields: [...(envConfig.blockedFields || []), 'password', 'ssn', 'creditCard'],
    upstreamServices: {
      ...envConfig.upstreamServices,
    },
  });

  // 3. Register core services
  const services = [
    {
      name: 'userService',
      endpoint: process.env.USER_SERVICE_URL!,
      timeout: 5000,
      requiredFields: ['id'],
      maxDepth: 5,
    },
    {
      name: 'productService',
      endpoint: process.env.PRODUCT_SERVICE_URL!,
      timeout: 10000,
      requiredFields: ['sku'],
    },
    {
      name: 'orderService',
      endpoint: process.env.ORDER_SERVICE_URL!,
      timeout: 15000,
      requiredFields: ['id'],
    },
  ];

  for (const service of services) {
    registerUpstreamService(service.name, {
      endpoint: service.endpoint,
      timeout: service.timeout,
      requiredFields: service.requiredFields,
      maxDepth: service.maxDepth,
    });
  }

  // 4. Environment-specific overrides
  if (env === 'production') {
    // Additional production hardening
    setConfig({
      ...getConfig(),
      maxDepth: 8,
      maxFields: 50,
    });
  }

  console.log(`Configuration initialized for ${env}`);
}
```

---

## Configuration Best Practices

### 1. Configure Once at Startup

```typescript
// ✅ Configure once
setupConfiguration();
startServer();

// ❌ Don't configure per-request
```

### 2. Use Environment Variables for Secrets

```typescript
// ✅ Use env vars for endpoints and keys
registerUpstreamService('api', {
  endpoint: process.env.API_URL,
});

// ❌ Don't hardcode sensitive URLs
```

### 3. Set Strict Limits in Production

```typescript
// ✅ Production limits
maxDepth: 8,
maxFields: 50,

// ❌ Don't use development limits in prod
maxDepth: 100,  // Too permissive!
```

### 4. Always Block Sensitive Fields

```typescript
// ✅ Block at global level
blockedFields: ['password', 'ssn', 'apiKey'],

// ❌ Don't rely on service-level only
```

---

## Summary

| Function                     | Purpose                             |
| ---------------------------- | ----------------------------------- |
| `initializeConfig()`         | Initialize with defaults + env vars |
| `setConfig()`                | Set configuration programmatically  |
| `getConfig()`                | Get current configuration           |
| `resetConfig()`              | Reset to defaults                   |
| `getConfigFromEnv()`         | Read from environment variables     |
| `registerUpstreamService()`  | Register a service dynamically      |
| `getUpstreamServiceConfig()` | Get a service's configuration       |
| `createNodeConfigProvider()` | Wrap node-config package            |

---

## Next Steps

- **[Use Cases](../use-cases/use-cases.md)** - Real-world patterns
- **[Framework Integration](../framework-integration/framework-integration.md)** - Framework-specific setup

---

_Configure with confidence! ⚙️_
