/**
 * graphql-query-builder
 *
 * Unit tests for the types module.
 */

import { describe, expect, it } from 'vitest';
import { isFieldNode } from './types.js';

describe('Types Module', () => {
  describe('isFieldNode', () => {
    it('should return true for FieldNode', () => {
      const fieldNode = { kind: 'Field' as const, name: { kind: 'Name' as const, value: 'test' } };

      expect(isFieldNode(fieldNode)).toBe(true);
    });

    it('should return false for non-FieldNode', () => {
      const fragmentSpread = {
        kind: 'FragmentSpread' as const,
        name: { kind: 'Name' as const, value: 'test' },
      };

      expect(isFieldNode(fragmentSpread as any)).toBe(false);
    });

    it('should return false for InlineFragment', () => {
      const inlineFragment = {
        kind: 'InlineFragment' as const,
        selectionSet: { kind: 'SelectionSet' as const, selections: [] },
      };

      expect(isFieldNode(inlineFragment as any)).toBe(false);
    });
  });
});
