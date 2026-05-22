/**
 * RLS Integration Tests
 *
 * Verifies that Row-Level Security policies actually block
 * direct access for non-service-role users.
 */

import { describe, it, expect } from 'vitest';
import { sql } from '../../setup-integration.js';

describe('identity RLS policies', () => {
  it('blocks direct SELECT on users for non-service role', async () => {
    // Create a test role that does NOT bypass RLS
    const testRole = `test_rls_user_${crypto.randomUUID().replace(/-/g, '_')}`;
    await sql`CREATE ROLE ${sql(testRole)} LOGIN PASSWORD 'testpass'`;
    await sql`GRANT USAGE ON SCHEMA identity TO ${sql(testRole)}`;

    try {
      // Attempt to read from users table as the test role
      // Must use a transaction so SET LOCAL ROLE affects the same connection
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE ${sql(testRole)}`;
        await tx`SELECT COUNT(*) FROM identity.users`;
      });
      // If we get here without error, RLS is not working
      expect(true).toBe(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Expected: permission denied or policy violation
      expect(message).toMatch(/permission denied|row-level security|policy/);
    } finally {
      await sql`REASSIGN OWNED BY ${sql(testRole)} TO postgres`;
      await sql`DROP OWNED BY ${sql(testRole)}`;
      await sql`DROP ROLE IF EXISTS ${sql(testRole)}`;
    }
  });

  it('blocks direct INSERT on users for non-service role', async () => {
    const testRole = `test_rls_user_${crypto.randomUUID().replace(/-/g, '_')}`;
    await sql`CREATE ROLE ${sql(testRole)} LOGIN PASSWORD 'testpass'`;
    await sql`GRANT USAGE ON SCHEMA identity TO ${sql(testRole)}`;

    try {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE ${sql(testRole)}`;
        await tx`INSERT INTO identity.users (id, email) VALUES (${crypto.randomUUID()}, 'rls@test.com')`;
      });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toMatch(/permission denied|row-level security|policy/);
    } finally {
      await sql`REASSIGN OWNED BY ${sql(testRole)} TO postgres`;
      await sql`DROP OWNED BY ${sql(testRole)}`;
      await sql`DROP ROLE IF EXISTS ${sql(testRole)}`;
    }
  });

  it('blocks direct SELECT on seller_profiles for non-service role', async () => {
    const testRole = `test_rls_user_${crypto.randomUUID().replace(/-/g, '_')}`;
    await sql`CREATE ROLE ${sql(testRole)} LOGIN PASSWORD 'testpass'`;
    await sql`GRANT USAGE ON SCHEMA identity TO ${sql(testRole)}`;

    try {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE ${sql(testRole)}`;
        await tx`SELECT COUNT(*) FROM identity.seller_profiles`;
      });
      expect(true).toBe(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toMatch(/permission denied|row-level security|policy/);
    } finally {
      await sql`REASSIGN OWNED BY ${sql(testRole)} TO postgres`;
      await sql`DROP OWNED BY ${sql(testRole)}`;
      await sql`DROP ROLE IF EXISTS ${sql(testRole)}`;
    }
  });

  it('allows service role to access all tables', async () => {
    // The test connection is the service role (postgres owner)
    const userId = crypto.randomUUID();
    await sql`INSERT INTO identity.users (id, email) VALUES (${userId}, 'service@test.com')`;

    const result = await sql`SELECT id FROM identity.users WHERE id = ${userId}`;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(userId);
  });
});
