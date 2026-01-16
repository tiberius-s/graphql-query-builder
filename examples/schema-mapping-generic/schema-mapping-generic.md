# Schema Mapping with Generic Functions

This guide shows how to handle schema translation between your GraphQL service and an upstream service using plain TypeScript functions, with no external validation library required.

## The Problem

Your service schema:

```typescript
interface ServiceUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
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
  profileImageUrl: string | null;
  createdTimestamp: string;
  status: 'active' | 'inactive' | 'suspended';
}
```

## Step 1: Define Field Mappings

```typescript
const fieldMappings: Record<keyof ServiceUser, keyof UpstreamUser> = {
  id: 'id',
  email: 'emailAddress',
  name: 'fullName',
  avatarUrl: 'profileImageUrl',
  createdAt: 'createdTimestamp',
  isActive: 'status',
};
```

## Step 2: Create Transformation Functions

```typescript
// Decode: upstream → service
function decode(upstream: UpstreamUser): ServiceUser {
  return {
    id: upstream.id,
    email: upstream.emailAddress,
    name: upstream.fullName,
    avatarUrl: upstream.profileImageUrl,
    createdAt: new Date(upstream.createdTimestamp),
    isActive: upstream.status === 'active',
  };
}

// Encode: service → upstream (for test mocks)
function encode(service: ServiceUser): UpstreamUser {
  return {
    id: service.id,
    emailAddress: service.email,
    fullName: service.name,
    profileImageUrl: service.avatarUrl,
    createdTimestamp: service.createdAt.toISOString(),
    status: service.isActive ? 'active' : 'inactive',
  };
}
```

## Step 3: Create Field Encoder

```typescript
function encodeFields(fields: FieldSelection[]): FieldSelection[] {
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
```

## Step 4: Write the Adapter Function

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

  // 2. Encode fields - map service field names to upstream
  const upstreamFields = encodeFields(fields);

  // 3. Build query with upstream field names
  const { query, variables } = buildQuery('user', upstreamFields, {
    operationName: 'GetUpstreamUser',
    variables: { id },
  });

  // 4. Send request via datasource
  const upstreamUser = await ctx.dataSources.users.getUserById(query, variables);

  // 5. Decode response - transform upstream to service schema
  const serviceUser = decode(upstreamUser);

  // 6. Return decoded
  return serviceUser;
}
```

## Step 5: Use in Resolvers

```typescript
const resolvers = {
  Query: {
    user: (
      _parent: unknown,
      args: { id: string },
      ctx: AppContext,
      info: GraphQLResolveInfo,
    ): Promise<ServiceUser> => getUser(args.id, ctx, info),
  },
};
```

## Optional: Type Guards

For runtime validation without external libraries:

```typescript
function isUpstreamUser(value: unknown): value is UpstreamUser {
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
```

## Testing

Use `encode()` to create mock upstream responses:

```typescript
const testUser: ServiceUser = {
  id: 'test-1',
  email: 'test@example.com',
  name: 'Test User',
  avatarUrl: null,
  createdAt: new Date(),
  isActive: true,
};

// Create mock upstream response
const mockUpstream = encode(testUser);

// Verify round-trip
const decoded = decode(mockUpstream);
console.log(decoded.email === testUser.email); // true
```

## Complete Example

See [schema-mapping-generic.ts](./schema-mapping-generic.ts) for the full implementation.

## When to Use This Pattern

Use generic functions when:

- You want minimal dependencies
- Your transformations are straightforward
- You prefer explicit type definitions

For runtime validation and type inference, see the [Zod Schema Mapping](../schema-mapping-zod/schema-mapping-zod.md) guide.
