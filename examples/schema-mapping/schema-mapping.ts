/**
 * Schema Mapping Example
 *
 * Demonstrates translating between service and upstream schemas
 * using Zod codecs for bidirectional transformation.
 */

import type { GraphQLResolveInfo } from 'graphql';
import { z } from 'zod';
import { extractFieldsFromInfo, buildQuery, type FieldSelection } from 'graphql-query-builder';

// ============================================================================
// Domain: Service Schema (what your GraphQL API exposes)
// ============================================================================

/** Service schema user type - client-facing field names */
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

// ============================================================================
// Domain: Upstream Schema (what the upstream service uses)
// ============================================================================

/** Upstream schema user type - different field names */
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

// ============================================================================
// Schema Mapper: Bidirectional Transformation with Zod
// ============================================================================

/**
 * Field name mappings between service and upstream schemas.
 * Maps service field names to upstream field names.
 */
export const userFieldMappings = {
  emailAddress: 'email',
  displayName: 'full_name',
  profilePicture: 'avatar_url',
  memberSince: 'created_at',
  accountTier: 'subscription_level',
  'contactInfo.phoneNumber': 'contact.phone',
  'contactInfo.preferredContact': 'contact.preferred_method',
} as const;

/** Reverse mapping: upstream to service */
export const reverseUserFieldMappings = Object.fromEntries(
  Object.entries(userFieldMappings).map(([k, v]) => [v, k]),
) as Record<string, string>;

/**
 * Transforms upstream user response to service schema using Zod.
 */
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

/**
 * Transforms service input to upstream schema using Zod.
 */
export const serviceToUpstreamInput = z
  .object({
    emailAddress: z.string().optional(),
    displayName: z.string().optional(),
    profilePicture: z.string().nullable().optional(),
    accountTier: z.enum(['free', 'pro', 'enterprise']).optional(),
    contactInfo: z
      .object({
        phoneNumber: z.string().nullable().optional(),
        preferredContact: z.enum(['email', 'phone', 'sms']).optional(),
      })
      .optional(),
  })
  .transform((service) => ({
    ...(service.emailAddress && { email: service.emailAddress }),
    ...(service.displayName && { full_name: service.displayName }),
    ...(service.profilePicture !== undefined && { avatar_url: service.profilePicture }),
    ...(service.accountTier && { subscription_level: service.accountTier.toUpperCase() }),
    ...(service.contactInfo && {
      contact: {
        ...(service.contactInfo.phoneNumber !== undefined && {
          phone: service.contactInfo.phoneNumber,
        }),
        ...(service.contactInfo.preferredContact && {
          preferred_method: service.contactInfo.preferredContact.toUpperCase(),
        }),
      },
    }),
  }));

// ============================================================================
// Field Mapper: Transform field selections
// ============================================================================

/**
 * Maps service field selections to upstream field names.
 */
export function mapFieldsToUpstream(
  fields: FieldSelection[],
  mappings: Record<string, string>,
  parentPath = '',
): FieldSelection[] {
  return fields.map((field) => {
    const fullPath = parentPath ? `${parentPath}.${field.name}` : field.name;
    const mappedName = mappings[fullPath] || mappings[field.name] || field.name;
    const upstreamName = mappedName.includes('.') ? mappedName.split('.').pop()! : mappedName;

    return {
      ...field,
      name: upstreamName,
      path: field.path.map((p, i) => (i === field.path.length - 1 ? upstreamName : p)),
      selections: field.selections
        ? mapFieldsToUpstream(field.selections, mappings, fullPath)
        : undefined,
    };
  });
}

// ============================================================================
// Schema Mapping Data Source
// ============================================================================

export interface SchemaMappingConfig<TService, TUpstream> {
  fieldMappings: Record<string, string>;
  responseTransformer: z.ZodType<TService, z.ZodTypeDef, TUpstream>;
  inputTransformer?: z.ZodType<Record<string, unknown>, z.ZodTypeDef, Partial<TService>>;
}

/**
 * Creates a schema-mapping resolver that handles the full workflow:
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

    // Step 2: Map field names to upstream schema
    const mappedFields = mapFieldsToUpstream(extracted.fields, config.fieldMappings);

    // Step 3: Build upstream query with mapped fields
    const { query, variables: queryVars } = buildQuery(rootField, mappedFields, {
      operationName: `Upstream_${rootField}`,
      variables,
      fieldMappings: config.fieldMappings,
    });

    // Step 4: Execute upstream query
    const upstreamResponse = await upstreamFetch(query, queryVars);

    // Step 5: Transform response to service schema
    return config.responseTransformer.parse(upstreamResponse);
  };
}

// ============================================================================
// Usage Example
// ============================================================================

/** Example upstream service mock */
async function mockUpstreamFetch(
  _query: string,
  variables: Record<string, unknown>,
): Promise<UpstreamUser> {
  return {
    id: variables.id as string,
    email: 'jane.doe@example.com',
    full_name: 'Jane Doe',
    avatar_url: 'https://example.com/avatars/jane.jpg',
    created_at: '2024-01-15T10:30:00Z',
    subscription_level: 'PRO',
    contact: {
      phone: '+1-555-0123',
      preferred_method: 'EMAIL',
    },
  };
}

/** Create resolver with schema mapping */
export const getUserWithMapping = createMappedResolver<ServiceUser, UpstreamUser>(
  {
    fieldMappings: userFieldMappings,
    responseTransformer: upstreamToServiceUser,
    inputTransformer: serviceToUpstreamInput,
  },
  mockUpstreamFetch,
);

/** Example resolver usage */
export const resolvers = {
  Query: {
    user: async (
      _parent: unknown,
      args: { id: string },
      _context: unknown,
      info: GraphQLResolveInfo,
    ): Promise<ServiceUser> => {
      return getUserWithMapping('user', { id: args.id }, info);
    },
  },
};
