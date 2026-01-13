/**
 * graphql-query-builder
 *
 * Demo GraphQL Schema for Integration Tests
 *
 * This schema represents a realistic e-commerce domain to demonstrate
 * how the query builder prevents overfetching.
 */

import { buildSubgraphSchema } from '@apollo/subgraph';
import { gql } from 'graphql-tag';

/**
 * Type definitions for our demo e-commerce domain.
 * This schema is intentionally rich to demonstrate the overfetching problem.
 */
export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@external"])

  """
  A user in the e-commerce platform.
  Note: Some fields like 'internalNotes' and 'passwordHash' should never be exposed.
  """
  type User @key(fields: "id") {
    id: ID!
    email: String!
    firstName: String!
    lastName: String!
    fullName: String!
    avatar: String
    createdAt: String!
    updatedAt: String!

    # Nested objects - fetching these when not needed is wasteful
    profile: UserProfile
    preferences: UserPreferences
    addresses: [Address!]!
    paymentMethods: [PaymentMethod!]!

    # Potentially sensitive - should be blocked
    internalNotes: String
    passwordHash: String
  }

  type UserProfile {
    bio: String
    website: String
    socialLinks: [SocialLink!]!
    statistics: UserStatistics
  }

  type UserStatistics {
    totalOrders: Int!
    totalSpent: Float!
    averageOrderValue: Float!
    memberSince: String!
    loyaltyPoints: Int!
  }

  type SocialLink {
    platform: String!
    url: String!
  }

  type UserPreferences {
    newsletter: Boolean!
    notifications: NotificationPreferences!
    currency: String!
    language: String!
    timezone: String!
  }

  type NotificationPreferences {
    email: Boolean!
    push: Boolean!
    sms: Boolean!
    orderUpdates: Boolean!
    promotions: Boolean!
  }

  type Address {
    id: ID!
    label: String
    street1: String!
    street2: String
    city: String!
    state: String!
    postalCode: String!
    country: String!
    isDefault: Boolean!
  }

  type PaymentMethod {
    id: ID!
    type: PaymentType!
    last4: String!
    expiryMonth: Int
    expiryYear: Int
    isDefault: Boolean!
  }

  enum PaymentType {
    CREDIT_CARD
    DEBIT_CARD
    PAYPAL
    BANK_TRANSFER
  }

  """
  A product in the catalog.
  """
  type Product @key(fields: "id") {
    id: ID!
    sku: String!
    name: String!
    slug: String!
    description: String!
    shortDescription: String
    price: Float!
    compareAtPrice: Float
    currency: String!

    # Rich content - expensive to fetch
    images: [ProductImage!]!
    variants: [ProductVariant!]!
    attributes: [ProductAttribute!]!
    categories: [Category!]!
    tags: [String!]!

    # Inventory info
    inventory: InventoryInfo!

    # Ratings and reviews - separate service usually
    rating: Float
    reviewCount: Int
    reviews: [Review!]!

    # SEO data
    seo: SEOData

    # Timestamps
    createdAt: String!
    updatedAt: String!
  }

  type ProductImage {
    id: ID!
    url: String!
    alt: String
    width: Int
    height: Int
    position: Int!
  }

  type ProductVariant {
    id: ID!
    sku: String!
    name: String!
    price: Float!
    compareAtPrice: Float
    inventory: Int!
    attributes: [VariantAttribute!]!
  }

  type VariantAttribute {
    name: String!
    value: String!
  }

  type ProductAttribute {
    name: String!
    value: String!
    unit: String
  }

  type Category {
    id: ID!
    name: String!
    slug: String!
    parent: Category
    children: [Category!]!
  }

  type InventoryInfo {
    quantity: Int!
    reserved: Int!
    available: Int!
    lowStockThreshold: Int!
    isLowStock: Boolean!
    isOutOfStock: Boolean!
  }

  type Review {
    id: ID!
    author: User!
    rating: Int!
    title: String
    body: String!
    createdAt: String!
    helpful: Int!
    verified: Boolean!
  }

  type SEOData {
    title: String
    description: String
    keywords: [String!]
    canonicalUrl: String
    ogImage: String
  }

  """
  An order in the system.
  """
  type Order @key(fields: "id") {
    id: ID!
    orderNumber: String!
    status: OrderStatus!
    customer: User!
    items: [OrderItem!]!
    subtotal: Float!
    tax: Float!
    shipping: Float!
    discount: Float!
    total: Float!
    currency: String!
    shippingAddress: Address!
    billingAddress: Address!
    paymentMethod: PaymentMethod!
    tracking: [TrackingInfo!]
    notes: String
    createdAt: String!
    updatedAt: String!
  }

  enum OrderStatus {
    PENDING
    CONFIRMED
    PROCESSING
    SHIPPED
    DELIVERED
    CANCELLED
    REFUNDED
  }

  type OrderItem {
    id: ID!
    product: Product!
    variant: ProductVariant
    quantity: Int!
    unitPrice: Float!
    totalPrice: Float!
  }

  type TrackingInfo {
    carrier: String!
    trackingNumber: String!
    status: String!
    estimatedDelivery: String
    events: [TrackingEvent!]!
  }

  type TrackingEvent {
    timestamp: String!
    status: String!
    location: String
    description: String
  }

  type Query {
    """
    Fetch a user by ID.
    Demonstrates how overfetching happens when client only needs email but
    resolver fetches entire user object with all nested data.
    """
    user(id: ID!): User

    """
    Fetch a product by ID.
    A product has many nested fields - images, variants, reviews, etc.
    Client might only need name and price.
    """
    product(id: ID!): Product

    """
    Fetch an order by ID.
    Orders have deep nesting - customer, items with products, addresses, etc.
    """
    order(id: ID!): Order

    """
    Search products with pagination.
    """
    products(query: String, categoryId: ID, limit: Int = 20, offset: Int = 0): ProductConnection!

    """
    Get current user (authenticated).
    """
    me: User
  }

  type ProductConnection {
    edges: [ProductEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type ProductEdge {
    node: Product!
    cursor: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type Mutation {
    """
    Update user profile.
    """
    updateProfile(input: UpdateProfileInput!): User!

    """
    Create a new order.
    """
    createOrder(input: CreateOrderInput!): Order!
  }

  input UpdateProfileInput {
    firstName: String
    lastName: String
    bio: String
    website: String
  }

  input CreateOrderInput {
    items: [OrderItemInput!]!
    shippingAddressId: ID!
    billingAddressId: ID!
    paymentMethodId: ID!
  }

  input OrderItemInput {
    productId: ID!
    variantId: ID
    quantity: Int!
  }
`;

/**
 * Mock data for the demo.
 */
export const mockData = {
  users: {
    '1': {
      id: '1',
      email: 'john@example.com',
      firstName: 'John',
      lastName: 'Doe',
      fullName: 'John Doe',
      avatar: 'https://example.com/avatars/john.jpg',
      createdAt: '2023-01-15T10:00:00Z',
      updatedAt: '2024-01-10T15:30:00Z',
      internalNotes: 'VIP customer - handle with care',
      passwordHash: '$2b$10$hashed_password_value',
      profile: {
        bio: 'Software developer and coffee enthusiast',
        website: 'https://johndoe.dev',
        socialLinks: [
          { platform: 'twitter', url: 'https://twitter.com/johndoe' },
          { platform: 'github', url: 'https://github.com/johndoe' },
        ],
        statistics: {
          totalOrders: 47,
          totalSpent: 4523.5,
          averageOrderValue: 96.24,
          memberSince: '2023-01-15',
          loyaltyPoints: 4520,
        },
      },
      preferences: {
        newsletter: true,
        notifications: {
          email: true,
          push: true,
          sms: false,
          orderUpdates: true,
          promotions: false,
        },
        currency: 'USD',
        language: 'en-US',
        timezone: 'America/New_York',
      },
      addresses: [
        {
          id: 'addr-1',
          label: 'Home',
          street1: '123 Main St',
          street2: 'Apt 4B',
          city: 'New York',
          state: 'NY',
          postalCode: '10001',
          country: 'US',
          isDefault: true,
        },
      ],
      paymentMethods: [
        {
          id: 'pm-1',
          type: 'CREDIT_CARD',
          last4: '4242',
          expiryMonth: 12,
          expiryYear: 2025,
          isDefault: true,
        },
      ],
    },
  },
  products: {
    '101': {
      id: '101',
      sku: 'WIDGET-001',
      name: 'Premium Widget',
      slug: 'premium-widget',
      description: 'A high-quality widget for all your widget needs.',
      shortDescription: 'Premium quality widget',
      price: 29.99,
      compareAtPrice: 39.99,
      currency: 'USD',
      images: [
        {
          id: 'img-1',
          url: 'https://example.com/images/widget-1.jpg',
          alt: 'Widget front',
          width: 800,
          height: 600,
          position: 1,
        },
        {
          id: 'img-2',
          url: 'https://example.com/images/widget-2.jpg',
          alt: 'Widget side',
          width: 800,
          height: 600,
          position: 2,
        },
      ],
      variants: [
        {
          id: 'var-1',
          sku: 'WIDGET-001-S',
          name: 'Small',
          price: 29.99,
          compareAtPrice: null,
          inventory: 50,
          attributes: [{ name: 'Size', value: 'S' }],
        },
        {
          id: 'var-2',
          sku: 'WIDGET-001-M',
          name: 'Medium',
          price: 34.99,
          compareAtPrice: null,
          inventory: 30,
          attributes: [{ name: 'Size', value: 'M' }],
        },
      ],
      attributes: [
        { name: 'Material', value: 'Aluminum', unit: null },
        { name: 'Weight', value: '250', unit: 'g' },
      ],
      categories: [{ id: 'cat-1', name: 'Widgets', slug: 'widgets', parent: null, children: [] }],
      tags: ['premium', 'bestseller', 'eco-friendly'],
      inventory: {
        quantity: 80,
        reserved: 5,
        available: 75,
        lowStockThreshold: 20,
        isLowStock: false,
        isOutOfStock: false,
      },
      rating: 4.5,
      reviewCount: 128,
      reviews: [],
      seo: {
        title: 'Premium Widget | Best Widgets Online',
        description: 'Buy our premium widget - highest quality at the best price.',
        keywords: ['widget', 'premium', 'quality'],
        canonicalUrl: 'https://example.com/products/premium-widget',
        ogImage: 'https://example.com/images/widget-og.jpg',
      },
      createdAt: '2023-06-01T08:00:00Z',
      updatedAt: '2024-01-15T12:00:00Z',
    },
  },
};

/**
 * Create resolvers for the schema.
 * These resolvers demonstrate the overfetching problem.
 */
export const resolvers = {
  Query: {
    user: (_: unknown, { id }: { id: string }) => mockData.users[id as keyof typeof mockData.users],
    product: (_: unknown, { id }: { id: string }) =>
      mockData.products[id as keyof typeof mockData.products],
    me: () => mockData.users['1'],
  },
  User: {
    __resolveReference: (reference: { id: string }) =>
      mockData.users[reference.id as keyof typeof mockData.users],
  },
  Product: {
    __resolveReference: (reference: { id: string }) =>
      mockData.products[reference.id as keyof typeof mockData.products],
  },
};

/**
 * Build the executable schema.
 */
export function createSchema() {
  return buildSubgraphSchema({ typeDefs, resolvers });
}
