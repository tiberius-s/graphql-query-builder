/**
 * Validation Example - graphql-query-builder
 *
 * Demonstrates field validation and sanitization
 * to protect against excessive queries and unauthorized field access.
 */

import {
  configure,
  validateFields,
  assertValid,
  sanitizeFields,
  buildQuery,
  type ValidationResult,
} from 'graphql-query-builder';

// Configure validation rules
configure({
  maxDepth: 5,
  maxFields: 50,
  blockedFields: ['passwordHash', 'internalNotes', 'ssn'],
  requiredFields: ['id'],
});

// Example: extracted fields from a GraphQL request
const requestedFields = [
  { name: 'id', path: ['id'], depth: 1 },
  { name: 'name', path: ['name'], depth: 1 },
  { name: 'friends', path: ['friends'], depth: 1 },
  { name: 'id', path: ['friends', 'id'], depth: 2 },
  { name: 'friends', path: ['friends', 'friends'], depth: 2 },
  { name: 'id', path: ['friends', 'friends', 'id'], depth: 3 },
];

// Validate returns detailed results
const validation: ValidationResult = validateFields(requestedFields);

if (!validation.valid) {
  console.log('Validation failed:');
  validation.errors.forEach((err) => console.log(`  - ${err}`));
} else {
  console.log('All fields are valid');
}

// Or use assertValid to throw on invalid input
try {
  assertValid(requestedFields);
  console.log('Validation passed');
} catch (error) {
  if (error instanceof Error) {
    console.log('Validation error:', error.message);
  }
}

// Sanitize fields by removing blocked fields
const sanitized = sanitizeFields(requestedFields);
console.log(`Sanitized from ${requestedFields.length} to ${sanitized.length} fields`);

// Build query with sanitized fields
const { query } = buildQuery('user', sanitized);
console.log(query);

// =============================================================================
// Example: Blocking sensitive fields
// =============================================================================

// Fields that should be blocked
const fieldsWithSensitiveData = [
  { name: 'id', path: ['id'], depth: 1 },
  { name: 'email', path: ['email'], depth: 1 },
  { name: 'passwordHash', path: ['passwordHash'], depth: 1 }, // This is blocked!
];

const sensitiveValidation = validateFields(fieldsWithSensitiveData);
if (!sensitiveValidation.valid) {
  console.log('Blocked field detected:');
  sensitiveValidation.errors.forEach((err) => console.log(`  - ${err}`));
}

// =============================================================================
// Example: Depth limit protection
// =============================================================================

// Configure stricter depth limit
configure({
  maxDepth: 3,
  maxFields: 100,
});

// This query is too deep (depth 4)
const deepFields = [
  { name: 'user', path: ['user'], depth: 1 },
  { name: 'posts', path: ['user', 'posts'], depth: 2 },
  { name: 'comments', path: ['user', 'posts', 'comments'], depth: 3 },
  { name: 'author', path: ['user', 'posts', 'comments', 'author'], depth: 4 }, // Too deep!
];

const depthValidation = validateFields(deepFields);
if (!depthValidation.valid) {
  console.log('Depth limit exceeded:');
  depthValidation.errors.forEach((err) => console.log(`  - ${err}`));
}

// Note: sanitizeFields() does not remove fields that exceed maxDepth/maxFields.
// Use validateFields()/assertValid() to reject those queries.
