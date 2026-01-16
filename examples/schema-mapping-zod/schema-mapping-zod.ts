import * as z from 'zod';
import type { GraphQLResolveInfo } from 'graphql';
import { extractFieldsFromInfo, buildQuery } from 'graphql-query-builder';

export const ServiceProfileSchema = z.object({
  bio: z.string(),
  avatarUrl: z.string().url().nullable(),
  location: z.string().nullable(),
});

export type ServiceProfile = z.infer<typeof ServiceProfileSchema>;

export const ServiceUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  profile: ServiceProfileSchema,
  friends: z.array(z.string()),
  createdAt: z.coerce.date(),
  isActive: z.boolean(),
});

export type ServiceUser = z.infer<typeof ServiceUserSchema>;

export const UpstreamProfileSchema = z.object({
  biography: z.string(),
  profileImageUrl: z.string().nullable(),
  userLocation: z.string().nullable(),
});

export type UpstreamProfile = z.infer<typeof UpstreamProfileSchema>;

export const UpstreamUserSchema = z.object({
  id: z.string(),
  emailAddress: z.string(),
  fullName: z.string(),
  userProfile: UpstreamProfileSchema,
  friendIds: z.array(z.string()),
  createdTimestamp: z.string(),
  status: z.enum(['active', 'inactive', 'suspended']),
});

export type UpstreamUser = z.infer<typeof UpstreamUserSchema>;

export const ProfileCodec = z.codec(UpstreamProfileSchema, ServiceProfileSchema, {
  decode: (upstream): ServiceProfile => ({
    bio: upstream.biography,
    avatarUrl: upstream.profileImageUrl,
    location: upstream.userLocation,
  }),

  encode: (service): UpstreamProfile => ({
    biography: service.bio,
    profileImageUrl: service.avatarUrl,
    userLocation: service.location,
  }),
});

export const UserCodec = z.codec(UpstreamUserSchema, ServiceUserSchema, {
  decode: (upstream): ServiceUser => ({
    id: upstream.id,
    email: upstream.emailAddress,
    name: upstream.fullName,
    profile: ProfileCodec.decode(upstream.userProfile),
    friends: upstream.friendIds,
    createdAt: new Date(upstream.createdTimestamp),
    isActive: upstream.status === 'active',
  }),

  encode: (service): UpstreamUser => ({
    id: service.id,
    emailAddress: service.email,
    fullName: service.name,
    userProfile: ProfileCodec.encode(service.profile),
    friendIds: service.friends,
    createdTimestamp: (service.createdAt as Date).toISOString(),
    status: service.isActive ? 'active' : 'inactive',
  }),
});

export const fieldMappings: Record<string, string> = {
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

export interface AppContext {
  dataSources: {
    users: {
      getUserById: (query: string, variables: Record<string, unknown>) => Promise<UpstreamUser>;
      getUsers: (query: string, variables: Record<string, unknown>) => Promise<UpstreamUser[]>;
      updateUser: (mutation: string, variables: Record<string, unknown>) => Promise<UpstreamUser>;
      createUser: (mutation: string, variables: Record<string, unknown>) => Promise<UpstreamUser>;
    };
  };
}

export async function getUser(
  id: string,
  ctx: AppContext,
  info: GraphQLResolveInfo,
): Promise<ServiceUser> {
  const { fields } = extractFieldsFromInfo(info);
  const { query, variables } = buildQuery('user', fields, {
    operationName: 'GetUpstreamUser',
    variables: { id },
    variableTypes: { id: 'ID!' },
    rootArguments: { id: { __variable: 'id' } },
    fieldMappings,
  });
  const upstreamUser = await ctx.dataSources.users.getUserById(query, variables);
  return UserCodec.decode(upstreamUser);
}

export async function getUsers(
  ids: string[],
  ctx: AppContext,
  info: GraphQLResolveInfo,
): Promise<ServiceUser[]> {
  const { fields } = extractFieldsFromInfo(info);
  const { query, variables } = buildQuery('users', fields, {
    operationName: 'GetUpstreamUsers',
    variables: { ids },
    variableTypes: { ids: '[ID!]!' },
    rootArguments: { ids: { __variable: 'ids' } },
    fieldMappings,
  });
  const upstreamUsers = await ctx.dataSources.users.getUsers(query, variables);
  return upstreamUsers.map((upstreamUser) => UserCodec.decode(upstreamUser));
}

export async function updateUser(
  id: string,
  input: Partial<ServiceUser>,
  ctx: AppContext,
  info: GraphQLResolveInfo,
): Promise<ServiceUser> {
  const { fields } = extractFieldsFromInfo(info);

  const serviceUserForEncoding: ServiceUser = {
    id,
    email: input.email ?? '',
    name: input.name ?? '',
    profile: input.profile ?? { bio: '', avatarUrl: null, location: null },
    friends: input.friends ?? [],
    createdAt: input.createdAt ?? new Date(),
    isActive: input.isActive ?? true,
  };
  const upstreamUser = UserCodec.encode(serviceUserForEncoding);

  const upstreamInput: Partial<UpstreamUser> = {};
  if (input.email !== undefined) upstreamInput.emailAddress = upstreamUser.emailAddress;
  if (input.name !== undefined) upstreamInput.fullName = upstreamUser.fullName;
  if (input.profile !== undefined) upstreamInput.userProfile = upstreamUser.userProfile;
  if (input.friends !== undefined) upstreamInput.friendIds = upstreamUser.friendIds;
  if (input.isActive !== undefined) upstreamInput.status = upstreamUser.status;

  const { query: mutation, variables } = buildQuery('updateUser', fields, {
    operationType: 'mutation',
    operationName: 'UpdateUpstreamUser',
    variables: { id, input: upstreamInput },
    variableTypes: { id: 'ID!', input: 'UpdateUserInput!' },
    rootArguments: { id: { __variable: 'id' }, input: { __variable: 'input' } },
    fieldMappings,
  });

  const updatedUpstreamUser = await ctx.dataSources.users.updateUser(mutation, variables);
  return UserCodec.decode(updatedUpstreamUser);
}

export async function createUser(
  input: Omit<ServiceUser, 'id' | 'createdAt'>,
  ctx: AppContext,
  info: GraphQLResolveInfo,
): Promise<ServiceUser> {
  const { fields } = extractFieldsFromInfo(info);

  const serviceUserForEncoding: ServiceUser = {
    id: '',
    ...input,
    createdAt: new Date(),
  };
  const upstreamUser = UserCodec.encode(serviceUserForEncoding);

  const { id: _id, createdTimestamp: _ts, ...upstreamInput } = upstreamUser;

  const { query: mutation, variables } = buildQuery('createUser', fields, {
    operationType: 'mutation',
    operationName: 'CreateUpstreamUser',
    variables: { input: upstreamInput },
    variableTypes: { input: 'CreateUserInput!' },
    rootArguments: { input: { __variable: 'input' } },
    fieldMappings,
  });

  const createdUpstreamUser = await ctx.dataSources.users.createUser(mutation, variables);
  return UserCodec.decode(createdUpstreamUser);
}

export const resolvers = {
  Query: {
    user: (
      _parent: unknown,
      args: { id: string },
      ctx: AppContext,
      info: GraphQLResolveInfo,
    ): Promise<ServiceUser> => getUser(args.id, ctx, info),
    users: (
      _parent: unknown,
      args: { ids: string[] },
      ctx: AppContext,
      info: GraphQLResolveInfo,
    ): Promise<ServiceUser[]> => getUsers(args.ids, ctx, info),
  },
  Mutation: {
    updateUser: (
      _parent: unknown,
      args: { id: string; input: Partial<ServiceUser> },
      ctx: AppContext,
      info: GraphQLResolveInfo,
    ): Promise<ServiceUser> => updateUser(args.id, args.input, ctx, info),
    createUser: (
      _parent: unknown,
      args: { input: Omit<ServiceUser, 'id' | 'createdAt'> },
      ctx: AppContext,
      info: GraphQLResolveInfo,
    ): Promise<ServiceUser> => createUser(args.input, ctx, info),
  },
};

export function createMockUpstreamUser(serviceUser: ServiceUser): UpstreamUser {
  return UserCodec.encode(serviceUser);
}
