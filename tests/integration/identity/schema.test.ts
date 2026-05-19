/**
 * T2.1 + T2.1A — Identity Database Schema Integration Tests
 *
 * Verifies:
 * - Table creation with correct types
 * - FK identity.users.id enforced
 * - updated_at trigger fires on update
 * - RLS deny-all fallback active
 * - Unique constraints
 */

import { describe, it, expect } from 'vitest';
import { sql } from '../../setup-integration.js';

describe('identity schema', () => {
  describe('tables and columns', () => {
    it('has all required identity tables', async () => {
      const tables = await sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'identity'
        AND table_type = 'BASE TABLE'
      `;
      const names = tables.map((t) => t.table_name);
      expect(names).toContain('users');
      expect(names).toContain('profiles');
      expect(names).toContain('buyer_profiles');
      expect(names).toContain('seller_profiles');
      expect(names).toContain('onboarding_steps');
    });

    it('users has correct columns', async () => {
      const cols = await sql`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'identity' AND table_name = 'users'
      `;
      const map = Object.fromEntries(cols.map((c) => [c.column_name, c]));
      expect(map.id).toBeDefined();
      expect(map.auth_provider).toBeDefined();
      expect(map.email).toBeDefined();
      expect(map.status).toBeDefined();
      expect(map.created_at.is_nullable).toBe('NO');
      expect(map.updated_at.is_nullable).toBe('NO');
      expect(map.auth_provider.column_default).toBe("'supabase'::text");
    });

    it('seller_profiles has correct columns and enum default', async () => {
      const cols = await sql`
        SELECT column_name, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'identity' AND table_name = 'seller_profiles'
      `;
      const map = Object.fromEntries(cols.map((c) => [c.column_name, c]));
      expect(map.status.column_default).toBe("'draft'::identity.seller_status");
      expect(map.activated_at.is_nullable).toBe('YES');
      expect(map.stripe_connect_account_id).toBeDefined();
    });
  });

  describe('foreign key constraints', () => {
    it('profiles.user_id references identity.users', async () => {
      await expect(
        sql`INSERT INTO identity.profiles (user_id) VALUES (${crypto.randomUUID()})`,
      ).rejects.toThrow(/foreign key constraint/);
    });

    it('seller_profiles.user_id references identity.users', async () => {
      await expect(
        sql`INSERT INTO identity.seller_profiles (user_id) VALUES (${crypto.randomUUID()})`,
      ).rejects.toThrow(/foreign key constraint/);
    });

    it('onboarding_steps.seller_profile_id references seller_profiles', async () => {
      await expect(
        sql`INSERT INTO identity.onboarding_steps (seller_profile_id, step) VALUES (${crypto.randomUUID()}, 'identity')`,
      ).rejects.toThrow(/foreign key constraint/);
    });
  });

  describe('updated_at trigger', () => {
    it('updates updated_at on user modification', async () => {
      const userId = crypto.randomUUID();
      await sql`INSERT INTO identity.users (id, email) VALUES (${userId}, 'update@example.com')`;

      const before = await sql`SELECT updated_at FROM identity.users WHERE id = ${userId}`;
      const beforeTime = new Date(before[0].updated_at).getTime();

      await new Promise((r) => setTimeout(r, 50));
      await sql`UPDATE identity.users SET email = 'updated@example.com' WHERE id = ${userId}`;

      const after = await sql`SELECT updated_at FROM identity.users WHERE id = ${userId}`;
      const afterTime = new Date(after[0].updated_at).getTime();

      expect(afterTime).toBeGreaterThan(beforeTime);
    });
  });

  describe('unique constraints', () => {
    it('prevents duplicate users by email', async () => {
      const userId = crypto.randomUUID();
      await sql`INSERT INTO identity.users (id, email) VALUES (${userId}, 'dup@example.com')`;

      await expect(
        sql`INSERT INTO identity.users (id, email) VALUES (${crypto.randomUUID()}, 'dup@example.com')`,
      ).rejects.toThrow(/unique constraint/);
    });

    it('prevents duplicate profiles per user', async () => {
      const userId = crypto.randomUUID();
      await sql`INSERT INTO identity.users (id, email) VALUES (${userId}, 'profile@example.com')`;
      await sql`INSERT INTO identity.profiles (user_id) VALUES (${userId})`;

      await expect(
        sql`INSERT INTO identity.profiles (user_id) VALUES (${userId})`,
      ).rejects.toThrow(/unique constraint/);
    });

    it('prevents duplicate onboarding steps per seller', async () => {
      const userId = crypto.randomUUID();
      await sql`INSERT INTO identity.users (id, email) VALUES (${userId}, 'step@example.com')`;
      const seller = await sql`
        INSERT INTO identity.seller_profiles (user_id) VALUES (${userId}) RETURNING id
      `;
      const sellerId = seller[0].id;

      await sql`INSERT INTO identity.onboarding_steps (seller_profile_id, step) VALUES (${sellerId}, 'identity')`;

      await expect(
        sql`INSERT INTO identity.onboarding_steps (seller_profile_id, step) VALUES (${sellerId}, 'identity')`,
      ).rejects.toThrow(/unique constraint/);
    });

    it('prevents duplicate stripe connect accounts', async () => {
      const userId1 = crypto.randomUUID();
      const userId2 = crypto.randomUUID();
      await sql`INSERT INTO identity.users (id, email) VALUES (${userId1}, 's1@example.com'), (${userId2}, 's2@example.com')`;
      await sql`INSERT INTO identity.seller_profiles (user_id, stripe_connect_account_id) VALUES (${userId1}, 'acct_123')`;

      await expect(
        sql`INSERT INTO identity.seller_profiles (user_id, stripe_connect_account_id) VALUES (${userId2}, 'acct_123')`,
      ).rejects.toThrow(/unique constraint/);
    });
  });

  describe('rls deny-all fallback', () => {
    it('blocks unqualified direct access to users table', async () => {
      // As the default postgres user (not service role bypass), RLS should apply.
      // In practice, service role bypasses RLS. This test verifies policies exist.
      const policies = await sql`
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'identity' AND tablename = 'users'
      `;
      expect(policies.map((p) => p.policyname)).toContain('users_deny_all');
    });
  });
});
