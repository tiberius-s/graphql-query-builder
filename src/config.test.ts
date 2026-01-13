/**
 * graphql-query-builder
 *
 * Unit tests for the config module.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ConfigProvider,
  createNodeConfigProvider,
  getConfig,
  getConfigFromEnv,
  getUpstreamServiceConfig,
  initializeConfig,
  registerUpstreamService,
  resetConfig,
  setConfig,
  validateConfig,
} from './config.js';
import { ConfigurationError } from './errors.js';

describe('Configuration Module', () => {
  beforeEach(() => {
    resetConfig();
    // Clear environment variables
    Object.keys(process.env).forEach((key) => {
      if (key.startsWith('GRAPHQL_QUERY_BUILDER_')) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    resetConfig();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = getConfig();

      expect(config.maxDepth).toBe(10);
      expect(config.maxFields).toBe(100);
      expect(config.blockedFields).toEqual([]);
      expect(config.upstreamServices).toEqual({});
    });

    it('should cache configuration', () => {
      const config1 = getConfig();
      const config2 = getConfig();

      expect(config1).toBe(config2);
    });
  });

  describe('setConfig', () => {
    it('should set configuration values', () => {
      setConfig({
        maxDepth: 5,
        maxFields: 50,
      });

      const config = getConfig();

      expect(config.maxDepth).toBe(5);
      expect(config.maxFields).toBe(50);
    });

    it('should merge with defaults', () => {
      setConfig({
        maxDepth: 5,
      });

      const config = getConfig();

      expect(config.maxDepth).toBe(5);
      expect(config.maxFields).toBe(100); // Default value
    });

    it('should set upstream services', () => {
      setConfig({
        upstreamServices: {
          userService: {
            endpoint: 'https://api.example.com/graphql',
            timeout: 5000,
          },
        },
      });

      const config = getConfig();

      expect(config.upstreamServices.userService).toBeDefined();
      expect(config.upstreamServices.userService.endpoint).toBe('https://api.example.com/graphql');
    });

    it('should validate configuration on set', () => {
      expect(() =>
        setConfig({
          maxDepth: -1,
        }),
      ).toThrow(ConfigurationError);
    });
  });

  describe('resetConfig', () => {
    it('should reset to defaults', () => {
      setConfig({ maxDepth: 5 });
      resetConfig();

      const config = getConfig();

      expect(config.maxDepth).toBe(10);
    });
  });

  describe('getUpstreamServiceConfig', () => {
    it('should return service config if exists', () => {
      setConfig({
        upstreamServices: {
          userService: {
            endpoint: 'https://users.example.com/graphql',
            timeout: 10000,
          },
        },
      });

      const serviceConfig = getUpstreamServiceConfig('userService');

      expect(serviceConfig).toBeDefined();
      expect(serviceConfig?.endpoint).toBe('https://users.example.com/graphql');
      expect(serviceConfig?.timeout).toBe(10000);
    });

    it('should return undefined for non-existent service', () => {
      const serviceConfig = getUpstreamServiceConfig('nonExistent');

      expect(serviceConfig).toBeUndefined();
    });
  });

  describe('registerUpstreamService', () => {
    it('should register a new service', () => {
      registerUpstreamService('newService', {
        endpoint: 'https://new.example.com/graphql',
      });

      const serviceConfig = getUpstreamServiceConfig('newService');

      expect(serviceConfig).toBeDefined();
      expect(serviceConfig?.endpoint).toBe('https://new.example.com/graphql');
    });

    it('should override existing service', () => {
      registerUpstreamService('myService', {
        endpoint: 'https://old.example.com/graphql',
      });

      registerUpstreamService('myService', {
        endpoint: 'https://new.example.com/graphql',
      });

      const serviceConfig = getUpstreamServiceConfig('myService');

      expect(serviceConfig?.endpoint).toBe('https://new.example.com/graphql');
    });

    it('should validate service configuration', () => {
      expect(() =>
        registerUpstreamService('invalid', {
          endpoint: 'not-a-url',
        }),
      ).toThrow(ConfigurationError);
    });
  });

  describe('validateConfig', () => {
    it('should pass valid configuration', () => {
      expect(() =>
        validateConfig({
          maxDepth: 10,
          maxFields: 100,
          blockedFields: ['password'],
        }),
      ).not.toThrow();
    });

    it('should throw for invalid maxDepth', () => {
      expect(() => validateConfig({ maxDepth: 0 })).toThrow(ConfigurationError);
      expect(() => validateConfig({ maxDepth: -1 })).toThrow(ConfigurationError);
    });

    it('should throw for invalid maxFields', () => {
      expect(() => validateConfig({ maxFields: 0 })).toThrow(ConfigurationError);
      expect(() => validateConfig({ maxFields: -1 })).toThrow(ConfigurationError);
    });

    it('should throw for non-array blockedFields', () => {
      expect(() => validateConfig({ blockedFields: 'password' as unknown as string[] })).toThrow(
        ConfigurationError,
      );
    });

    it('should validate upstream service endpoint', () => {
      expect(() =>
        validateConfig({
          upstreamServices: {
            test: { endpoint: '' },
          },
        }),
      ).toThrow(ConfigurationError);
    });

    it('should validate upstream service URL format', () => {
      expect(() =>
        validateConfig({
          upstreamServices: {
            test: { endpoint: 'not-a-valid-url' },
          },
        }),
      ).toThrow(ConfigurationError);
    });

    it('should validate upstream service timeout', () => {
      expect(() =>
        validateConfig({
          upstreamServices: {
            test: { endpoint: 'https://api.example.com', timeout: -1 },
          },
        }),
      ).toThrow(ConfigurationError);
    });

    it('should validate upstream service maxDepth', () => {
      expect(() =>
        validateConfig({
          upstreamServices: {
            test: { endpoint: 'https://api.example.com', maxDepth: -1 },
          },
        }),
      ).toThrow(ConfigurationError);
    });

    it('should validate upstream service maxFields', () => {
      expect(() =>
        validateConfig({
          upstreamServices: {
            test: { endpoint: 'https://api.example.com', maxFields: 0 },
          },
        }),
      ).toThrow(ConfigurationError);
    });

    it('should validate upstream service endpoint type', () => {
      expect(() =>
        validateConfig({
          upstreamServices: {
            test: { endpoint: 123 as unknown as string },
          },
        }),
      ).toThrow(ConfigurationError);
    });
  });

  describe('getConfigFromEnv', () => {
    it('should parse MAX_DEPTH from environment', () => {
      process.env.GRAPHQL_QUERY_BUILDER_MAX_DEPTH = '5';

      const config = getConfigFromEnv();

      expect(config.maxDepth).toBe(5);
    });

    it('should parse MAX_FIELDS from environment', () => {
      process.env.GRAPHQL_QUERY_BUILDER_MAX_FIELDS = '50';

      const config = getConfigFromEnv();

      expect(config.maxFields).toBe(50);
    });

    it('should parse BLOCKED_FIELDS from environment', () => {
      process.env.GRAPHQL_QUERY_BUILDER_BLOCKED_FIELDS = 'password, ssn, secret';

      const config = getConfigFromEnv();

      expect(config.blockedFields).toEqual(['password', 'ssn', 'secret']);
    });

    it('should parse service configuration from environment', () => {
      process.env.GRAPHQL_QUERY_BUILDER_USERSERVICE_ENDPOINT = 'https://users.example.com/graphql';
      process.env.GRAPHQL_QUERY_BUILDER_USERSERVICE_TIMEOUT = '5000';

      const config = getConfigFromEnv();

      expect(config.upstreamServices?.userservice).toBeDefined();
      expect(config.upstreamServices?.userservice.endpoint).toBe(
        'https://users.example.com/graphql',
      );
      expect(config.upstreamServices?.userservice.timeout).toBe(5000);
    });

    it('should parse service MAX_DEPTH from environment', () => {
      process.env.GRAPHQL_QUERY_BUILDER_MYSERVICE_ENDPOINT = 'https://api.example.com/graphql';
      process.env.GRAPHQL_QUERY_BUILDER_MYSERVICE_MAX_DEPTH = '5';

      const config = getConfigFromEnv();

      expect(config.upstreamServices?.myservice.maxDepth).toBe(5);
    });

    it('should parse service MAX_FIELDS from environment', () => {
      process.env.GRAPHQL_QUERY_BUILDER_MYSERVICE_ENDPOINT = 'https://api.example.com/graphql';
      process.env.GRAPHQL_QUERY_BUILDER_MYSERVICE_MAX_FIELDS = '50';

      const config = getConfigFromEnv();

      expect(config.upstreamServices?.myservice.maxFields).toBe(50);
    });

    it('should return empty config when no env vars set', () => {
      const config = getConfigFromEnv();

      expect(config.maxDepth).toBeUndefined();
      expect(config.maxFields).toBeUndefined();
      expect(config.upstreamServices).toBeUndefined();
    });

    it('should skip services without endpoint', () => {
      process.env.GRAPHQL_QUERY_BUILDER_NOENDPOINT_TIMEOUT = '5000';

      const config = getConfigFromEnv();

      expect(config.upstreamServices).toBeUndefined();
    });
  });

  describe('initializeConfig', () => {
    it('should initialize with defaults', async () => {
      await initializeConfig();
      const config = getConfig();

      expect(config.maxDepth).toBe(10);
      expect(config.maxFields).toBe(100);
    });

    it('should apply overrides', async () => {
      await initializeConfig({
        overrides: { maxDepth: 5, maxFields: 50 },
      });
      const config = getConfig();

      expect(config.maxDepth).toBe(5);
      expect(config.maxFields).toBe(50);
    });

    it('should apply environment variables', async () => {
      process.env.GRAPHQL_QUERY_BUILDER_MAX_DEPTH = '3';

      await initializeConfig();
      const config = getConfig();

      expect(config.maxDepth).toBe(3);
    });

    it('should prioritize overrides over env vars', async () => {
      process.env.GRAPHQL_QUERY_BUILDER_MAX_DEPTH = '3';

      await initializeConfig({
        overrides: { maxDepth: 7 },
      });
      const config = getConfig();

      expect(config.maxDepth).toBe(7);
    });

    it('should use custom provider', async () => {
      const mockProvider: ConfigProvider = {
        get: vi.fn().mockReturnValue({ maxDepth: 15 }),
        has: vi.fn().mockReturnValue(true),
      };

      await initializeConfig({
        provider: mockProvider,
      });
      const config = getConfig();

      expect(config.maxDepth).toBe(15);
      expect(mockProvider.has).toHaveBeenCalledWith('graphqlQueryBuilder');
    });

    it('should use custom config key with provider', async () => {
      const mockProvider: ConfigProvider = {
        get: vi.fn().mockReturnValue({ maxDepth: 20 }),
        has: vi.fn().mockReturnValue(true),
      };

      await initializeConfig({
        provider: mockProvider,
        configKey: 'customKey',
      });

      expect(mockProvider.has).toHaveBeenCalledWith('customKey');
    });

    it('should handle provider returning undefined', async () => {
      const mockProvider: ConfigProvider = {
        get: vi.fn().mockReturnValue(undefined),
        has: vi.fn().mockReturnValue(true),
      };

      await initializeConfig({
        provider: mockProvider,
      });
      const config = getConfig();

      expect(config.maxDepth).toBe(10); // Default
    });

    it('should handle provider errors gracefully', async () => {
      const mockProvider: ConfigProvider = {
        get: vi.fn().mockImplementation(() => {
          throw new Error('Provider error');
        }),
        has: vi.fn().mockReturnValue(true),
      };

      await initializeConfig({
        provider: mockProvider,
      });
      const config = getConfig();

      expect(config.maxDepth).toBe(10); // Default
    });

    it('should skip provider when has returns false', async () => {
      const mockProvider: ConfigProvider = {
        get: vi.fn().mockReturnValue({ maxDepth: 15 }),
        has: vi.fn().mockReturnValue(false),
      };

      await initializeConfig({
        provider: mockProvider,
      });

      expect(mockProvider.get).not.toHaveBeenCalled();
    });
  });

  describe('createNodeConfigProvider', () => {
    it('should create a valid config provider', () => {
      const mockNodeConfig = {
        has: vi.fn().mockReturnValue(true),
        get: vi.fn().mockReturnValue({ maxDepth: 25 }),
      };

      const provider = createNodeConfigProvider(mockNodeConfig);

      expect(provider.has('testKey')).toBe(true);
      expect(provider.get('testKey')).toEqual({ maxDepth: 25 });
    });

    it('should return undefined when key does not exist', () => {
      const mockNodeConfig = {
        has: vi.fn().mockReturnValue(false),
        get: vi.fn().mockReturnValue(undefined),
      };

      const provider = createNodeConfigProvider(mockNodeConfig);

      expect(provider.get('nonExistent')).toBeUndefined();
    });

    it('should handle errors in has gracefully', () => {
      const mockNodeConfig = {
        has: vi.fn().mockImplementation(() => {
          throw new Error('Has error');
        }),
        get: vi.fn(),
      };

      const provider = createNodeConfigProvider(mockNodeConfig);

      expect(provider.has('testKey')).toBe(false);
    });

    it('should handle errors in get gracefully', () => {
      const mockNodeConfig = {
        has: vi.fn().mockReturnValue(true),
        get: vi.fn().mockImplementation(() => {
          throw new Error('Get error');
        }),
      };

      const provider = createNodeConfigProvider(mockNodeConfig);

      expect(provider.get('testKey')).toBeUndefined();
    });
  });

  describe('ConfigProvider integration', () => {
    it('should work with environment-based provider', async () => {
      const envProvider: ConfigProvider = {
        get<T>(key: string): T | undefined {
          const envKey = key.toUpperCase();
          const value = process.env[envKey];
          if (!value) return undefined;
          try {
            return JSON.parse(value) as T;
          } catch {
            return undefined;
          }
        },
        has(key: string): boolean {
          const envKey = key.toUpperCase();
          return envKey in process.env;
        },
      };

      process.env.MYCONFIGKEY = JSON.stringify({ maxDepth: 8 });

      await initializeConfig({
        provider: envProvider,
        configKey: 'myConfigKey',
      });
      const config = getConfig();

      expect(config.maxDepth).toBe(8);

      delete process.env.MYCONFIGKEY;
    });

    it('should work with Map-based provider', async () => {
      const configMap = new Map<string, unknown>();
      configMap.set('graphqlQueryBuilder', { maxDepth: 12, maxFields: 60 });

      const mapProvider: ConfigProvider = {
        get<T>(key: string): T | undefined {
          return configMap.get(key) as T | undefined;
        },
        has(key: string): boolean {
          return configMap.has(key);
        },
      };

      await initializeConfig({
        provider: mapProvider,
      });
      const config = getConfig();

      expect(config.maxDepth).toBe(12);
      expect(config.maxFields).toBe(60);
    });
  });
});
