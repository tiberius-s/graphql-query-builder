/**
 * graphql-query-builder Examples
 *
 * Security Configuration Examples
 *
 * This file demonstrates how to configure and use the security features
 * to protect against common GraphQL vulnerabilities.
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

// ============================================================================
// Security Configuration
// ============================================================================

/**
 * Example 1: Configure Global Security Settings
 *
 * Set security limits at the package level that apply to all queries.
 */
export function configureGlobalSecurity() {
  setConfig({
    maxDepth: 8, // Prevent deeply nested queries
    maxFields: 50, // Limit total fields per query
    blockedFields: [
      // Sensitive fields to block
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
}

/**
 * Example 2: Service-Specific Security Settings
 *
 * Different services may have different security requirements.
 */
export function configureServiceSecurity() {
  setConfig({
    maxDepth: 10,
    maxFields: 100,
    blockedFields: ['password'],
    upstreamServices: {
      // User service handles sensitive data - stricter limits
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
}

// ============================================================================
// Query Validation
// ============================================================================

/**
 * Example 3: Validate Query Before Execution
 *
 * Check if a query meets security requirements before sending upstream.
 */
export function validateBeforeExecution(info: GraphQLResolveInfo) {
  // Extract fields from client query
  const extracted = extractFieldsFromInfo(info);

  // Define security config
  const securityConfig: SecurityConfig = {
    maxDepth: 5,
    maxFields: 50,
    blockedFields: ['password', 'secret'],
    maxAliases: 5,
    maxRootFields: 3,
  };

  // Validate
  const result = validateFieldSelections(extracted.fields, securityConfig);

  if (!result.valid) {
    console.error('Query validation failed:', result.errors);
    throw new Error(`Query rejected: ${result.errors.join(', ')}`);
  }

  console.log('Query passed security validation');
  return extracted;
}

/**
 * Example 4: Assert Query Valid (Throws on Failure)
 *
 * A simpler pattern that throws automatically on validation failure.
 */
export function assertValidQuery(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);

  // This will throw QueryValidationError if invalid
  assertQueryValid(extracted.fields, {
    maxDepth: 5,
    maxFields: 50,
    blockedFields: ['password'],
  });

  // If we get here, the query is valid
  return extracted;
}

// ============================================================================
// Field Sanitization
// ============================================================================

/**
 * Example 5: Sanitize Fields (Remove Blocked Fields)
 *
 * Instead of rejecting queries with blocked fields, remove them.
 */
export function sanitizeQuery(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);

  // Remove any blocked fields from the selection
  const sanitized = sanitizeFieldSelections(extracted.fields, [
    'password',
    'secretKey',
    'internalNotes',
  ]);

  console.log('Original field count:', extracted.fields.length);
  console.log('Sanitized field count:', sanitized.length);

  return sanitized;
}

/**
 * Example 6: Limit Query Depth
 *
 * Truncate deeply nested queries to a maximum depth.
 */
export function limitDepth(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);

  // Limit to 3 levels deep
  const limited = limitFieldDepth(extracted.fields, 3);

  console.log('Original depth:', extracted.depth);

  return limited;
}

// ============================================================================
// Complexity Analysis
// ============================================================================

/**
 * Example 7: Calculate Query Complexity
 *
 * Compute a complexity score to implement rate limiting or query costing.
 */
export function analyzeComplexity(info: GraphQLResolveInfo) {
  const extracted = extractFieldsFromInfo(info);

  // Calculate complexity with custom costs
  const complexity = calculateComplexity(extracted.fields, {
    fieldCost: 1, // Base cost per field
    listMultiplier: 10, // Multiplier for nested selections (lists)
    maxComplexity: 1000, // Maximum allowed
  });

  console.log(`Query complexity: ${complexity}`);

  // Use for rate limiting
  if (complexity > 500) {
    console.warn('High complexity query detected');
  }

  // Use for query costing/billing
  const costInCredits = Math.ceil(complexity / 10);
  console.log(`Query cost: ${costInCredits} credits`);

  return { complexity, costInCredits };
}

// ============================================================================
// Security Middleware
// ============================================================================

/**
 * Example 8: Create Reusable Security Middleware
 *
 * Create a middleware function that can be used across resolvers.
 */
export function setupSecurityMiddleware() {
  // Create middleware with your security rules
  const validateQuery = createSecurityMiddleware({
    maxDepth: 5,
    maxFields: 50,
    blockedFields: ['password', 'ssn'],
    maxAliases: 10,
    maxComplexity: 500,
  });

  return validateQuery;
}

// Usage in resolvers
export const secureResolvers = {
  Query: {
    user: async (
      _parent: unknown,
      args: { id: string },
      context: { upstream: { query: (q: string) => Promise<unknown> } },
      info: GraphQLResolveInfo,
    ) => {
      // Extract and validate
      const extracted = extractFieldsFromInfo(info);

      // Get the middleware (would typically be created once)
      const validateQuery = createSecurityMiddleware({
        maxDepth: 5,
        maxFields: 50,
        blockedFields: ['password'],
      });

      // Validate - throws if invalid
      validateQuery(extracted.fields);

      // Proceed with query...
      return { id: args.id };
    },
  },
};

// ============================================================================
// Field Access Control
// ============================================================================

/**
 * Example 9: Check Individual Field Access
 *
 * Check if specific fields are allowed before processing.
 */
export function checkFieldAccess() {
  const securityConfig: SecurityConfig = {
    blockedFields: ['password', 'ssn', '__schema'],
    allowIntrospection: false,
  };

  // Check individual fields
  console.log('email allowed:', isFieldAllowed('email', securityConfig)); // true
  console.log('password allowed:', isFieldAllowed('password', securityConfig)); // false
  console.log('__schema allowed:', isFieldAllowed('__schema', securityConfig)); // false

  // Get all blocked fields
  const blocked = getBlockedFields(securityConfig);
  console.log('All blocked fields:', blocked);
  // ['password', 'ssn', '__schema', '__type']

  return blocked;
}

/**
 * Example 10: Role-Based Field Access
 *
 * Different users may have access to different fields.
 */
export function roleBasedAccess(info: GraphQLResolveInfo, userRole: 'admin' | 'manager' | 'user') {
  // Define blocked fields per role
  const blockedByRole: Record<string, string[]> = {
    admin: [], // Admins can see everything
    manager: ['ssn', 'salary', 'performanceReview'],
    user: ['ssn', 'salary', 'performanceReview', 'internalNotes', 'costCenter'],
  };

  const extracted = extractFieldsFromInfo(info);

  // Sanitize based on role
  const sanitized = sanitizeFieldSelections(extracted.fields, blockedByRole[userRole]);

  // Also validate against global limits
  assertQueryValid(sanitized, {
    maxDepth: userRole === 'admin' ? 10 : 5,
    maxFields: userRole === 'admin' ? 100 : 50,
  });

  return sanitized;
}

// ============================================================================
// OWASP Compliance Patterns
// ============================================================================

/**
 * Example 11: OWASP-Compliant Configuration
 *
 * Configuration following OWASP GraphQL Cheat Sheet recommendations.
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/GraphQL_Cheat_Sheet.html
 */
export const owaspCompliantConfig: SecurityConfig = {
  // Denial of Service Prevention
  maxDepth: 10, // Prevent recursive/deeply nested queries
  maxFields: 100, // Limit total fields
  maxAliases: 10, // Prevent alias-based attacks
  maxRootFields: 5, // Limit batch operations
  maxComplexity: 1000, // Query complexity limit

  // Data Exposure Prevention
  blockedFields: [
    // Authentication data
    'password',
    'passwordHash',
    'passwordSalt',
    'resetToken',
    'verificationToken',

    // Personal identifiable information (PII)
    'ssn',
    'socialSecurityNumber',
    'taxId',
    'driversLicense',

    // Financial data
    'creditCard',
    'bankAccount',
    'routingNumber',

    // Security keys
    'apiKey',
    'secretKey',
    'privateKey',
    'encryptionKey',

    // Internal fields
    'internalId',
    'debugInfo',
    'stackTrace',
  ],

  // Introspection Control (disable in production)
  allowIntrospection: process.env.NODE_ENV !== 'production',
  blockedIntrospection: ['__schema', '__type'],

  // Complexity calculation
  fieldCost: 1,
  listMultiplier: 10,
};

/**
 * Example 12: Production Security Setup
 *
 * Complete security setup for production environments.
 */
export function productionSecuritySetup() {
  // Validate environment
  if (process.env.NODE_ENV !== 'production') {
    console.warn('Running production security in non-production environment');
  }

  // Apply OWASP-compliant configuration
  setConfig({
    maxDepth: owaspCompliantConfig.maxDepth,
    maxFields: owaspCompliantConfig.maxFields,
    blockedFields: owaspCompliantConfig.blockedFields,
    upstreamServices: {
      // All services inherit global security settings
      // Add service-specific overrides as needed
    },
  });

  // Create production middleware
  const productionMiddleware = createSecurityMiddleware(owaspCompliantConfig);

  // Return for use in resolvers
  return {
    validate: (fields: FieldSelection[]) => {
      // Log security events in production
      console.log('[SECURITY] Validating query with', fields.length, 'fields');

      try {
        productionMiddleware(fields);
        console.log('[SECURITY] Query passed validation');
      } catch (error) {
        console.error('[SECURITY] Query rejected:', (error as Error).message);
        throw error;
      }
    },
    config: owaspCompliantConfig,
  };
}
