# Integration Test Scenarios

The integration tests are organized by scenario to keep test files focused and maintainable.

## Scenario Files

### [overfetching-prevention.test.ts](overfetching-prevention.test.ts)

Core scenario tests demonstrating the library's primary benefit: preventing overfetching in GraphQL resolvers.

**Tests:**

- Field extraction from real GraphQL queries
- Query building with optimization
- Real-world scenarios (product listings, user profiles, order confirmations)
- Performance comparisons

### [security.test.ts](security.test.ts)

Security validation tests ensuring blocked fields and depth limits are enforced.

**Tests:**

- Sensitive field detection
- Depth limit validation

### [schema-mapping-zod.test.ts](schema-mapping-zod.test.ts)

Schema mapping integration tests showing bidirectional data transformation with Zod codecs.

**Tests:**

- Codec encode/decode transformations
- Field mapping for query building
- Mutation encoding/decoding flows

## Running Tests

Run all integration tests:

```bash
npm run test:ci
```

Run tests in watch mode:

```bash
npm test
```

## Adding New Scenarios

1. Create a new file: `test/scenarios/your-scenario.test.ts`
2. Import it in `test/integration.test.ts`
3. Write focused describe blocks for your scenario
