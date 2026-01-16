# Schema Mapping with Zod

When building a GraphQL service that communicates with an upstream GraphQL service, you often encounter schema mismatches. This guide shows how to handle bidirectional schema translation using Zod 4's codec pattern for both queries and mutations.

## The Problem

You need two types of transformations:

1. **Field name mapping** (for building queries/mutations): `email` → `emailAddress`
2. **Data transformation** (for requests and responses):
   - **decode**: upstream → service (query/mutation responses)
   - **encode**: service → upstream (mutation inputs)

These are fundamentally different operations and must be handled separately.

Your service schema:

```typescript
interface ServiceUser {
  id: string;
  email: string;
  name: string;
  profile: {
    bio: string;
    avatarUrl: string | null;
    location: string | null;
  };
  friends: string[]; // Array of user IDs
  createdAt: Date;
  isActive: boolean;
}
```

Upstream service schema:

```typescript
interface UpstreamUser {
  id: string;
  emailAddress: string;
  fullName: string;
  userProfile: {
    biography: string;
    profileImageUrl: string | null;
    userLocation: string | null;
  };
  friendIds: string[];
  createdTimestamp: string;
  status: 'active' | 'inactive' | 'suspended';
}
```

You need to:

1. Translate field names in queries (service → upstream) - **Field mappings**
2. Transform response data (upstream → service) - **Zod codec**
3. Handle nested objects and arrays

## The Solution: Zod Codecs + Field Mappings

**Zod codecs** handle bidirectional data transformation:

- `decode`: upstream → service (transforms response values for queries and mutations)
- `encode`: service → upstream (transforms input values for mutations)

**Field mappings** handle query/mutation building:

- Plain object mapping service field names to upstream field names
- Passed to `buildQuery()` for both queries and mutations

## Step 1: Define Schemas

```typescript
import * as z from 'zod';

const ServiceProfileSchema = z.object({
  bio: z.string(),
  avatarUrl: z.string().url().nullable(),
  location: z.string().nullable(),
});

const ServiceUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  profile: ServiceProfileSchema,
  friends: z.array(z.string()),
  createdAt: z.coerce.date(),
  isActive: z.boolean(),
});

const UpstreamProfileSchema = z.object({
  biography: z.string(),
  profileImageUrl: z.string().nullable(),
  userLocation: z.string().nullable(),
});

const UpstreamUserSchema = z.object({
  id: z.string(),
  emailAddress: z.string(),
  fullName: z.string(),
  userProfile: UpstreamProfileSchema,
  friendIds: z.array(z.string()),
  createdTimestamp: z.string(),
  status: z.enum(['active', 'inactive', 'suspended']),
});
```

## Step 2: Create the Codecs

```typescript
const ProfileCodec = z.codec(UpstreamProfileSchema, ServiceProfileSchema, {
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

const UserCodec = z.codec(UpstreamUserSchema, ServiceUserSchema, {
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

Field mappings must be maintained separately from the codec because they serve different purposes:

- **Codecs** transform VALUES (data transformation)
- **Field mappings** translate NAMES (query building)

```typescript
const fieldMappings: Record<string, string> = {
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

## Step 4: Write Query Adapters

```typescript
interface AppContext {
  dataSources: {
    users: {
      getUserById: (query: string, variables: Record<string, unknown>) => Promise<UpstreamUser>;
    };
  };
}

async function getUser(
  id: string,
  ctx: AppContext,
  info: GraphQLResolveInfo,
): Promise<ServiceUser> {
  // 1. Parse info - extract requested fields
  const { fields } = extractFieldsFromInfo(info);

  // 2. Build query - use field mappings for query building
  const { query, variables } = buildQuery('user', fields, {
    operationName: 'GetUpstreamUser',
    variables: { id },
    fieldMappings, // Translates field names in the query
  });

  // 3. Send request via datasource
  const upstreamUser = await ctx.dataSources.users.getUserById(query, variables);

  // 4. Decode response - use codec for data transformation
  const serviceUser = UserCodec.decode(upstreamUser);

  //  getUsers: (query: string, variables: Record<string, unknown>) => Promise<UpstreamUser[]>;
      updateUser: (mutation: string, variables: Record<string, unknown>) => Promise<UpstreamUser>;
      createUser: (mutation: string, variables: Record<string, unknown>) => Promise<UpstreamUser>;
    };
  };
}

async function getUser(
  id: string,
  ctx: AppContext,
  info: GraphQLResolveInfo,
): Promise<ServiceUser> {
  const { fields } = extractFieldsFromInfo(info);
  const { query, variables } = buildQuery('user', fields, {
    operationName: 'GetUpstreamUser',
    variables: { id },
    fieldMappings,
  });
  const upstreamUser = await ctx.dataSources.users.getUserById(query, variables);
  return UserCodec.decode(upstreamUser);
}

async function getUsers(
  ids: string[],
  ctx: AppContext,
  info: GraphQLResolveInfo,
): Promise<ServiceUser[]> {
  const { fields } = extractFieldsFromInfo(info);
  const { query, variables } = buildQuery('users', fields, {
    operationName: 'GetUpstreamUsers',
    variables: { ids },
    fieldMappings,
  });
  const upstreamUsers = await ctx.dataSources.users.getUsers(query, variables);
  return upstreamUsers.map((upstreamUser) => UserCodec.decode(upstreamUser));
}
```

## Step 5: Write Mutation Adapters

Mutations use `encode()` to transform service input to upstream format:
users: (
\_parent: unknown,
args: { ids: string[] },
ctx: AppContext,
info: GraphQLResolveInfo,
): Promise<ServiceUser[]> => getUsers(args.ids, ctx, info),
},
Mutation: {
updateUser: (
\_parent: unknown,
args: { id: string; input: Partial<ServiceUser> },
ctx: AppContext,
info: GraphQLResolveInfo,
): Promise<ServiceUser> => updateUser(args.id, args.input, ctx, info),
createUser: (
\_parent: unknown,
args: { input: Omit<ServiceUser, 'id' | 'createdAt'> },
ctx: AppContext,
info: GraphQLResolveInfo,
): Promise<ServiceUser> => createUser(args.input, ctx, info),
},
};

````

## Key Concepts

### Why Separate Field Mappings and Codecs?

Field mappings and codecs serve fundamentally different purposes:

- **Field mappings**: Translate field NAMES at query construction time (`email` → `emailAddress`)
- **Codecs**: Transform field VALUES at runtime (`status: 'active'` → `isActive: true`)

These cannot be merged because:
1. Field mappings happen before the query is sent (string manipulation)
2. Codec transformations happen after the response is received (data transformation)

### Bidirectional Transformation Flow

**Queries** (decode only):
1. Client requests fields → Extract fields from GraphQL info
2. Build query with field mappings → Translate names
3. Send query to upstream → Get response
4. Decode response with codec → Transform values

**Mutations** (encode + decode):
1. Client sends input → Encode with codec → Transform service input to upstream format
2. Build mutation with field mappings → Translate names
3. Send mutation to upstream → Get response
4. Decode response with codec → Transform values

## Testing

Create mock upstream data for unit tests:

```typescript
const testUser: ServiceUser = {
  id: 'test-1',
  email: 'test@example.com',
  name: 'Test User',
  profile: {
    bio: 'Test bio',
    avatarUrl: null,
    location: 'Test City',
  },
  friends: ['user-2', 'user-3'],
  createdAt: new Date(),
  isActive: true,
};

const mockUpstream = UserCodec.encode(testUser);
const decoded = UserCodec.decode(mockUpstream);
console.log(decoded.email === testUser.email); // true
````

## Complete Example

See [schema-mapping-zod.ts](./schema-mapping-zod.ts) for the full implementation.

## Key Benefits

1. **Bidirectional**: Handles both queries (decode) and mutations (encode)
2. **Type Safety**: Zod provides runtime validation and type inference
3. **Nested Objects & Arrays**: Handles complex structures with nested codecs
4. **Clear Separation**: Field mappings (names) vs codecs (values)
5. **Production Ready**: encode() is used for real mutations, not just tes
   const { fields } = extractFieldsFromInfo(info);

const serviceUserForEncoding: ServiceUser = {
id: '',
...input,
createdAt: new Date(),
};
const upstreamUser = UserCodec.encode(serviceUserForEncoding);

const { id: \_id, createdTimestamp: \_ts, ...upstreamInput } = upstreamUser;

const { query: mutation, variables } = buildQuery('createUser', fields, {
operationName: 'CreateUpstreamUser',
variables: { input: upstreamInput },
fieldMappings,
});

const createdUpstreamUser = await ctx.dataSources.users.createUser(mutation, variables);
return UserCodec.decode(createdUpstreamUser);
}

```

## Step 6'Test bio',
    avatarUrl: null,
    location: 'Test City',
  },
  friends: ['user-2', 'user-3'],
  createdAt: new Date(),
  isActive: true,
};

// Create mock upstream response
const mockUpstream = UserCodec.encode(testUser);

// Verify round-trip
const decoded = UserCodec.decode(mockUpstream);
console.log(decoded.email === testUser.email); // true

// Show auto-derived field mappings
console.log(fieldMappings);
// { id: 'id', email: 'emailAddress', name: 'fullName', ... }
```

## Complete Example

See [schema-mapping-zod.ts](./schema-mapping-zod.ts) for the full implementation.

## Key Benefits

1. **Single Source of Truth**: The codec contains ALL transformation logic
2. **Auto-Derived Mappings**: Field mappings are derived automatically from the codec
3. **Type Safety**: Zod provides runtime validation and type inference
4. **Nested Objects & Arrays**: Handles complex structures with nested codecs
5. **No Manual Duplication**: No need to maintain separate field mapping objects

## When to Use This Pattern

Use Zod codecs when:

- You need runtime validation
- You want type inference from schemas
- You prefer a single source of truth for transformations
- You have complex nested objects and arrays

For simpler cases without external dependencies, see the [Generic Schema Mapping](../schema-mapping-generic/schema-mapping-generic.md) guide.
