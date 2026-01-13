/**
 * graphql-query-builder
 *
 * Unit tests for the datasource module.
 * Tests include mocking of global fetch for HTTP request testing.
 */

import type { GraphQLResolveInfo } from 'graphql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetConfig, setConfig } from './config.js';
import {
  BearerAuthDataSource,
  createDataSourceFactory,
  GraphQLDataSource,
  HeaderAuthDataSource,
  SimpleGraphQLDataSource,
} from './datasource.js';
import { ConfigurationError, UpstreamServiceError } from './errors.js';

// Mock the extractor to return predictable field selections
vi.mock('./extractor.js', () => ({
  extractFieldsFromInfo: vi.fn(() => ({
    fields: [
      { name: 'id', path: ['id'], depth: 1 },
      { name: 'email', path: ['email'], depth: 1 },
    ],
    rootType: 'Query',
    fieldCount: 2,
    depth: 1,
  })),
}));

// Setup test configuration
function setupTestConfig() {
  setConfig({
    maxDepth: 10,
    maxFields: 100,
    upstreamServices: {
      testService: {
        endpoint: 'https://test.example.com/graphql',
        timeout: 5000,
        requiredFields: ['id'],
        fieldMappings: { email: 'emailAddress' },
        cacheConfig: { enabled: true, ttl: 60000 },
      },
      noCache: {
        endpoint: 'https://nocache.example.com/graphql',
      },
      withBlocked: {
        endpoint: 'https://blocked.example.com/graphql',
        blockedFields: ['password', 'ssn'],
      },
      shortTimeout: {
        endpoint: 'https://timeout.example.com/graphql',
        timeout: 100,
      },
    },
  });
}

// Create mock GraphQL resolve info
function createMockInfo(): GraphQLResolveInfo {
  return {
    fieldNodes: [],
    parentType: { name: 'Query' } as any,
    fragments: {},
    fieldName: 'user',
    returnType: {} as any,
    path: { key: 'user', prev: undefined, typename: 'Query' },
    schema: {} as any,
    rootValue: null,
    operation: {} as any,
    variableValues: {},
  } as GraphQLResolveInfo;
}

// Create mock fetch response
function createMockFetchResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: vi.fn().mockResolvedValue(data),
  };
}

// Create a concrete implementation for testing protected methods
class TestDataSource extends GraphQLDataSource {
  public getAuthHeadersPublic(): Record<string, string> {
    return this.getAuthHeaders();
  }

  public getCacheKeyPublic(query: any): string {
    return this.getCacheKey(query);
  }

  public getFromCachePublic(key: string): unknown {
    return this.getFromCache(key);
  }

  public setInCachePublic(key: string, data: unknown): void {
    this.setInCache(key, data);
  }

  public validateQuerySecurityPublic(query: any, context: any): void {
    this.validateQuerySecurity(query, context);
  }

  public createContextPublic(info: GraphQLResolveInfo, opName: string) {
    return this.createContext(info, opName);
  }
}

describe('DataSource Module', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    resetConfig();
    setupTestConfig();
    vi.clearAllMocks();

    // Save original fetch
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    resetConfig();
    // Restore original fetch
    globalThis.fetch = originalFetch;
  });

  describe('GraphQLDataSource', () => {
    it('should throw ConfigurationError for unknown service', () => {
      expect(() => new TestDataSource('unknownService')).toThrow(ConfigurationError);
    });

    it('should create instance with valid service', () => {
      const dataSource = new TestDataSource('testService');

      expect(dataSource).toBeDefined();
    });

    it('should merge options with service config', () => {
      const dataSource = new TestDataSource('testService', {
        serviceConfig: { timeout: 10000 },
      });

      expect(dataSource).toBeDefined();
    });
  });

  describe('executeQuery', () => {
    it('should execute a successful query', async () => {
      const mockResponse = createMockFetchResponse({
        data: { user: { id: '123', email: 'test@example.com' } },
      });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const dataSource = new SimpleGraphQLDataSource('testService');
      const info = createMockInfo();

      const result = await dataSource.executeQuery('user', { id: '123' }, info);

      expect(result).toEqual({ user: { id: '123', email: 'test@example.com' } });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://test.example.com/graphql',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should use cached result when available', async () => {
      const mockResponse = createMockFetchResponse({ data: { user: { id: '123' } } });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const dataSource = new SimpleGraphQLDataSource('testService');
      const info = createMockInfo();

      // First call
      await dataSource.executeQuery('user', { id: '123' }, info);
      // Second call should use cache
      await dataSource.executeQuery('user', { id: '123' }, info);

      // Fetch should only be called once
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('should skip cache when skipCache option is true', async () => {
      const mockResponse = createMockFetchResponse({ data: { user: { id: '123' } } });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const dataSource = new SimpleGraphQLDataSource('testService');
      const info = createMockInfo();

      await dataSource.executeQuery('user', { id: '123' }, info);
      await dataSource.executeQuery('user', { id: '123' }, info, { skipCache: true });

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw UpstreamServiceError for HTTP errors', async () => {
      const mockResponse = createMockFetchResponse({}, false, 500);
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const dataSource = new SimpleGraphQLDataSource('testService');
      const info = createMockInfo();

      await expect(dataSource.executeQuery('user', { id: '123' }, info)).rejects.toThrow(
        UpstreamServiceError,
      );
    });

    it('should throw UpstreamServiceError for GraphQL errors', async () => {
      const mockResponse = createMockFetchResponse({
        errors: [{ message: 'User not found' }],
      });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const dataSource = new SimpleGraphQLDataSource('testService');
      const info = createMockInfo();

      await expect(dataSource.executeQuery('user', { id: '123' }, info)).rejects.toThrow(
        'GraphQL errors: User not found',
      );
    });

    it('should handle timeout errors', async () => {
      // Mock fetch to delay longer than timeout
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      const dataSource = new SimpleGraphQLDataSource('shortTimeout');
      const info = createMockInfo();

      await expect(dataSource.executeQuery('user', { id: '123' }, info)).rejects.toThrow(
        /Request timeout/,
      );
    });

    it('should handle network errors', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

      const dataSource = new SimpleGraphQLDataSource('testService');
      const info = createMockInfo();

      await expect(dataSource.executeQuery('user', { id: '123' }, info)).rejects.toThrow(
        'Network failure',
      );
    });

    it('should handle unknown errors', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue('Unknown error');

      const dataSource = new SimpleGraphQLDataSource('testService');
      const info = createMockInfo();

      await expect(dataSource.executeQuery('user', { id: '123' }, info)).rejects.toThrow(
        'Unknown error occurred',
      );
    });
  });

  describe('executeMutation', () => {
    it('should execute a successful mutation', async () => {
      const mockResponse = createMockFetchResponse({
        data: { createUser: { id: '123', email: 'new@example.com' } },
      });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const dataSource = new SimpleGraphQLDataSource('testService');

      const result = await dataSource.executeMutation('createUser', { email: 'new@example.com' }, [
        'id',
        'email',
      ]);

      expect(result).toEqual({ createUser: { id: '123', email: 'new@example.com' } });
    });

    it('should handle nested return field paths', async () => {
      const mockResponse = createMockFetchResponse({
        data: { createUser: { id: '123', profile: { avatar: 'url' } } },
      });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const dataSource = new SimpleGraphQLDataSource('testService');

      const result = await dataSource.executeMutation('createUser', { email: 'new@example.com' }, [
        'id',
        'profile.avatar',
      ]);

      expect(result).toBeDefined();
    });
  });

  describe('executeSimpleQuery', () => {
    it('should execute a query from field paths', async () => {
      const mockResponse = createMockFetchResponse({
        data: { user: { id: '123', email: 'test@example.com' } },
      });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const dataSource = new SimpleGraphQLDataSource('testService');

      const result = await dataSource.executeSimpleQuery('user', { id: '123' }, ['id', 'email']);

      expect(result).toEqual({ user: { id: '123', email: 'test@example.com' } });
    });

    it('should use cache for simple queries', async () => {
      const mockResponse = createMockFetchResponse({ data: { user: { id: '123' } } });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const dataSource = new SimpleGraphQLDataSource('testService');

      await dataSource.executeSimpleQuery('user', { id: '123' }, ['id']);
      await dataSource.executeSimpleQuery('user', { id: '123' }, ['id']);

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('should skip cache when requested', async () => {
      const mockResponse = createMockFetchResponse({ data: { user: { id: '123' } } });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const dataSource = new SimpleGraphQLDataSource('testService');

      await dataSource.executeSimpleQuery('user', { id: '123' }, ['id']);
      await dataSource.executeSimpleQuery('user', { id: '123' }, ['id'], { skipCache: true });

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('SimpleGraphQLDataSource', () => {
    it('should create instance with service name', () => {
      const dataSource = new SimpleGraphQLDataSource('testService');

      expect(dataSource).toBeDefined();
    });

    it('should create instance with options', () => {
      const dataSource = new SimpleGraphQLDataSource('testService', {
        serviceConfig: { timeout: 3000 },
      });

      expect(dataSource).toBeDefined();
    });
  });

  describe('BearerAuthDataSource', () => {
    it('should create instance with token', () => {
      const dataSource = new BearerAuthDataSource('testService', 'my-token');

      expect(dataSource).toBeDefined();
    });

    it('should include Authorization header', () => {
      class TestBearerAuth extends BearerAuthDataSource {
        getAuthHeadersPublic() {
          return this.getAuthHeaders();
        }
      }

      const dataSource = new TestBearerAuth('testService', 'secret-token');
      const headers = dataSource.getAuthHeadersPublic();

      expect(headers.Authorization).toBe('Bearer secret-token');
    });

    it('should send Authorization header in requests', async () => {
      const mockResponse = createMockFetchResponse({ data: { user: { id: '123' } } });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const dataSource = new BearerAuthDataSource('testService', 'secret-token');
      const info = createMockInfo();

      await dataSource.executeQuery('user', { id: '123' }, info);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer secret-token',
          }),
        }),
      );
    });
  });

  describe('HeaderAuthDataSource', () => {
    it('should create instance with custom headers', () => {
      const dataSource = new HeaderAuthDataSource('testService', {
        'X-API-Key': 'my-api-key',
      });

      expect(dataSource).toBeDefined();
    });

    it('should include custom auth headers', () => {
      class TestHeaderAuth extends HeaderAuthDataSource {
        getAuthHeadersPublic() {
          return this.getAuthHeaders();
        }
      }

      const authHeaders = {
        'X-API-Key': 'api-key-123',
        'X-Tenant-Id': 'tenant-456',
      };

      const dataSource = new TestHeaderAuth('testService', authHeaders);
      const headers = dataSource.getAuthHeadersPublic();

      expect(headers['X-API-Key']).toBe('api-key-123');
      expect(headers['X-Tenant-Id']).toBe('tenant-456');
    });

    it('should send custom headers in requests', async () => {
      const mockResponse = createMockFetchResponse({ data: { user: { id: '123' } } });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const dataSource = new HeaderAuthDataSource('testService', {
        'X-API-Key': 'api-key-123',
      });
      const info = createMockInfo();

      await dataSource.executeQuery('user', { id: '123' }, info);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'api-key-123',
          }),
        }),
      );
    });
  });

  describe('createDataSourceFactory', () => {
    it('should create a factory function', () => {
      const factory = createDataSourceFactory(SimpleGraphQLDataSource, 'testService');

      expect(factory).toBeInstanceOf(Function);
    });

    it('should create new instances each time', () => {
      const factory = createDataSourceFactory(SimpleGraphQLDataSource, 'testService');

      const instance1 = factory();
      const instance2 = factory();

      expect(instance1).not.toBe(instance2);
      expect(instance1).toBeInstanceOf(SimpleGraphQLDataSource);
      expect(instance2).toBeInstanceOf(SimpleGraphQLDataSource);
    });
  });

  describe('Cache operations', () => {
    it('should cache and retrieve data', () => {
      const dataSource = new TestDataSource('testService');
      const testKey = 'test-cache-key';
      const testData = { id: '123', name: 'Test' };

      dataSource.setInCachePublic(testKey, testData);
      const cached = dataSource.getFromCachePublic(testKey);

      expect(cached).toEqual(testData);
    });

    it('should return undefined for non-existent cache key', () => {
      const dataSource = new TestDataSource('testService');

      const cached = dataSource.getFromCachePublic('non-existent-key');

      expect(cached).toBeUndefined();
    });

    it('should expire cached data after TTL', async () => {
      // Use a short TTL for testing
      setConfig({
        upstreamServices: {
          shortTTL: {
            endpoint: 'https://test.example.com/graphql',
            cacheConfig: { enabled: true, ttl: 50 },
          },
        },
      });

      const dataSource = new TestDataSource('shortTTL');
      const testKey = 'expiring-key';

      dataSource.setInCachePublic(testKey, { data: 'test' });

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      const cached = dataSource.getFromCachePublic(testKey);

      expect(cached).toBeUndefined();
    });

    it('should clear cache', () => {
      const dataSource = new TestDataSource('testService');
      const testKey = 'test-key';

      dataSource.setInCachePublic(testKey, { data: 'test' });
      dataSource.clearCache();
      const cached = dataSource.getFromCachePublic(testKey);

      expect(cached).toBeUndefined();
    });

    it('should generate cache key correctly', () => {
      const dataSource = new TestDataSource('testService');
      const builtQuery = {
        query: 'query { user { id } }',
        variables: { id: '123' },
        operationName: 'GetUser',
        metadata: { fieldCount: 1, depth: 1, hasVariables: true },
      };

      const cacheKey = dataSource.getCacheKeyPublic(builtQuery);

      expect(cacheKey).toContain('testService');
      expect(cacheKey).toContain('GetUser');
    });
  });

  describe('Security validation', () => {
    it('should validate queries against security rules', () => {
      const dataSource = new TestDataSource('testService');
      const context = { serviceName: 'testService', operationName: 'test', startTime: Date.now() };
      const validQuery = {
        query: 'query { user { id name } }',
        variables: {},
        operationName: 'GetUser',
        metadata: { fieldCount: 2, depth: 1, hasVariables: false },
      };

      // Should not throw
      expect(() => dataSource.validateQuerySecurityPublic(validQuery, context)).not.toThrow();
    });

    it('should reject queries exceeding max depth', () => {
      const dataSource = new TestDataSource('testService');
      const context = { serviceName: 'testService', operationName: 'test', startTime: Date.now() };
      const deepQuery = {
        query: 'query { user { profile { settings { deep { field } } } } }',
        variables: {},
        operationName: 'GetUser',
        metadata: { fieldCount: 5, depth: 15, hasVariables: false },
      };

      expect(() => dataSource.validateQuerySecurityPublic(deepQuery, context)).toThrow(
        UpstreamServiceError,
      );
    });
  });

  describe('Context creation', () => {
    it('should create context with service name and operation', () => {
      const dataSource = new TestDataSource('testService');
      const info = createMockInfo();

      const context = dataSource.createContextPublic(info, 'GetUser');

      expect(context.serviceName).toBe('testService');
      expect(context.operationName).toBe('GetUser');
      expect(context.startTime).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Auth headers', () => {
    it('should return empty auth headers by default', () => {
      const dataSource = new TestDataSource('testService');

      const headers = dataSource.getAuthHeadersPublic();

      expect(headers).toEqual({});
    });
  });

  describe('Service without cache', () => {
    it('should work correctly without cache config', async () => {
      const mockResponse = createMockFetchResponse({ data: { user: { id: '123' } } });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const dataSource = new SimpleGraphQLDataSource('noCache');
      const info = createMockInfo();

      await dataSource.executeQuery('user', { id: '123' }, info);
      await dataSource.executeQuery('user', { id: '123' }, info);

      // Without cache, fetch should be called twice
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
