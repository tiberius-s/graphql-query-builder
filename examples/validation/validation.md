# Validation

This guide explains how to validate field selections and protect against excessive or malicious queries.

## Why Validate?

GraphQL's flexibility allows clients to request deeply nested or very wide queries that can overwhelm your upstream service:

```graphql
# Deeply nested - potential DoS
query {
  user {
    friends {
      friends {
        friends {
          friends { ... }
        }
      }
    }
  }
}

# Sensitive fields - data leak risk
query {
  user {
    email
    passwordHash  # Should never be exposed!
    ssn
  }
}
```

## Step 1: Configure Validation Rules

```typescript
import { configure } from 'graphql-query-builder';

configure({
  maxDepth: 5, // Maximum nesting depth
  maxFields: 50, // Maximum fields per query
  blockedFields: ['passwordHash', 'internalNotes', 'ssn'],
  requiredFields: ['id'],
});
```

## Step 2: Validate Fields

```typescript
import { validateFields, type ValidationResult } from 'graphql-query-builder';

const fields = [
  { name: 'id', path: ['id'], depth: 1 },
  { name: 'email', path: ['email'], depth: 1 },
  { name: 'passwordHash', path: ['passwordHash'], depth: 1 },
];

const validation: ValidationResult = validateFields(fields);

if (!validation.valid) {
  console.log('Validation failed:');
  validation.errors.forEach((err) => console.log(`  - ${err}`));
  // Output: - Field "passwordHash" is blocked
}
```

## Using assertValid

Throw an exception instead of checking the result:

```typescript
import { assertValid, QueryValidationError } from 'graphql-query-builder';

try {
  assertValid(fields);
  console.log('Validation passed');
} catch (error) {
  if (error instanceof QueryValidationError) {
    console.log('Validation errors:', error.errors);
  }
}
```

## Sanitizing Fields

Remove invalid fields instead of rejecting the query:

```typescript
import { sanitizeFields } from 'graphql-query-builder';

const requestedFields = [
  { name: 'id', path: ['id'], depth: 1 },
  { name: 'email', path: ['email'], depth: 1 },
  { name: 'passwordHash', path: ['passwordHash'], depth: 1 },
];

const sanitized = sanitizeFields(requestedFields);
// sanitized only contains 'id' and 'email'
```

## Depth Validation

Prevent deeply nested queries:

```typescript
configure({
  maxDepth: 3,
});

const deepFields = [
  { name: 'user', path: ['user'], depth: 1 },
  { name: 'posts', path: ['user', 'posts'], depth: 2 },
  { name: 'comments', path: ['user', 'posts', 'comments'], depth: 3 },
  { name: 'author', path: ['user', 'posts', 'comments', 'author'], depth: 4 },
];

const validation = validateFields(deepFields);
// validation.valid === false
// validation.errors includes "Depth 4 exceeds maximum of 3"
```

## Field Count Validation

Prevent excessively wide queries:

```typescript
configure({
  maxFields: 10,
});

// A query requesting 15 fields will fail validation
```

## Override Validation Options

Override global configuration for specific validations:

```typescript
// Global config allows 50 fields
configure({ maxFields: 50 });

// Override for this specific validation
const validation = validateFields(fields, {
  maxFields: 5, // Stricter limit
  blockedFields: ['secret', 'internal'],
});
```

## Complete Resolver Example

```typescript
import {
  configure,
  extractFieldsFromInfo,
  validateFields,
  sanitizeFields,
  buildQueryCached,
} from 'graphql-query-builder';

// Configure at startup
configure({
  maxDepth: 5,
  maxFields: 50,
  blockedFields: ['passwordHash', 'internalNotes'],
  requiredFields: ['id'],
});

const userResolver = async (_parent, args, context, info) => {
  // Extract fields
  const { fields } = extractFieldsFromInfo(info);

  // Option 1: Reject invalid queries
  const validation = validateFields(fields);
  if (!validation.valid) {
    throw new Error(`Invalid query: ${validation.errors.join(', ')}`);
  }

  // Option 2: Sanitize and continue
  // const safeFields = sanitizeFields(fields);

  // Build and execute query
  const { query, variables } = buildQueryCached('user', fields, {
    variables: { id: args.id },
  });

  return context.upstream.query(query, variables);
};
```

## Validation Error Messages

The validation result includes descriptive error messages:

```typescript
const validation = validateFields(fields);
if (!validation.valid) {
  validation.errors.forEach((error) => {
    // "Field "passwordHash" is blocked"
    // "Depth 6 exceeds maximum of 5"
    // "Field count 75 exceeds maximum of 50"
  });
}
```

## Next Steps

- [Basic Usage](./basic-usage.md) - Core workflow
- [Caching](./caching.md) - Performance optimization
