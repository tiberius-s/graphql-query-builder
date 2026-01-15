/**
 * Security Configuration Examples - graphql-query-builder
 * 
 * See security-configuration.md for the full tutorial.
 */

import type { GraphQLResolveInfo } from 'graphql';
import {
  extractFieldsFromInfo,
  validateFieldSelections,
  assertQueryValid,
  sanitizeFieldSelections,
  limitFieldDepth,
  calculateComplexity,
  createSecurityMiddleware,
  isFieldAllowed,
  getBlockedFields,
  setConfig,
} from 'graphql-query-builder';
import type { SecurityConfig, FieldSelection } from 'graphql-query-builder';

// Global security configuration
export function configureGlobalSecurity() {
  setConfig({
    maxDepth: 8,
    maxFields: 50,
    blockedFields: ['password', 'passwordHash', 'ssn', 'creditCard', 'secretKey', 'apiKey'],
    upstreamServices: {},
  });
}

// Service-specific security
export function configureServiceSecurity() {
  setConfig({
    maxDepth: 10,
    maxFields: 100,
    blockedFields: ['password'],
    upstreamServices: {
      userService: {
        endpoint: 'https://users.example.com/graphql',
        maxDepth: 5,
        maxFields: 30,
        blockedFields: ['password', 'ssn', 'dateOfBirth'],
      },
      productService: {
        endpoint: 'https://products.example.com/graphql',
        maxDepth: 10,
        maxFields: 100,
        blockedFields: ['internalCost', 'supplierPrice'],
      },
    },
  });
}

// Validate before execution
export function validateBeforeExecution(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);
  const result = validateFieldSelections(extracted.fields, {
    maxDepth: 5,
    maxFields: 50,
    blockedFields: ['password', 'secret'],
    maxAliases: 5,
    maxRootFields: 3,
  } as SecurityConfig);

  if (!result.valid) {
    throw new Error(`Query rejected: ${result.errors.join(', ')}`);
  }
  return extracted;
}

// Assert valid (throws on failure)
export function assertValidQuery(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);
  assertQueryValid(extracted.fields, { maxDepth: 5, maxFields: 50, blockedFields: ['password'] });
  return extracted;
}

// Sanitize fields (remove blocked)
export function sanitizeQuery(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);
  return sanitizeFieldSelections(extracted.fields, ['password', 'secretKey', 'internalNotes']);
}

// Limit query depth
export function limitDepth(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);
  return limitFieldDepth(extracted.fields, 3);
}

// Calculate complexity
export function analyzeComplexity(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);
  const complexity = calculateComplexity(extracted.fields, {
    fieldCost: 1,
    listMultiplier: 10,
    maxComplexity: 1000,
  });
  return { complexity, costInCredits: Math.ceil(complexity / 10) };
}

// Security middleware
export function setupSecurityMiddleware() {
  return createSecurityMiddleware({
    maxDepth: 5,
    maxFields: 50,
    blockedFields: ['password', 'ssn'],
    maxAliases: 10,
    maxComplexity: 500,
  });
}

// Field access control
export function checkFieldAccess() {
  const config: SecurityConfig = {
    blockedFields: ['password', 'ssn', '__schema'],
    allowIntrospection: false,
  };
  return {
    emailAllowed: isFieldAllowed('email', config),
    passwordAllowed: isFieldAllowed('password', config),
    blockedFields: getBlockedFields(config),
  };
}

// Role-based field access
const roleBlockedFields = {
  public: ['email', 'phone', 'addresses', 'paymentMethods', 'orders'],
  user: ['paymentMethods', 'internalNotes'],
  admin: ['internalNotes'],
  superadmin: [],
};

type UserRole = keyof typeof roleBlockedFields;

export function roleAwareResolver(info: GraphQLResolveInfo, userRole: UserRole) {
  const extracted = extractFieldsFromInfo(info);
  return sanitizeFieldSelections(extracted.fields, roleBlockedFields[userRole]);
}

// Secure resolver wrapper
export const secureResolvers = {
  Query: {
    user: async (_: unknown, args: { id: string }, ctx: { upstream: { query: (q: string) => Promise<unknown> } }, info: GraphQLResolveInfo) => {
      const extracted = extractFieldsFromInfo(info);
      const validateQuery = createSecurityMiddleware({ maxDepth: 5, maxFields: 50, blockedFields: ['password'] });
      validateQuery(extracted.fields);
      return { id: args.id };
    },
  },
};
