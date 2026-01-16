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

import './overfetching-prevention.test.js';
import './security.test.js';
import './schema-mapping-zod.test.js';
