# Schema Mapping with Zod

This guide shows how to proxy a GraphQL API to an upstream GraphQL service when the two schemas don't match.

You'll use two tools together:

- **Field mappings** translate field _names_ while building the upstream operation.
- **Zod codecs** translate field _values_ while decoding responses (and encoding mutation inputs).

The full working example is in [schema-mapping-zod.ts](./schema-mapping-zod.ts).

## Why This Pattern Works

There are two distinct problems:

1. **Names**: Build an upstream GraphQL document with different field names (for example `email` -> `emailAddress`).
2. **Values**: Convert upstream JSON into your service types (for example `createdTimestamp` -> `createdAt: Date`).

Field mappings solve (1). Codecs solve (2). They aren't interchangeable.

## Step 1: Define Service and Upstream Schemas

Define both schemas using Zod. In the example, this is done via `ServiceUserSchema` and `UpstreamUserSchema`.

```typescript
import * as z from 'zod';

export const ServiceProfileSchema = z.object({
  bio: z.string(),
  avatarUrl: z.string().url().nullable(),
  location: z.string().nullable(),
});

export const ServiceUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  profile: ServiceProfileSchema,
  friends: z.array(z.string()),
  createdAt: z.coerce.date(),
  isActive: z.boolean(),
});

export type ServiceUser = z.infer<typeof ServiceUserSchema>;

export const UpstreamProfileSchema = z.object({
  biography: z.string(),
  profileImageUrl: z.string().nullable(),
  userLocation: z.string().nullable(),
});

export const UpstreamUserSchema = z.object({
  id: z.string(),
  emailAddress: z.string(),
  fullName: z.string(),
  userProfile: UpstreamProfileSchema,
  friendIds: z.array(z.string()),
  createdTimestamp: z.string(),
  status: z.enum(['active', 'inactive', 'suspended']),
});

export type UpstreamUser = z.infer<typeof UpstreamUserSchema>;
```

## Step 2: Create a Codec

Use a codec to define bidirectional transforms:

- `decode(upstream)` for query/mutation responses
- `encode(service)` for mutation inputs

```typescript
export const ProfileCodec = z.codec(UpstreamProfileSchema, ServiceProfileSchema, {
  decode: (upstream) => ({
    bio: upstream.biography,
    avatarUrl: upstream.profileImageUrl,
    location: upstream.userLocation,
  }),

  encode: (service) => ({
    biography: service.bio,
    profileImageUrl: service.avatarUrl,
    userLocation: service.location,
  }),
});

export const UserCodec = z.codec(UpstreamUserSchema, ServiceUserSchema, {
  decode: (upstream) => ({
    id: upstream.id,
    email: upstream.emailAddress,
    name: upstream.fullName,
    profile: ProfileCodec.decode(upstream.userProfile),
    friends: upstream.friendIds,
    createdAt: new Date(upstream.createdTimestamp),
    isActive: upstream.status === 'active',
  }),

  encode: (service) => ({
    id: service.id,
    emailAddress: service.email,
    fullName: service.name,
    userProfile: ProfileCodec.encode(service.profile),
    friendIds: service.friends,
    createdTimestamp: service.createdAt.toISOString(),
    status: service.isActive ? 'active' : 'inactive',
  }),
});
```

## Step 3: Define Field Mappings

Field mappings translate the GraphQL **field names** used in the query document.

```typescript
export const fieldMappings: Record<string, string> = {
  id: 'id',
  email: 'emailAddress',
  name: 'fullName',
  profile: 'userProfile',
  'profile.bio': 'userProfile.biography',
  'profile.avatarUrl': 'userProfile.profileImageUrl',
  'profile.location': 'userProfile.userLocation',
  friends: 'friendIds',
  createdAt: 'createdTimestamp',
  isActive: 'status',
};
```

## Step 4: Build Upstream Queries

In your resolver adapter:

1. Extract fields from `info`.
2. Build the upstream query with `fieldMappings`.
3. Provide root arguments via `rootArguments`.
4. Decode the upstream response with the codec.

```typescript
import type { GraphQLResolveInfo } from 'graphql';
import { extractFieldsFromInfo, buildQuery } from 'graphql-query-builder';

export async function getUser(id: string, ctx: AppContext, info: GraphQLResolveInfo) {
  const { fields } = extractFieldsFromInfo(info);

  const { query, variables } = buildQuery('user', fields, {
    operationName: 'GetUpstreamUser',
    variables: { id },
    variableTypes: { id: 'ID!' },
    rootArguments: { id: { __variable: 'id' } },
    fieldMappings,
  });

  const upstreamUser = await ctx.dataSources.users.getUserById(query, variables);
  return UserCodec.decode(upstreamUser);
}
```

If you also support a list query (like `users(ids: [ID!]!)`), it looks the same:

```typescript
export async function getUsers(ids: string[], ctx: AppContext, info: GraphQLResolveInfo) {
  const { fields } = extractFieldsFromInfo(info);

  const { query, variables } = buildQuery('users', fields, {
    operationName: 'GetUpstreamUsers',
    variables: { ids },
    variableTypes: { ids: '[ID!]!' },
    rootArguments: { ids: { __variable: 'ids' } },
    fieldMappings,
  });

  const upstreamUsers = await ctx.dataSources.users.getUsers(query, variables);
  return upstreamUsers.map((upstreamUser) => UserCodec.decode(upstreamUser));
}
```

## Step 5: Build Upstream Mutations

Mutations usually need both directions:

1. Encode service input to upstream input (`encode`).
2. Build a `mutation` operation.
3. Decode the upstream response (`decode`).

```typescript
export async function updateUser(
  id: string,
  input: Partial<ServiceUser>,
  ctx: AppContext,
  info: GraphQLResolveInfo,
) {
  const { fields } = extractFieldsFromInfo(info);

  // Encode a full upstream-shaped user, then pick only the fields you want to update.
  const serviceUserForEncoding: ServiceUser = {
    id,
    email: input.email ?? '',
    name: input.name ?? '',
    profile: input.profile ?? { bio: '', avatarUrl: null, location: null },
    friends: input.friends ?? [],
    createdAt: input.createdAt ?? new Date(),
    isActive: input.isActive ?? true,
  };
  const upstreamUser = UserCodec.encode(serviceUserForEncoding);

  const upstreamInput: Partial<UpstreamUser> = {};
  if (input.email !== undefined) upstreamInput.emailAddress = upstreamUser.emailAddress;
  if (input.name !== undefined) upstreamInput.fullName = upstreamUser.fullName;
  if (input.profile !== undefined) upstreamInput.userProfile = upstreamUser.userProfile;
  if (input.friends !== undefined) upstreamInput.friendIds = upstreamUser.friendIds;
  if (input.isActive !== undefined) upstreamInput.status = upstreamUser.status;

  const { query: mutation, variables } = buildQuery('updateUser', fields, {
    operationType: 'mutation',
    operationName: 'UpdateUpstreamUser',
    variables: { id, input: upstreamInput },
    variableTypes: { id: 'ID!', input: 'UpdateUserInput!' },
    rootArguments: { id: { __variable: 'id' }, input: { __variable: 'input' } },
    fieldMappings,
  });

  const updatedUpstreamUser = await ctx.dataSources.users.updateUser(mutation, variables);
  return UserCodec.decode(updatedUpstreamUser);
}
```

Creating a user is typically the same idea: encode, strip upstream-only fields, then build a mutation.

```typescript
export async function createUser(
  input: Omit<ServiceUser, 'id' | 'createdAt'>,
  ctx: AppContext,
  info: GraphQLResolveInfo,
) {
  const { fields } = extractFieldsFromInfo(info);

  const serviceUserForEncoding: ServiceUser = {
    id: '',
    ...input,
    createdAt: new Date(),
  };
  const upstreamUser = UserCodec.encode(serviceUserForEncoding);

  const { id: _id, createdTimestamp: _ts, ...upstreamInput } = upstreamUser;

  const { query: mutation, variables } = buildQuery('createUser', fields, {
    operationType: 'mutation',
    operationName: 'CreateUpstreamUser',
    variables: { input: upstreamInput },
    variableTypes: { input: 'CreateUserInput!' },
    rootArguments: { input: { __variable: 'input' } },
    fieldMappings,
  });

  const createdUpstreamUser = await ctx.dataSources.users.createUser(mutation, variables);
  return UserCodec.decode(createdUpstreamUser);
}
```

`UpdateUserInput!` and `CreateUserInput!` are example variable types - use the input type names from your upstream schema.

## Testing Tip

If you want upstream-shaped mocks in tests, create them by encoding a service object:

```typescript
export function createMockUpstreamUser(serviceUser: ServiceUser): UpstreamUser {
  return UserCodec.encode(serviceUser);
}
```

## Next Steps

- See the full implementation in [schema-mapping-zod.ts](./schema-mapping-zod.ts)
- For a no-dependencies approach, see [Schema Mapping with Generic Functions](../schema-mapping-generic/schema-mapping-generic.md)
