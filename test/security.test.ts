import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { configure, resetConfig, validateFields } from '../src/index.js';
import type { FieldSelection } from '../src/index.js';

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
    const fields: FieldSelection[] = [
      { name: 'id', path: ['id'], depth: 1 },
      { name: 'email', path: ['email'], depth: 1 },
      { name: 'passwordHash', path: ['passwordHash'], depth: 1 },
    ];

    const validation = validateFields(fields);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('passwordHash'))).toBe(true);
  });

  it('should validate depth limits', () => {
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
                            name: 'level6',
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
