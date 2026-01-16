/**
 * Schema Mapping with Generic Functions
 *
 * This example demonstrates bidirectional schema translation using plain
 * TypeScript functions - no external validation library required.
 *
 * This approach is suitable when:
 * - You want minimal dependencies
 * - Your transformations are straightforward
 * - You prefer explicit type definitions over runtime validation
 */

import type { GraphQLResolveInfo } from 'graphql';
import { extractFieldsFromInfo, buildQuery, type FieldSelection } from 'graphql-query-builder';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Your service's User type - what your GraphQL API exposes to clients.
 */
export interface ServiceUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
  isActive: boolean;
}

/**
 * Upstream service's User type - different field names and types.
 */
export interface UpstreamUser {
  id: string;
  emailAddress: string;
  fullName: string;
  profileImageUrl: string | null;
  createdTimestamp: string;
  status: 'active' | 'inactive' | 'suspended';
}

// =============================================================================
// FIELD MAPPINGS
// =============================================================================

/**
 * Maps service field names to upstream field names.
 */
export const fieldMappings: Record<keyof ServiceUser, keyof UpstreamUser> = {
  id: 'id',
  email: 'emailAddress',
  name: 'fullName',
  avatarUrl: 'profileImageUrl',
  createdAt: 'createdTimestamp',
  isActive: 'status',
};

/**
 * Reverse mappings (upstream → service).
 */
export const reverseFieldMappings: Record<keyof UpstreamUser, keyof ServiceUser> = {
  id: 'id',
  emailAddress: 'email',
  fullName: 'name',
  profileImageUrl: 'avatarUrl',
  createdTimestamp: 'createdAt',
  status: 'isActive',
};

// =============================================================================
// TRANSFORMATION FUNCTIONS
// =============================================================================

/**
 * Decode: Transform upstream response to service format.
 */
export function decode(upstream: UpstreamUser): ServiceUser {
  return {
    id: upstream.id,
    email: upstream.emailAddress,
    name: upstream.fullName,
    avatarUrl: upstream.profileImageUrl,
    createdAt: new Date(upstream.createdTimestamp),
    isActive: upstream.status === 'active',
  };
}

/**
 * Encode: Transform service data to upstream format.
 * Useful for creating test mocks.
 */
export function encode(service: ServiceUser): UpstreamUser {
  return {
    id: service.id,
    emailAddress: service.email,
    fullName: service.name,
    profileImageUrl: service.avatarUrl,
    createdTimestamp: service.createdAt.toISOString(),
    status: service.isActive ? 'active' : 'inactive',
  };
}

/**
 * Encode field selections from service to upstream field names.
 */
export function encodeFields(fields: FieldSelection[]): FieldSelection[] {
  return fields.map((field) => {
    const upstreamName = fieldMappings[field.name as keyof ServiceUser] ?? field.name;

    return {
      ...field,
      name: upstreamName,
      path: field.path.map((p) => fieldMappings[p as keyof ServiceUser] ?? p),
      selections: field.selections ? encodeFields(field.selections) : undefined,
    };
  });
}

// =============================================================================
// CONTEXT TYPE
// =============================================================================

export interface AppContext {
  dataSources: {
    users: {
      getUserById: (query: string, variables: Record<string, unknown>) => Promise<UpstreamUser>;
      getUsers: (query: string, variables: Record<string, unknown>) => Promise<UpstreamUser[]>;
    };
  };
}

// =============================================================================
// ADAPTER FUNCTIONS
// =============================================================================

/**
 * Adapter function for fetching a single user.
 *
 * Flow:
 * 1. Parse info (extract requested fields)
 * 2. Encode fields (map to upstream schema)
 * 3. Build query
 * 4. Send request via datasource
 * 5. Decode response (transform to service schema)
 * 6. Return decoded
 */
export async function getUser(
  id: string,
  ctx: AppContext,
  info: GraphQLResolveInfo,
): Promise<ServiceUser> {
  // 1. Parse info - extract requested fields
  const { fields } = extractFieldsFromInfo(info);

  // 2. Encode fields - map service field names to upstream
  const upstreamFields = encodeFields(fields);

  // 3. Build query with upstream field names
  const { query, variables } = buildQuery('user', upstreamFields, {
    operationName: 'GetUpstreamUser',
    variables: { id },
    variableTypes: { id: 'ID!' },
    rootArguments: { id: { __variable: 'id' } },
  });

  // 4. Send request via datasource
  const upstreamUser = await ctx.dataSources.users.getUserById(query, variables);

  // 5. Decode response - transform upstream to service schema
  const serviceUser = decode(upstreamUser);

  // 6. Return decoded
  return serviceUser;
}

/**
 * Adapter function for fetching multiple users.
 */
export async function getUsers(
  ids: string[],
  ctx: AppContext,
  info: GraphQLResolveInfo,
): Promise<ServiceUser[]> {
  // 1. Parse info
  const { fields } = extractFieldsFromInfo(info);

  // 2. Encode fields
  const upstreamFields = encodeFields(fields);

  // 3. Build query
  const { query, variables } = buildQuery('users', upstreamFields, {
    operationName: 'GetUpstreamUsers',
    variables: { ids },
    variableTypes: { ids: '[ID!]!' },
    rootArguments: { ids: { __variable: 'ids' } },
  });

  // 4. Send request
  const upstreamUsers = await ctx.dataSources.users.getUsers(query, variables);

  // 5. Decode each response
  return upstreamUsers.map(decode);
}

// =============================================================================
// RESOLVER INTEGRATION
// =============================================================================

export const resolvers = {
  Query: {
    user: (
      _parent: unknown,
      args: { id: string },
      ctx: AppContext,
      info: GraphQLResolveInfo,
    ): Promise<ServiceUser> => getUser(args.id, ctx, info),

    users: (
      _parent: unknown,
      args: { ids: string[] },
      ctx: AppContext,
      info: GraphQLResolveInfo,
    ): Promise<ServiceUser[]> => getUsers(args.ids, ctx, info),
  },
};

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard to validate upstream response at runtime.
 */
export function isUpstreamUser(value: unknown): value is UpstreamUser {
  if (!value || typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.emailAddress === 'string' &&
    typeof obj.fullName === 'string' &&
    (obj.profileImageUrl === null || typeof obj.profileImageUrl === 'string') &&
    typeof obj.createdTimestamp === 'string' &&
    (obj.status === 'active' || obj.status === 'inactive' || obj.status === 'suspended')
  );
}

/**
 * Type guard to validate service data.
 */
export function isServiceUser(value: unknown): value is ServiceUser {
  if (!value || typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.email === 'string' &&
    typeof obj.name === 'string' &&
    (obj.avatarUrl === null || typeof obj.avatarUrl === 'string') &&
    obj.createdAt instanceof Date &&
    typeof obj.isActive === 'boolean'
  );
}

// =============================================================================
// TESTING UTILITIES
// =============================================================================

/**
 * Create mock upstream data from service data.
 */
export function createMockUpstreamUser(serviceUser: ServiceUser): UpstreamUser {
  return encode(serviceUser);
}

/**
 * Demonstrates round-trip transformation.
 */
export function demonstrateCodec(): void {
  const serviceUser: ServiceUser = {
    id: 'user-123',
    email: 'alice@example.com',
    name: 'Alice Smith',
    avatarUrl: 'https://example.com/avatar.jpg',
    createdAt: new Date('2024-01-15T10:30:00Z'),
    isActive: true,
  };

  // Encode: service → upstream
  const upstream = encode(serviceUser);
  console.log('Upstream format:', upstream);

  // Decode: upstream → service
  const decoded = decode(upstream);
  console.log('Service format:', decoded);

  // Verify round-trip
  console.log('Round-trip successful:', decoded.email === serviceUser.email);
}
