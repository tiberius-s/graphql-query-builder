/**
 * Unit tests for the builder module.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildQuery,
  buildQueryCached,
  buildQueryFromPaths,
  buildQueryFromPathsCached,
} from './builder.js';
import { clearCache, initializeCache } from './cache.js';
import { resetConfig } from './config.js';
import type { FieldSelection } from './extractor.js';

describe('Builder Module', () => {
  beforeEach(() => {
    resetConfig();
    initializeCache({ maxSize: 100 });
  });

  afterEach(() => {
    resetConfig();
    clearCache();
  });

  describe('buildQuery', () => {
    it('should build a basic query', () => {
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'email', path: ['email'], depth: 1 },
      ];

      const result = buildQuery('user', fields);

      expect(result.query).toContain('query');
      expect(result.query).toContain('user');
      expect(result.query).toContain('id');
      expect(result.query).toContain('email');
      expect(result.operationName).toBe('UpstreamQuery');
    });

    it('should use custom operation name', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];
      const result = buildQuery('user', fields, { operationName: 'GetUser' });

      expect(result.query).toContain('query GetUser');
      expect(result.operationName).toBe('GetUser');
    });

    it('should include variables in query', () => {
      const fields: FieldSelection[] = [
        {
          name: 'id',
          path: ['id'],
          depth: 1,
          arguments: { id: { __variable: 'userId' } },
        },
      ];

      const result = buildQuery('user', fields, {
        variables: { userId: '123' },
      });

      expect(result.query).toContain('$userId');
      expect(result.variables).toEqual({ userId: '123' });
    });

    it('should handle nested field selections', () => {
      const fields: FieldSelection[] = [
        {
          name: 'profile',
          path: ['profile'],
          depth: 1,
          selections: [
            { name: 'bio', path: ['profile', 'bio'], depth: 2 },
            { name: 'avatar', path: ['profile', 'avatar'], depth: 2 },
          ],
        },
      ];

      const result = buildQuery('user', fields);

      expect(result.query).toContain('profile');
      expect(result.query).toContain('bio');
      expect(result.query).toContain('avatar');
      expect(result.metadata.depth).toBe(2);
    });

    it('should apply field mappings', () => {
      const fields: FieldSelection[] = [{ name: 'email', path: ['email'], depth: 1 }];

      const result = buildQuery('user', fields, {
        fieldMappings: { email: 'emailAddress' },
      });

      expect(result.query).toContain('emailAddress');
    });

    it('should include required fields', () => {
      const fields: FieldSelection[] = [{ name: 'email', path: ['email'], depth: 1 }];

      const result = buildQuery('user', fields, {
        requiredFields: ['id'],
      });

      expect(result.query).toContain('id');
      expect(result.query).toContain('email');
    });

    it('should calculate correct metadata', () => {
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'email', path: ['email'], depth: 1 },
        {
          name: 'profile',
          path: ['profile'],
          depth: 1,
          selections: [{ name: 'bio', path: ['profile', 'bio'], depth: 2 }],
        },
      ];

      const result = buildQuery('user', fields);

      expect(result.metadata.fieldCount).toBe(4);
      expect(result.metadata.depth).toBe(2);
    });
  });

  describe('buildQueryCached', () => {
    it('should cache identical queries', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      const result1 = buildQueryCached('user', fields);
      const result2 = buildQueryCached('user', fields);

      expect(result1.query).toBe(result2.query);
    });

    it('should return fresh variables with cached query', () => {
      const fields: FieldSelection[] = [{ name: 'id', path: ['id'], depth: 1 }];

      buildQueryCached('user', fields, { variables: { id: '1' } });
      const result2 = buildQueryCached('user', fields, { variables: { id: '2' } });

      expect(result2.variables).toEqual({ id: '2' });
    });
  });

  describe('buildQueryFromPaths', () => {
    it('should build query from dot-separated paths', () => {
      const result = buildQueryFromPaths('user', ['id', 'email', 'profile.bio']);

      expect(result.query).toContain('id');
      expect(result.query).toContain('email');
      expect(result.query).toContain('profile');
      expect(result.query).toContain('bio');
    });

    it('should handle deeply nested paths', () => {
      const result = buildQueryFromPaths('user', [
        'profile.settings.theme',
        'profile.settings.language',
      ]);

      expect(result.query).toContain('profile');
      expect(result.query).toContain('settings');
      expect(result.query).toContain('theme');
      expect(result.query).toContain('language');
    });
  });

  describe('buildQueryFromPathsCached', () => {
    it('should cache path-based queries', () => {
      const result1 = buildQueryFromPathsCached('user', ['id', 'email']);
      const result2 = buildQueryFromPathsCached('user', ['id', 'email']);

      expect(result1.query).toBe(result2.query);
    });
  });
});
