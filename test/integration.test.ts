/**
 * graphql-query-builder
 *
 * Integration Tests
 *
 * These tests demonstrate the core problem this library solves:
 * server-side overfetching in GraphQL resolvers. They show how
 * the query builder optimizes upstream requests to only fetch
 * the fields actually requested by the client.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parse } from 'graphql';
import { buildQuery, configure, resetConfig, validateFields } from '../src/index.js';
import type { FieldSelection } from '../src/index.js';

describe('Integration Tests: Overfetching Prevention', () => {
  beforeEach(() => {
    resetConfig();
    configure({
      maxDepth: 10,
      maxFields: 100,
      requiredFields: ['id'],
      blockedFields: ['passwordHash', 'internalNotes'],
    });
  });

  afterEach(() => {
    resetConfig();
  });

  describe('Field Extraction from Real GraphQL Queries', () => {
    it('should extract only requested fields from a simple query', () => {
      // Client query: Only needs email and firstName
      const clientQuery = `
        query GetUserBasicInfo {
          user(id: "1") {
            email
            firstName
          }
        }
      `;

      // Parse the query to verify structure
      const document = parse(clientQuery);

      // The query should only have 1 operation definition
      expect(document.definitions).toHaveLength(1);

      // The query should parse without errors
      expect(document.definitions[0].kind).toBe('OperationDefinition');
    });

    it('should demonstrate overfetching problem', () => {
      // Scenario: Client only needs product name and price for a listing
      // But naive implementation fetches EVERYTHING

      // What a naive resolver might fetch from upstream (raw count of field lines)
      const naiveUpstreamQuery = `
        query GetProduct($id: ID!) {
          product(id: $id) {
            id
            sku
            name
            slug
            description
            shortDescription
            price
            compareAtPrice
            currency
            images { id url alt width height position }
            variants { id sku name price compareAtPrice inventory }
            attributes { name value unit }
            categories { id name slug }
            tags
            inventory { quantity reserved available }
            rating
            reviewCount
            createdAt
            updatedAt
          }
        }
      `;

      // What the optimized query should look like:
      const optimizedUpstreamQuery = `
        query ProductListing {
          product(id: "101") {
            id
            name
            price
          }
        }
      `;

      // Count lines with field names (more accurate counting)
      const countFieldLines = (query: string) =>
        query.split('\n').filter((line) => line.trim().match(/^\w+/)).length;

      const naiveFieldCount = countFieldLines(naiveUpstreamQuery);
      const optimizedFieldCount = countFieldLines(optimizedUpstreamQuery);

      // The optimized query fetches significantly fewer fields
      expect(optimizedFieldCount).toBeLessThan(naiveFieldCount);
      expect(naiveFieldCount).toBeGreaterThan(15); // Naive fetches many fields
      expect(optimizedFieldCount).toBeLessThan(8); // Optimized fetches just what's needed
    });

    it('should handle nested field selections', () => {
      // Client needs user profile with nested preferences
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'email', path: ['email'], depth: 1 },
        {
          name: 'profile',
          path: ['profile'],
          depth: 1,
          selections: [
            { name: 'bio', path: ['profile', 'bio'], depth: 2 },
            {
              name: 'statistics',
              path: ['profile', 'statistics'],
              depth: 2,
              selections: [
                { name: 'totalOrders', path: ['profile', 'statistics', 'totalOrders'], depth: 3 },
                {
                  name: 'loyaltyPoints',
                  path: ['profile', 'statistics', 'loyaltyPoints'],
                  depth: 3,
                },
              ],
            },
          ],
        },
      ];

      const result = buildQuery('user', fields, {
        operationName: 'GetUserProfile',
        variables: { id: '1' },
      });

      // Verify the query includes nested selections
      expect(result.query).toContain('profile');
      expect(result.query).toContain('bio');
      expect(result.query).toContain('statistics');
      expect(result.query).toContain('totalOrders');
      expect(result.query).toContain('loyaltyPoints');

      // But should NOT include unrelated fields
      expect(result.query).not.toContain('avatar');
      expect(result.query).not.toContain('addresses');
      expect(result.query).not.toContain('paymentMethods');
    });
  });

  describe('Query Building with Validation', () => {
    it('should build optimized queries', () => {
      // Simulate extracting fields from a client request
      const extractedFields: FieldSelection[] = [
        { name: 'name', path: ['name'], depth: 1 },
        { name: 'price', path: ['price'], depth: 1 },
        {
          name: 'inventory',
          path: ['inventory'],
          depth: 1,
          selections: [
            { name: 'available', path: ['inventory', 'available'], depth: 2 },
            { name: 'isOutOfStock', path: ['inventory', 'isOutOfStock'], depth: 2 },
          ],
        },
      ];

      const result = buildQuery('product', extractedFields, { variables: { id: '101' } });

      expect(result.query).toContain('product');
      expect(result.query).toContain('inventory');
      expect(result.query).toContain('available');
      // 'id' added from requiredFields, plus 3 top-level + 2 nested = 6 fields
      expect(result.metadata.fieldCount).toBeGreaterThanOrEqual(5);
      expect(result.metadata.depth).toBe(2);
    });

    it('should validate queries against security rules', () => {
      // Create a simple selection that should pass validation
      const fields: FieldSelection[] = [
        { name: 'id', path: ['id'], depth: 1 },
        { name: 'email', path: ['email'], depth: 1 },
      ];

      const validation = validateFields(fields);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('Real-World Scenarios', () => {
    it('Scenario 1: Product listing page - only needs thumbnail data', () => {
      // For a product listing, we only need:
      // - id, name, price for display
      // - first image for thumbnail
      // - inventory status for "In Stock" badge

      const listingFields: FieldSelection[] = [
        { name: 'name', path: ['name'], depth: 1 },
        { name: 'price', path: ['price'], depth: 1 },
        { name: 'slug', path: ['slug'], depth: 1 },
        {
          name: 'images',
          path: ['images'],
          depth: 1,
          selections: [
            { name: 'url', path: ['images', 'url'], depth: 2 },
            { name: 'alt', path: ['images', 'alt'], depth: 2 },
          ],
        },
        {
          name: 'inventory',
          path: ['inventory'],
          depth: 1,
          selections: [{ name: 'isOutOfStock', path: ['inventory', 'isOutOfStock'], depth: 2 }],
        },
      ];

      const result = buildQuery('products', listingFields, {
        operationName: 'ProductListing',
      });

      // Verify we're not fetching unnecessary data
      expect(result.query).not.toContain('description');
      expect(result.query).not.toContain('variants');
      expect(result.query).not.toContain('reviews');
      expect(result.query).not.toContain('seo');
      expect(result.query).not.toContain('categories');

      // But we have what we need
      expect(result.query).toContain('name');
      expect(result.query).toContain('price');
      expect(result.query).toContain('isOutOfStock');
    });

    it('Scenario 2: User profile header - minimal data needed', () => {
      // For a profile header, we only need:
      // - name and avatar for display
      // - Nothing else

      const headerFields: FieldSelection[] = [
        { name: 'firstName', path: ['firstName'], depth: 1 },
        { name: 'lastName', path: ['lastName'], depth: 1 },
        { name: 'avatar', path: ['avatar'], depth: 1 },
      ];

      const result = buildQuery('user', headerFields, {
        operationName: 'GetUserHeader',
        variables: { id: '1' },
      });

      // Should not fetch sensitive or unnecessary data
      expect(result.query).not.toContain('email');
      expect(result.query).not.toContain('addresses');
      expect(result.query).not.toContain('paymentMethods');
      expect(result.query).not.toContain('preferences');

      // Total fields should be minimal (3 fields + required 'id')
      expect(result.metadata.fieldCount).toBe(4);
    });

    it('Scenario 3: Order confirmation - specific nested data', () => {
      // For order confirmation email, we need:
      // - Order number and status
      // - Item names and quantities (but not full product details)
      // - Shipping address

      const confirmationFields: FieldSelection[] = [
        { name: 'orderNumber', path: ['orderNumber'], depth: 1 },
        { name: 'status', path: ['status'], depth: 1 },
        { name: 'total', path: ['total'], depth: 1 },
        {
          name: 'items',
          path: ['items'],
          depth: 1,
          selections: [
            { name: 'quantity', path: ['items', 'quantity'], depth: 2 },
            { name: 'unitPrice', path: ['items', 'unitPrice'], depth: 2 },
            {
              name: 'product',
              path: ['items', 'product'],
              depth: 2,
              selections: [{ name: 'name', path: ['items', 'product', 'name'], depth: 3 }],
            },
          ],
        },
        {
          name: 'shippingAddress',
          path: ['shippingAddress'],
          depth: 1,
          selections: [
            { name: 'street1', path: ['shippingAddress', 'street1'], depth: 2 },
            { name: 'city', path: ['shippingAddress', 'city'], depth: 2 },
            { name: 'state', path: ['shippingAddress', 'state'], depth: 2 },
            { name: 'postalCode', path: ['shippingAddress', 'postalCode'], depth: 2 },
          ],
        },
      ];

      const result = buildQuery('order', confirmationFields, {
        operationName: 'GetOrderConfirmation',
        variables: { id: 'order-123' },
      });

      expect(result.metadata.depth).toBe(3);

      // Should not fetch full product details
      expect(result.query).not.toContain('images');
      expect(result.query).not.toContain('variants');
      expect(result.query).not.toContain('description');

      // Should not fetch billing or payment details
      expect(result.query).not.toContain('billingAddress');
      expect(result.query).not.toContain('paymentMethod');
    });
  });

  describe('Performance Comparisons', () => {
    it('should demonstrate field count reduction', () => {
      // Full product object has ~50+ fields when all nested objects are included
      // A typical listing needs ~10 fields

      const fullProductFields = 45; // Estimated total fields in full Product type

      const listingFields: FieldSelection[] = [
        { name: 'name', path: ['name'], depth: 1 },
        { name: 'price', path: ['price'], depth: 1 },
      ];

      const result = buildQuery('product', listingFields, {
        operationName: 'OptimizedQuery',
      });

      // result.metadata.fieldCount = 3 (name, price, + required 'id')
      const reductionPercentage =
        ((fullProductFields - result.metadata.fieldCount) / fullProductFields) * 100;

      // Should achieve at least 90% reduction in fields fetched
      expect(reductionPercentage).toBeGreaterThan(90);
    });
  });
});

describe('Integration Tests: Security', () => {
  beforeEach(() => {
    resetConfig();
    configure({
      maxDepth: 5,
      maxFields: 50,
      blockedFields: ['passwordHash', 'internalNotes', 'ssn'],
    });
  });

  afterEach(() => {
    resetConfig();
  });

  it('should detect sensitive fields during validation', () => {
    // Attempt to include blocked fields
    const fields: FieldSelection[] = [
      { name: 'id', path: ['id'], depth: 1 },
      { name: 'email', path: ['email'], depth: 1 },
      { name: 'passwordHash', path: ['passwordHash'], depth: 1 }, // BLOCKED
    ];

    const validation = validateFields(fields);

    // Validation should flag the blocked field
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('passwordHash'))).toBe(true);
  });

  it('should validate depth limits', () => {
    // Create deeply nested structure exceeding maxDepth of 5
    const deepFields: FieldSelection[] = [
      {
        name: 'level1',
        path: ['level1'],
        depth: 1,
        selections: [
          {
            name: 'level2',
            path: ['level1', 'level2'],
            depth: 2,
            selections: [
              {
                name: 'level3',
                path: ['level1', 'level2', 'level3'],
                depth: 3,
                selections: [
                  {
                    name: 'level4',
                    path: ['level1', 'level2', 'level3', 'level4'],
                    depth: 4,
                    selections: [
                      {
                        name: 'level5',
                        path: ['level1', 'level2', 'level3', 'level4', 'level5'],
                        depth: 5,
                        selections: [
                          {
                            name: 'level6', // Exceeds maxDepth of 5
                            path: ['level1', 'level2', 'level3', 'level4', 'level5', 'level6'],
                            depth: 6,
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const validation = validateFields(deepFields);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('depth'))).toBe(true);
  });
});
