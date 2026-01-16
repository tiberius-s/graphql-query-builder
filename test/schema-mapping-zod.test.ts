import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildQuery, configure, resetConfig } from '../src/index.js';
import type { FieldSelection } from '../src/index.js';

describe('Integration Tests: Schema Mapping with Zod', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
  });

  it('should transform data bidirectionally with Zod codecs', async () => {
    const { UserCodec } = await import('../examples/schema-mapping-zod/schema-mapping-zod.js');

    const serviceUser = {
      id: 'user-123',
      email: 'alice@example.com',
      name: 'Alice Smith',
      profile: {
        bio: 'Software engineer',
        avatarUrl: 'https://example.com/avatar.jpg',
        location: 'San Francisco',
      },
      friends: ['user-456', 'user-789'],
      createdAt: new Date('2024-01-15T10:30:00Z'),
      isActive: true,
    };

    const upstreamUser = UserCodec.encode(serviceUser);

    expect(upstreamUser).toMatchObject({
      id: 'user-123',
      emailAddress: 'alice@example.com',
      fullName: 'Alice Smith',
      userProfile: {
        biography: 'Software engineer',
        profileImageUrl: 'https://example.com/avatar.jpg',
        userLocation: 'San Francisco',
      },
      friendIds: ['user-456', 'user-789'],
      status: 'active',
    });
    expect(upstreamUser.createdTimestamp).toBe('2024-01-15T10:30:00.000Z');

    const decoded = UserCodec.decode(upstreamUser);

    expect(decoded).toMatchObject({
      id: 'user-123',
      email: 'alice@example.com',
      name: 'Alice Smith',
      profile: {
        bio: 'Software engineer',
        avatarUrl: 'https://example.com/avatar.jpg',
        location: 'San Francisco',
      },
      friends: ['user-456', 'user-789'],
      isActive: true,
    });
  });

  it('should build queries with field mappings for top-level fields', async () => {
    const { fieldMappings } = await import('../examples/schema-mapping-zod/schema-mapping-zod.js');

    const fields: FieldSelection[] = [
      { name: 'id', path: ['id'], depth: 1 },
      { name: 'email', path: ['email'], depth: 1 },
      { name: 'name', path: ['name'], depth: 1 },
      {
        name: 'profile',
        path: ['profile'],
        depth: 1,
        selections: [
          { name: 'bio', path: ['profile', 'bio'], depth: 2 },
          { name: 'avatarUrl', path: ['profile', 'avatarUrl'], depth: 2 },
        ],
      },
    ];

    const { query } = buildQuery('user', fields, {
      operationName: 'GetUpstreamUser',
      variables: { id: 'user-123' },
      fieldMappings,
    });

    expect(query).toContain('emailAddress');
    expect(query).toContain('fullName');
    expect(query).toContain('userProfile');
    expect(query).not.toContain(' email ');
    expect(query).not.toContain(' name {');
  });

  it('should handle mutations with encode/decode', async () => {
    const { UserCodec } = await import('../examples/schema-mapping-zod/schema-mapping-zod.js');

    const partialInput = {
      email: 'bob@example.com',
      isActive: false,
    };

    const fullUser = {
      id: 'user-456',
      email: partialInput.email,
      name: 'Bob Jones',
      profile: { bio: 'Developer', avatarUrl: null, location: null },
      friends: [],
      createdAt: new Date('2024-02-01T12:00:00Z'),
      isActive: partialInput.isActive,
    };

    const encoded = UserCodec.encode(fullUser);

    expect(encoded.emailAddress).toBe('bob@example.com');
    expect(encoded.status).toBe('inactive');

    const decoded = UserCodec.decode(encoded);

    expect(decoded.email).toBe('bob@example.com');
    expect(decoded.isActive).toBe(false);
  });
});
