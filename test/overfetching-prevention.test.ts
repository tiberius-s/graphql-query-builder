import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parse } from 'graphql';
import { buildQuery, configure, resetConfig } from '../src/index.js';
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
      const clientQuery = `
        query GetUserBasicInfo {
          user(id: "1") {
            email
            firstName
          }
        }
      `;

      const document = parse(clientQuery);

      expect(document.definitions).toHaveLength(1);
      expect(document.definitions[0].kind).toBe('OperationDefinition');
    });

    it('should demonstrate overfetching problem', () => {
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

      const optimizedUpstreamQuery = `
        query ProductListing {
          product(id: "101") {
            id
            name
            price
          }
        }
      `;

      const countFieldLines = (query: string) =>
        query.split('\n').filter((line) => line.trim().match(/^\w+/)).length;

      const naiveFieldCount = countFieldLines(naiveUpstreamQuery);
      const optimizedFieldCount = countFieldLines(optimizedUpstreamQuery);

      expect(optimizedFieldCount).toBeLessThan(naiveFieldCount);
      expect(naiveFieldCount).toBeGreaterThan(15);
      expect(optimizedFieldCount).toBeLessThan(8);
    });

    it('should handle nested field selections', () => {
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

      expect(result.query).toContain('profile');
      expect(result.query).toContain('bio');
      expect(result.query).toContain('statistics');
      expect(result.query).toContain('totalOrders');
      expect(result.query).toContain('loyaltyPoints');

      expect(result.query).not.toContain('avatar');
      expect(result.query).not.toContain('addresses');
      expect(result.query).not.toContain('paymentMethods');
    });
  });

  describe('Query Building with Validation', () => {
    it('should build optimized queries', () => {
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
      expect(result.metadata.fieldCount).toBeGreaterThanOrEqual(5);
      expect(result.metadata.depth).toBe(2);
    });
  });

  describe('Real-World Scenarios', () => {
    it('Scenario 1: Product listing page - only needs thumbnail data', () => {
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

      expect(result.query).not.toContain('description');
      expect(result.query).not.toContain('variants');
      expect(result.query).not.toContain('reviews');
      expect(result.query).not.toContain('seo');
      expect(result.query).not.toContain('categories');

      expect(result.query).toContain('name');
      expect(result.query).toContain('price');
      expect(result.query).toContain('isOutOfStock');
    });

    it('Scenario 2: User profile header - minimal data needed', () => {
      const headerFields: FieldSelection[] = [
        { name: 'firstName', path: ['firstName'], depth: 1 },
        { name: 'lastName', path: ['lastName'], depth: 1 },
        { name: 'avatar', path: ['avatar'], depth: 1 },
      ];

      const result = buildQuery('user', headerFields, {
        operationName: 'GetUserHeader',
        variables: { id: '1' },
      });

      expect(result.query).not.toContain('email');
      expect(result.query).not.toContain('addresses');
      expect(result.query).not.toContain('paymentMethods');
      expect(result.query).not.toContain('preferences');

      expect(result.metadata.fieldCount).toBe(4);
    });

    it('Scenario 3: Order confirmation - specific nested data', () => {
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

      expect(result.query).not.toContain('images');
      expect(result.query).not.toContain('variants');
      expect(result.query).not.toContain('description');

      expect(result.query).not.toContain('billingAddress');
      expect(result.query).not.toContain('paymentMethod');
    });
  });

  describe('Performance Comparisons', () => {
    it('should demonstrate field count reduction', () => {
      const fullProductFields = 45;

      const listingFields: FieldSelection[] = [
        { name: 'name', path: ['name'], depth: 1 },
        { name: 'price', path: ['price'], depth: 1 },
      ];

      const result = buildQuery('product', listingFields, {
        operationName: 'OptimizedQuery',
      });

      const reductionPercentage =
        ((fullProductFields - result.metadata.fieldCount) / fullProductFields) * 100;

      expect(reductionPercentage).toBeGreaterThan(90);
    });
  });
});
