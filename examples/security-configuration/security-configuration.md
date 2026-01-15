# Security Configuration Tutorial

A comprehensive guide to protecting your GraphQL API from malicious queries and preventing access to sensitive data.

---

## Introduction

GraphQL's flexibility is a double-edged sword. While it empowers clients to request exactly what they need, it also opens doors to attacks:

- **Depth attacks**: Infinitely nested queries that overwhelm your server
- **Width attacks**: Queries requesting hundreds of fields at once
- **Sensitive data exposure**: Accidentally exposing internal fields

This tutorial shows you how to use `graphql-query-builder`'s security features to protect your API.

---

## Prerequisites

- Completed the [Basic Usage](../basic-usage/basic-usage.md) tutorial
- Understanding of GraphQL query structure

---

## What You'll Learn

1. Global security configuration
2. Query validation before execution
3. Field sanitization (removing blocked fields)
4. Complexity analysis for rate limiting
5. Role-based field access control

---

## The Threats

### Depth Attack Example

```graphql
query DepthAttack {
  user {
    friends {
      friends {
        friends {
          friends {
            # 100 levels deep...
            # Each level multiplies database queries
          }
        }
      }
    }
  }
}
```

### Width Attack Example

```graphql
query WidthAttack {
  user {
    field1
    field2
    field3
    # ... 500 more fields using aliases
    alias1: email
    alias2: email
    alias3: email
  }
}
```

### Sensitive Data Exposure

```graphql
query SensitiveData {
  user(id: "123") {
    email
    passwordHash # Oops!
    ssn # Oops!
    internalNotes # Oops!
  }
}
```

---

## Step 1: Global Security Configuration

Set security limits that apply to all queries:

```typescript
import { setConfig } from 'graphql-query-builder';

setConfig({
  // Prevent deep nesting
  maxDepth: 8,

  // Limit total fields per query
  maxFields: 50,

  // Block sensitive fields globally
  blockedFields: [
    'password',
    'passwordHash',
    'ssn',
    'socialSecurityNumber',
    'creditCard',
    'secretKey',
    'apiKey',
    'privateKey',
  ],

  upstreamServices: {},
});
```

### Configuration Options

| Option          | Description              | Recommended          |
| --------------- | ------------------------ | -------------------- |
| `maxDepth`      | Maximum nesting levels   | 5-10                 |
| `maxFields`     | Maximum fields per query | 50-100               |
| `blockedFields` | Fields to never allow    | All sensitive fields |

---

## Step 2: Service-Specific Security

Different services may need different security levels:

```typescript
setConfig({
  maxDepth: 10,
  maxFields: 100,
  blockedFields: ['password'],
  upstreamServices: {
    // User service handles sensitive data - strict limits
    userService: {
      endpoint: 'https://users.example.com/graphql',
      maxDepth: 5,
      maxFields: 30,
      blockedFields: ['password', 'ssn', 'dateOfBirth'],
    },

    // Product service is less sensitive - relaxed limits
    productService: {
      endpoint: 'https://products.example.com/graphql',
      maxDepth: 10,
      maxFields: 100,
      blockedFields: ['internalCost', 'supplierPrice'],
    },

    // Analytics service needs deep queries
    analyticsService: {
      endpoint: 'https://analytics.example.com/graphql',
      maxDepth: 15,
      maxFields: 200,
      blockedFields: [],
    },
  },
});
```

---

## Step 3: Validating Queries Before Execution

Always validate queries before sending them upstream:

```typescript
import { extractFieldsFromInfo, validateFieldSelections } from 'graphql-query-builder';
import type { SecurityConfig } from 'graphql-query-builder';

const securityConfig: SecurityConfig = {
  maxDepth: 5,
  maxFields: 50,
  blockedFields: ['password', 'secret'],
  maxAliases: 5,
  maxRootFields: 3,
};

async function secureResolver(parent, args, context, info) {
  // Extract fields
  const extracted = extractFieldsFromInfo(info);

  // Validate against security rules
  const result = validateFieldSelections(extracted.fields, securityConfig);

  if (!result.valid) {
    throw new Error(`Query rejected: ${result.errors.join(', ')}`);
  }

  // Safe to proceed
  return context.dataSources.userService.executeQuery('user', args, info);
}
```

### Validation Result

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[]; // Human-readable error messages
  depth: number; // Actual query depth
  fieldCount: number; // Actual field count
  blockedFieldsFound: string[]; // Any blocked fields detected
}
```

---

## Step 4: Using assertQueryValid (Throws on Failure)

For simpler code, use `assertQueryValid` which throws automatically:

```typescript
import { extractFieldsFromInfo, assertQueryValid } from 'graphql-query-builder';

async function simpleSecureResolver(parent, args, context, info) {
  const extracted = extractFieldsFromInfo(info);

  // Throws QueryValidationError if invalid
  assertQueryValid(extracted.fields, {
    maxDepth: 5,
    maxFields: 50,
    blockedFields: ['password'],
  });

  // If we get here, the query is safe
  return context.dataSources.userService.executeQuery('user', args, info);
}
```

---

## Step 5: Sanitizing Fields (Graceful Handling)

Instead of rejecting queries with blocked fields, you can remove them:

```typescript
import { extractFieldsFromInfo, sanitizeFieldSelections, buildQuery } from 'graphql-query-builder';

async function sanitizingResolver(parent, args, context, info) {
  const extracted = extractFieldsFromInfo(info);

  // Remove blocked fields instead of rejecting
  const sanitized = sanitizeFieldSelections(extracted.fields, [
    'password',
    'secretKey',
    'internalNotes',
  ]);

  console.log(`Removed ${extracted.fields.length - sanitized.length} blocked fields`);

  // Build query with sanitized fields
  const { query, variables } = buildQuery('user', sanitized, {
    variables: { id: args.id },
  });

  return context.dataSources.upstream.query(query, variables);
}
```

### When to Sanitize vs Reject

| Approach              | Use When                                                                   |
| --------------------- | -------------------------------------------------------------------------- |
| **Reject** (validate) | Security is critical, client should know they're requesting forbidden data |
| **Sanitize** (remove) | User experience is priority, silently ignore sensitive fields              |

---

## Step 6: Limiting Query Depth

Truncate deeply nested queries to a maximum depth:

```typescript
import { extractFieldsFromInfo, limitFieldDepth } from 'graphql-query-builder';

async function depthLimitedResolver(parent, args, context, info) {
  const extracted = extractFieldsFromInfo(info);

  // Truncate to 3 levels deep
  const limited = limitFieldDepth(extracted.fields, 3);

  console.log(`Original depth: ${extracted.depth}, Limited to: 3`);

  return buildAndExecute(limited, args);
}
```

Before limiting (depth 5):

```graphql
user { profile { settings { notifications { email { verified } } } } }
```

After limiting to depth 3:

```graphql
user { profile { settings } }
```

---

## Step 7: Complexity Analysis

Calculate query complexity for rate limiting or billing:

```typescript
import { extractFieldsFromInfo, calculateComplexity } from 'graphql-query-builder';

async function complexityAwareResolver(parent, args, context, info) {
  const extracted = extractFieldsFromInfo(info);

  const complexity = calculateComplexity(extracted.fields, {
    fieldCost: 1, // Base cost per field
    listMultiplier: 10, // Multiplier for lists/connections
    maxComplexity: 1000, // Reject if exceeds this
  });

  console.log(`Query complexity: ${complexity}`);

  // Use for rate limiting
  if (complexity > 500) {
    await context.rateLimiter.consume(complexity);
  }

  // Use for billing
  const costInCredits = Math.ceil(complexity / 10);
  await context.billing.charge(costInCredits);

  return executeQuery(extracted, args);
}
```

### Complexity Scoring

| Query Pattern                         | Complexity                    |
| ------------------------------------- | ----------------------------- |
| `user { name }`                       | 1                             |
| `user { name email profile { bio } }` | 4                             |
| `users { edges { node { name } } }`   | 1 × 10 (list multiplier) = 10 |

---

## Step 8: Security Middleware

Create reusable security middleware:

```typescript
import { createSecurityMiddleware } from 'graphql-query-builder';

// Create once at startup
const validateQuery = createSecurityMiddleware({
  maxDepth: 5,
  maxFields: 50,
  blockedFields: ['password', 'ssn'],
  maxAliases: 10,
  maxComplexity: 500,
});

// Use in resolvers
const resolvers = {
  Query: {
    user: async (parent, args, context, info) => {
      const extracted = extractFieldsFromInfo(info);

      // Validate - throws if invalid
      validateQuery(extracted.fields);

      return context.dataSources.userService.executeQuery('user', args, info);
    },

    product: async (parent, args, context, info) => {
      const extracted = extractFieldsFromInfo(info);

      // Same middleware, consistent security
      validateQuery(extracted.fields);

      return context.dataSources.productService.executeQuery('product', args, info);
    },
  },
};
```

---

## Step 9: Field-Level Access Control

Check if specific fields are allowed:

```typescript
import { isFieldAllowed, getBlockedFields } from 'graphql-query-builder';
import type { SecurityConfig } from 'graphql-query-builder';

const securityConfig: SecurityConfig = {
  blockedFields: ['password', 'ssn', '__schema'],
  allowIntrospection: false,
};

// Check individual fields
console.log(isFieldAllowed('email', securityConfig)); // true
console.log(isFieldAllowed('password', securityConfig)); // false
console.log(isFieldAllowed('__schema', securityConfig)); // false

// Get all blocked fields (including auto-added introspection fields)
const blocked = getBlockedFields(securityConfig);
// ['password', 'ssn', '__schema', '__type']
```

---

## Step 10: Role-Based Field Access

Implement different access levels for different users:

```typescript
import { sanitizeFieldSelections, extractFieldsFromInfo } from 'graphql-query-builder';

// Define blocked fields per role
const roleBlockedFields = {
  public: ['email', 'phone', 'addresses', 'paymentMethods', 'orders'],
  user: ['paymentMethods', 'internalNotes'],
  admin: ['internalNotes'],
  superadmin: [],
};

type UserRole = keyof typeof roleBlockedFields;

async function roleAwareResolver(parent, args, context: { userRole: UserRole }, info) {
  const extracted = extractFieldsFromInfo(info);

  // Get blocked fields for this role
  const blocked = roleBlockedFields[context.userRole];

  // Sanitize based on role
  const sanitized = sanitizeFieldSelections(extracted.fields, blocked);

  return buildAndExecute(sanitized, args);
}
```

---

## Complete Security Setup

Here's a production-ready security configuration:

```typescript
import { setConfig, createSecurityMiddleware, extractFieldsFromInfo } from 'graphql-query-builder';

// 1. Global configuration
setConfig({
  maxDepth: 8,
  maxFields: 50,
  blockedFields: [
    // Authentication
    'password',
    'passwordHash',
    'refreshToken',

    // PII
    'ssn',
    'socialSecurityNumber',
    'dateOfBirth',

    // Financial
    'creditCard',
    'bankAccount',

    // Internal
    'internalNotes',
    'debugInfo',
    'secretKey',
  ],
  upstreamServices: {
    userService: {
      endpoint: process.env.USER_SERVICE_URL!,
      maxDepth: 5,
      maxFields: 30,
    },
  },
});

// 2. Create middleware
const validateQuery = createSecurityMiddleware({
  maxDepth: 5,
  maxFields: 50,
  blockedFields: ['password', 'ssn'],
  maxAliases: 10,
  maxComplexity: 500,
});

// 3. Secure resolver wrapper
function createSecureResolver(serviceName: string, rootField: string) {
  return async (parent, args, context, info) => {
    const extracted = extractFieldsFromInfo(info);

    // Validate
    validateQuery(extracted.fields);

    // Execute
    return context.dataSources[serviceName].executeQuery(rootField, args, info);
  };
}

// 4. Use in resolvers
const resolvers = {
  Query: {
    user: createSecureResolver('userService', 'user'),
    product: createSecureResolver('productService', 'product'),
  },
};
```

---

## Security Checklist

- [ ] Set global `maxDepth` (recommended: 5-10)
- [ ] Set global `maxFields` (recommended: 50-100)
- [ ] Block all sensitive fields (`password`, `ssn`, etc.)
- [ ] Configure per-service limits for sensitive services
- [ ] Validate all queries before execution
- [ ] Consider sanitization for better UX
- [ ] Implement complexity-based rate limiting
- [ ] Disable introspection in production
- [ ] Implement role-based access control
- [ ] Log and monitor blocked query attempts

---

## Summary

| Function                     | Purpose                             |
| ---------------------------- | ----------------------------------- |
| `validateFieldSelections()`  | Check if query meets security rules |
| `assertQueryValid()`         | Same, but throws on failure         |
| `sanitizeFieldSelections()`  | Remove blocked fields               |
| `limitFieldDepth()`          | Truncate nested queries             |
| `calculateComplexity()`      | Score query for rate limiting       |
| `createSecurityMiddleware()` | Reusable validation function        |
| `isFieldAllowed()`           | Check individual field access       |

---

## Next Steps

- **[Performance Optimization](../performance-optimization/performance-optimization.md)** - Cache for speed
- **[Schema Mapping](../schema-mapping/schema-mapping.md)** - Transform between schemas

---

_Stay secure! 🔒_
