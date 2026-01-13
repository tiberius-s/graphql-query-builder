/**
 * graphql-query-builder
 *
 * Unit tests for the factories module.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetConfig, setConfig } from './config.js';
import type { GraphQLDataSourceOptions } from './datasource.js';
import type { FieldSelection } from './extractor.js';
import {
  ConfigBuilder,
  DataSourceFactory,
  getQueryBuilderFactory,
  QueryBuilderFactory,
  resetQueryBuilderFactory,
} from './factories.js';

describe('Factories Module', () => {
  beforeEach(() => {
    resetConfig();
    resetQueryBuilderFactory();
    setConfig({
      maxDepth: 10,
      maxFields: 100,
      upstreamServices: {
        userService: {
          endpoint: 'https://users.example.com/graphql',
          timeout: 5000,
          maxDepth: 5,
          requiredFields: ['id'],
          blockedFields: ['password'],
          fieldMappings: { email: 'emailAddress' },
        },
      },
    });
  });

  describe('QueryBuilderFactory', () => {
    it('should create a factory instance', () => {
      const factory = new QueryBuilderFactory();

      expect(factory).toBeDefined();
    });

    it('should create a QueryBuilder with default options', () => {
      const factory = new QueryBuilderFactory();
      const builder = factory.create();

      expect(builder).toBeDefined();
      expect(builder.buildFromFields).toBeInstanceOf(Function);
      expect(builder.buildFromPaths).toBeInstanceOf(Function);
      expect(builder.buildMutation).toBeInstanceOf(Function);
      expect(builder.validate).toBeInstanceOf(Function);
    });

    it('should create QueryBuilder for specific service', () => {
      const factory = new QueryBuilderFactory();
      const builder = factory.forService('userService');

      expect(builder).toBeDefined();
    });

    describe('QueryBuilder.buildFromFields', () => {
      it('should build a query from field selections', () => {
        const factory = new QueryBuilderFactory();
        const builder = factory.create();

        const fields: FieldSelection[] = [
          { name: 'id', path: ['id'], depth: 1 },
          { name: 'name', path: ['name'], depth: 1 },
        ];

        const result = builder.buildFromFields('user', fields, { id: '123' });

        expect(result.query).toContain('user');
        expect(result.query).toContain('id');
        expect(result.query).toContain('name');
        expect(result.variables).toEqual({ id: '123' });
      });
    });

    describe('QueryBuilder.buildFromPaths', () => {
      it('should build a query from field paths', () => {
        const factory = new QueryBuilderFactory();
        const builder = factory.create();

        const result = builder.buildFromPaths('user', ['id', 'profile.name']);

        expect(result.query).toContain('user');
        expect(result.query).toContain('id');
        expect(result.query).toContain('profile');
        expect(result.query).toContain('name');
      });
    });

    describe('QueryBuilder.buildMutation', () => {
      it('should build a mutation', () => {
        const factory = new QueryBuilderFactory();
        const builder = factory.create();

        const returnFields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

        const result = builder.buildMutation('createUser', { name: 'John' }, returnFields);

        expect(result.query).toContain('mutation');
        expect(result.query).toContain('createUser');
      });
    });

    describe('QueryBuilder.validate', () => {
      it('should validate field selections', () => {
        const factory = new QueryBuilderFactory();
        const builder = factory.create();

        const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

        const result = builder.validate(fields);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  describe('DataSourceFactory', () => {
    class MockDataSource {
      constructor(
        public readonly serviceName: string,
        public readonly options?: GraphQLDataSourceOptions,
      ) {}
    }

    it('should create a factory instance', () => {
      const factory = new DataSourceFactory();

      expect(factory).toBeDefined();
    });

    it('should register and create data source types', () => {
      const factory = new DataSourceFactory<MockDataSource>();

      factory.registerType('mock', MockDataSource);

      expect(factory.hasType('mock')).toBe(true);
      expect(factory.getRegisteredTypes()).toContain('mock');
    });

    it('should create data source by type', () => {
      const factory = new DataSourceFactory<MockDataSource>();
      factory.registerType('mock', MockDataSource);

      const dataSource = factory.createByType('mock', 'testService');

      expect(dataSource).toBeInstanceOf(MockDataSource);
      expect(dataSource.serviceName).toBe('testService');
    });

    it('should merge options when creating data source', () => {
      const factory = new DataSourceFactory<MockDataSource>({
        defaultOptions: { fetch: vi.fn() as unknown as typeof fetch },
      });

      factory.registerType('mock', MockDataSource, {
        serviceConfig: { timeout: 5000 },
      });

      const dataSource = factory.createByType('mock', 'testService', {
        serviceConfig: { maxDepth: 5 },
      });

      expect(dataSource.options).toBeDefined();
      expect(dataSource.options?.serviceConfig?.maxDepth).toBe(5);
    });

    it('should throw for unknown type', () => {
      const factory = new DataSourceFactory();

      expect(() => factory.createByType('unknown', 'service')).toThrow('Unknown data source type');
    });

    it('should list registered types', () => {
      const factory = new DataSourceFactory<MockDataSource>();

      factory.registerType('type1', MockDataSource);
      factory.registerType('type2', MockDataSource);

      const types = factory.getRegisteredTypes();

      expect(types).toContain('type1');
      expect(types).toContain('type2');
      expect(types).toHaveLength(2);
    });
  });

  describe('ConfigBuilder', () => {
    it('should build configuration step by step', () => {
      const config = new ConfigBuilder().setMaxDepth(5).setMaxFields(50).build();

      expect(config.maxDepth).toBe(5);
      expect(config.maxFields).toBe(50);
    });

    it('should add blocked fields', () => {
      const config = new ConfigBuilder().addBlockedField('password').addBlockedField('ssn').build();

      expect(config.blockedFields).toContain('password');
      expect(config.blockedFields).toContain('ssn');
    });

    it('should set blocked fields list', () => {
      const config = new ConfigBuilder().setBlockedFields(['secret1', 'secret2']).build();

      expect(config.blockedFields).toEqual(['secret1', 'secret2']);
    });

    it('should set debug mode', () => {
      const config = new ConfigBuilder().setDebug(true).build();

      expect(config.debug).toBe(true);
    });

    it('should set strict mode', () => {
      const config = new ConfigBuilder().setStrictMode(true).build();

      expect(config.strictMode).toBe(true);
    });

    it('should add upstream services', () => {
      const config = new ConfigBuilder()
        .addUpstreamService('userService', {
          endpoint: 'https://users.example.com/graphql',
          timeout: 5000,
        })
        .addUpstreamService('productService', {
          endpoint: 'https://products.example.com/graphql',
        })
        .build();

      expect(config.upstreamServices.userService).toBeDefined();
      expect(config.upstreamServices.userService.timeout).toBe(5000);
      expect(config.upstreamServices.productService).toBeDefined();
    });

    it('should reset builder state', () => {
      const builder = new ConfigBuilder().setMaxDepth(5).setMaxFields(50);

      builder.reset();

      const config = builder.build();

      expect(config.maxDepth).toBeUndefined();
      expect(config.maxFields).toBeUndefined();
    });

    it('should chain all methods fluently', () => {
      const config = new ConfigBuilder()
        .setMaxDepth(5)
        .setMaxFields(50)
        .addBlockedField('password')
        .setDebug(true)
        .setStrictMode(true)
        .addUpstreamService('api', { endpoint: 'https://api.example.com/graphql' })
        .build();

      expect(config.maxDepth).toBe(5);
      expect(config.maxFields).toBe(50);
      expect(config.blockedFields).toContain('password');
      expect(config.debug).toBe(true);
      expect(config.strictMode).toBe(true);
      expect(config.upstreamServices.api).toBeDefined();
    });
  });

  describe('getQueryBuilderFactory', () => {
    it('should return singleton instance', () => {
      const factory1 = getQueryBuilderFactory();
      const factory2 = getQueryBuilderFactory();

      expect(factory1).toBe(factory2);
    });

    it('should create new instance after reset', () => {
      const factory1 = getQueryBuilderFactory();

      resetQueryBuilderFactory();

      const factory2 = getQueryBuilderFactory();

      expect(factory1).not.toBe(factory2);
    });
  });
});
