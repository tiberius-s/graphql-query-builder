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
  allowedRootFields: ['user', 'product', 'order'],
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
  console.log('Validation error:', error.message);
}

// Sanitize fields by removing those exceeding depth limits
const sanitized = sanitizeFields(requestedFields);
console.log(`Sanitized from ${requestedFields.length} to ${sanitized.length} fields`);

// Build query with sanitized fields
const { query } = buildQuery('user', sanitized);
console.log(query);

// Example: blocking unauthorized root fields
const attemptedFields = [
  { name: 'id', path: ['id'], depth: 1 },
  { name: 'email', path: ['email'], depth: 1 },
];

// This will fail validation with current config
// because 'admin' is not in allowedRootFields
configure({
  maxDepth: 5,
  allowedRootFields: ['user', 'product'],
});

// You would check this in your resolver:
// const isAllowed = config.allowedRootFields?.includes(requestedRootField);
