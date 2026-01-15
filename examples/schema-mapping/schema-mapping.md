# Schema Mapping Tutorial

A comprehensive guide to translating between your service's GraphQL schema and upstream service schemas using Zod for type-safe transformations.

---

## Introduction

In real-world systems, your GraphQL API's schema often differs from the upstream services you depend on:

- **Different field names**: Your API uses `emailAddress`, upstream uses `email`
- **Different casing**: Your API uses `camelCase`, upstream uses `snake_case`
- **Different value formats**: Your API uses `'pro'`, upstream uses `'PRO'`
- **Different structures**: Nested objects organized differently

This tutorial shows you how to handle these differences cleanly using `graphql-query-builder` with **Zod** for bidirectional schema transformation.

---

## Prerequisites

- Completed the [Basic Usage](../basic-usage/basic-usage.md) tutorial
- Familiarity with [Zod](https://zod.dev/) validation library

Install Zod:

```bash
npm install zod
```

---

## What You'll Learn

1. Defining service and upstream schemas
2. Creating field name mappings
3. Building bidirectional transformers with Zod
4. Mapping field selections for upstream queries
5. Creating a complete schema-mapping resolver

---

## The Problem

```
┌─────────────────────┐                    ┌─────────────────────┐
│   Your Service      │                    │  Upstream Service   │
│   (Client-Facing)   │                    │  (Internal API)     │
├─────────────────────┤                    ├─────────────────────┤
│ emailAddress        │  ───translate───▶  │ email               │
│ displayName         │  ───translate───▶  │ full_name           │
│ profilePicture      │  ───translate───▶  │ avatar_url          │
│ memberSince         │  ───translate───▶  │ created_at          │
│ accountTier: 'pro'  │  ───translate───▶  │ subscription: 'PRO' │
└─────────────────────┘                    └─────────────────────┘
```

When a client queries your API for `emailAddress`, you need to:

1. **Map the field name** to `email` when querying upstream
2. **Transform the response** back to `emailAddress`

---

## Step 1: Define Your Schemas

First, define both schemas using Zod:

### Service Schema (What Clients See)

```typescript
import { z } from 'zod';

// Your client-facing schema
export const ServiceUserSchema = z.object({
  id: z.string(),
  emailAddress: z.string().email(),
  displayName: z.string(),
  profilePicture: z.string().url().nullable(),
  memberSince: z.string().datetime(),
  accountTier: z.enum(['free', 'pro', 'enterprise']),
  contactInfo: z
    .object({
      phoneNumber: z.string().nullable(),
      preferredContact: z.enum(['email', 'phone', 'sms']),
    })
    .optional(),
});

export type ServiceUser = z.infer<typeof ServiceUserSchema>;
```

### Upstream Schema (What the API Returns)

```typescript
// What the upstream service uses
export const UpstreamUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  full_name: z.string(),
  avatar_url: z.string().url().nullable(),
  created_at: z.string().datetime(),
  subscription_level: z.enum(['FREE', 'PRO', 'ENTERPRISE']),
  contact: z
    .object({
      phone: z.string().nullable(),
      preferred_method: z.enum(['EMAIL', 'PHONE', 'SMS']),
    })
    .optional(),
});

export type UpstreamUser = z.infer<typeof UpstreamUserSchema>;
```

---

## Step 2: Create Field Mappings

Define how your field names map to upstream names:

```typescript
// Service → Upstream field mappings
export const userFieldMappings = {
  emailAddress: 'email',
  displayName: 'full_name',
  profilePicture: 'avatar_url',
  memberSince: 'created_at',
  accountTier: 'subscription_level',
  'contactInfo.phoneNumber': 'contact.phone',
  'contactInfo.preferredContact': 'contact.preferred_method',
} as const;

// Create reverse mapping for response transformation
export const reverseUserFieldMappings = Object.fromEntries(
  Object.entries(userFieldMappings).map(([k, v]) => [v, k]),
) as Record<string, string>;
```

---

## Step 3: Create Zod Transformers

Zod's `.transform()` method lets you convert between schemas:

### Upstream → Service (Response Transformation)

```typescript
export const upstreamToServiceUser = z
  .object({
    id: z.string(),
    email: z.string(),
    full_name: z.string(),
    avatar_url: z.string().nullable(),
    created_at: z.string(),
    subscription_level: z.enum(['FREE', 'PRO', 'ENTERPRISE']),
    contact: z
      .object({
        phone: z.string().nullable(),
        preferred_method: z.enum(['EMAIL', 'PHONE', 'SMS']),
      })
      .optional(),
  })
  .transform(
    (upstream): ServiceUser => ({
      id: upstream.id,
      emailAddress: upstream.email,
      displayName: upstream.full_name,
      profilePicture: upstream.avatar_url,
      memberSince: upstream.created_at,
      // Convert UPPERCASE to lowercase
      accountTier: upstream.subscription_level.toLowerCase() as 'free' | 'pro' | 'enterprise',
      contactInfo: upstream.contact
        ? {
            phoneNumber: upstream.contact.phone,
            preferredContact: upstream.contact.preferred_method.toLowerCase() as
              | 'email'
              | 'phone'
              | 'sms',
          }
        : undefined,
    }),
  );
```

### Service → Upstream (Input Transformation)

```typescript
export const serviceToUpstreamInput = z
  .object({
    emailAddress: z.string().optional(),
    displayName: z.string().optional(),
    profilePicture: z.string().nullable().optional(),
    accountTier: z.enum(['free', 'pro', 'enterprise']).optional(),
  })
  .transform((service) => ({
    ...(service.emailAddress && { email: service.emailAddress }),
    ...(service.displayName && { full_name: service.displayName }),
    ...(service.profilePicture !== undefined && { avatar_url: service.profilePicture }),
    ...(service.accountTier && {
      subscription_level: service.accountTier.toUpperCase(),
    }),
  }));
```

---

## Step 4: Map Field Selections

When building the upstream query, map field names:

```typescript
import type { FieldSelection } from 'graphql-query-builder';

/**
 * Maps service field selections to upstream field names.
 * Handles nested fields recursively.
 */
export function mapFieldsToUpstream(
  fields: FieldSelection[],
  mappings: Record<string, string>,
  parentPath = '',
): FieldSelection[] {
  return fields.map((field) => {
    const fullPath = parentPath ? `${parentPath}.${field.name}` : field.name;
    const mappedName = mappings[fullPath] || mappings[field.name] || field.name;

    // Handle nested path mappings like 'contactInfo.phone' → 'contact.phone'
    const upstreamName = mappedName.includes('.') ? mappedName.split('.').pop()! : mappedName;

    return {
      ...field,
      name: upstreamName,
      path: field.path.map((p, i) => (i === field.path.length - 1 ? upstreamName : p)),
      // Recursively map nested selections
      selections: field.selections
        ? mapFieldsToUpstream(field.selections, mappings, fullPath)
        : undefined,
    };
  });
}
```

---

## Step 5: Create the Schema-Mapping Resolver

Put it all together in a resolver factory:

```typescript
import { extractFieldsFromInfo, buildQuery, type FieldSelection } from 'graphql-query-builder';
import type { GraphQLResolveInfo } from 'graphql';
import type { z } from 'zod';

interface SchemaMappingConfig<TService, TUpstream> {
  fieldMappings: Record<string, string>;
  responseTransformer: z.ZodType<TService, z.ZodTypeDef, TUpstream>;
}

/**
 * Creates a resolver that handles the full schema mapping workflow:
 * 1. Extract fields from client request
 * 2. Map field names to upstream schema
 * 3. Build and execute upstream query
 * 4. Transform response back to service schema
 */
export function createMappedResolver<TService, TUpstream>(
  config: SchemaMappingConfig<TService, TUpstream>,
  upstreamFetch: (query: string, variables: Record<string, unknown>) => Promise<TUpstream>,
) {
  return async (
    rootField: string,
    variables: Record<string, unknown>,
    info: GraphQLResolveInfo,
  ): Promise<TService> => {
    // Step 1: Extract fields from client request
    const extracted = extractFieldsFromInfo(info);
    console.log(
      'Client requested fields:',
      extracted.fields.map((f) => f.name),
    );

    // Step 2: Map field names to upstream schema
    const mappedFields = mapFieldsToUpstream(extracted.fields, config.fieldMappings);
    console.log(
      'Mapped to upstream fields:',
      mappedFields.map((f) => f.name),
    );

    // Step 3: Build upstream query with mapped fields
    const { query, variables: queryVars } = buildQuery(rootField, mappedFields, {
      operationName: `Upstream_${rootField}`,
      variables,
    });
    console.log('Built upstream query:', query);

    // Step 4: Execute upstream query
    const upstreamResponse = await upstreamFetch(query, queryVars);

    // Step 5: Transform response to service schema
    const serviceResponse = config.responseTransformer.parse(upstreamResponse);

    return serviceResponse;
  };
}
```

---

## Step 6: Complete Example

Here's everything working together:

```typescript
import { z } from 'zod';
import type { GraphQLResolveInfo } from 'graphql';
import { extractFieldsFromInfo, buildQuery, type FieldSelection } from 'graphql-query-builder';

// ============ Schemas ============

const ServiceUserSchema = z.object({
  id: z.string(),
  emailAddress: z.string().email(),
  displayName: z.string(),
  accountTier: z.enum(['free', 'pro', 'enterprise']),
});

type ServiceUser = z.infer<typeof ServiceUserSchema>;

const UpstreamUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  full_name: z.string(),
  subscription_level: z.enum(['FREE', 'PRO', 'ENTERPRISE']),
});

type UpstreamUser = z.infer<typeof UpstreamUserSchema>;

// ============ Mappings ============

const fieldMappings = {
  emailAddress: 'email',
  displayName: 'full_name',
  accountTier: 'subscription_level',
};

// ============ Transformer ============

const upstreamToService = z
  .object({
    id: z.string(),
    email: z.string(),
    full_name: z.string(),
    subscription_level: z.enum(['FREE', 'PRO', 'ENTERPRISE']),
  })
  .transform(
    (upstream): ServiceUser => ({
      id: upstream.id,
      emailAddress: upstream.email,
      displayName: upstream.full_name,
      accountTier: upstream.subscription_level.toLowerCase() as 'free' | 'pro' | 'enterprise',
    }),
  );

// ============ Field Mapper ============

function mapFields(fields: FieldSelection[]): FieldSelection[] {
  return fields.map((field) => {
    const mappedName = fieldMappings[field.name] || field.name;
    return {
      ...field,
      name: mappedName,
      path: [mappedName],
    };
  });
}

// ============ Mock Upstream ============

async function fetchFromUpstream(
  query: string,
  variables: Record<string, unknown>,
): Promise<UpstreamUser> {
  console.log('Sending to upstream:', query);

  // In reality, this would be an HTTP call
  return {
    id: variables.id as string,
    email: 'jane@example.com',
    full_name: 'Jane Doe',
    subscription_level: 'PRO',
  };
}

// ============ Resolver ============

export const resolvers = {
  Query: {
    user: async (
      _: unknown,
      args: { id: string },
      context: unknown,
      info: GraphQLResolveInfo,
    ): Promise<ServiceUser> => {
      // Extract client-requested fields
      const extracted = extractFieldsFromInfo(info);

      // Map to upstream field names
      const mappedFields = mapFields(extracted.fields);

      // Build upstream query
      const { query, variables } = buildQuery('user', mappedFields, {
        operationName: 'GetUser',
        variables: { id: args.id },
      });

      // Fetch from upstream
      const upstreamData = await fetchFromUpstream(query, variables);

      // Transform to service schema
      return upstreamToService.parse(upstreamData);
    },
  },
};
```

---

## Workflow Visualization

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Client Request                                │
│   query { user(id: "123") { emailAddress displayName } }            │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 1: Extract Fields                                              │
│  fields: [{ name: 'emailAddress' }, { name: 'displayName' }]        │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 2: Map Field Names                                             │
│  emailAddress → email                                                │
│  displayName → full_name                                             │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 3: Build Upstream Query                                        │
│  query { user(id: "123") { email full_name } }                      │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 4: Execute Upstream Query                                      │
│  Response: { id: "123", email: "...", full_name: "..." }            │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 5: Transform Response (Zod)                                    │
│  { id: "123", emailAddress: "...", displayName: "..." }             │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Client Response                               │
│  { "user": { "emailAddress": "...", "displayName": "..." } }        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Advanced: Nested Field Mapping

For deeply nested objects:

```typescript
const nestedMappings = {
  'user.profile.avatar': 'user.profile_data.avatar_url',
  'user.settings.notifications': 'user.prefs.notif_settings',
};

function mapNestedFields(
  fields: FieldSelection[],
  mappings: Record<string, string>,
  currentPath: string[] = [],
): FieldSelection[] {
  return fields.map((field) => {
    const path = [...currentPath, field.name];
    const pathKey = path.join('.');

    // Check for direct mapping
    const mapping = mappings[pathKey];

    if (mapping) {
      const mappedPath = mapping.split('.');
      return {
        ...field,
        name: mappedPath[mappedPath.length - 1],
        path: mappedPath,
        selections: field.selections
          ? mapNestedFields(field.selections, mappings, path)
          : undefined,
      };
    }

    return {
      ...field,
      selections: field.selections ? mapNestedFields(field.selections, mappings, path) : undefined,
    };
  });
}
```

---

## Best Practices

### 1. Define Mappings Centrally

```typescript
// mappings/user.ts
export const userMappings = {
  fields: {
    /* ... */
  },
  transformer: upstreamToService,
  reverseTransformer: serviceToUpstream,
};
```

### 2. Validate Both Directions

```typescript
// Ensure your transformers handle all cases
const testUpstream: UpstreamUser = {
  /* ... */
};
const service = upstreamToService.parse(testUpstream);
const backToUpstream = serviceToUpstream.parse(service);
```

### 3. Handle Partial Responses

```typescript
const partialTransformer = upstreamToService.partial();
```

### 4. Log Transformation Errors

```typescript
try {
  return transformer.parse(upstreamData);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('Transform failed:', error.errors);
  }
  throw error;
}
```

---

## Summary

| Step                    | Action                                  |
| ----------------------- | --------------------------------------- |
| 1. Define Schemas       | Create Zod schemas for both sides       |
| 2. Create Mappings      | Map field names between schemas         |
| 3. Build Transformers   | Use Zod `.transform()` for conversion   |
| 4. Map Field Selections | Convert client fields to upstream names |
| 5. Execute & Transform  | Query upstream, transform response      |

---

## Resources

- [Zod Documentation](https://zod.dev/)
- [Zod Codecs (Advanced)](https://zod.dev/codecs)
- [Basic Usage Tutorial](../basic-usage/basic-usage.md)

---

_Bridge the schema gap! 🌉_
