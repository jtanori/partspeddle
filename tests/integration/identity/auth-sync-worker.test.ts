/**
 * Auth Sync Worker Integration Tests
 *
 * Verifies the auth sync processor handles webhook events correctly:
 * - user.created → creates user + profile
 * - user.updated → updates email
 * - user.deleted → soft-deletes user
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from '../../setup-integration.js';
import { authSyncProcessor } from '../../../src/identity/queue/auth-sync-worker.js';
import type { Job } from 'bullmq';
import type { JobPayload } from '../../../src/shared/queue/worker-factory.js';

function createJob(overrides: Partial<JobPayload['data']> = {}): Job<JobPayload> {
  return {
    id: 'job-1',
    data: {
      data: {
        eventType: 'user.created',
        userId: crypto.randomUUID(),
        email: 'test@example.com',
        ...overrides,
      },
      metadata: {
        correlationId: 'corr-1',
        actorId: 'system:webhook',
        attempt: 1,
        enqueuedAt: new Date().toISOString(),
      },
    },
  } as unknown as Job<JobPayload>;
}

describe('Auth Sync Worker (integration)', () => {
  it('creates user and profile on user.created', async () => {
    const userId = crypto.randomUUID();
    const job = createJob({ eventType: 'user.created', userId, email: 'new@example.com' });

    await authSyncProcessor({ sql }, job);

    const userRows = await sql`SELECT id, email, status FROM identity.users WHERE id = ${userId}`;
    expect(userRows).toHaveLength(1);
    expect(userRows[0].email).toBe('new@example.com');
    expect(userRows[0].status).toBe('active');

    const profileRows = await sql`SELECT user_id FROM identity.profiles WHERE user_id = ${userId}`;
    expect(profileRows).toHaveLength(1);
    expect(profileRows[0].user_id).toBe(userId);
  });

  it('is idempotent for user.created', async () => {
    const userId = crypto.randomUUID();
    const job = createJob({ eventType: 'user.created', userId, email: 'dup@example.com' });

    await authSyncProcessor({ sql }, job);
    await authSyncProcessor({ sql }, job);

    const userRows = await sql`SELECT id FROM identity.users WHERE id = ${userId}`;
    expect(userRows).toHaveLength(1);

    const profileRows = await sql`SELECT id FROM identity.profiles WHERE user_id = ${userId}`;
    expect(profileRows).toHaveLength(1);
  });

  it('updates email on user.updated', async () => {
    const userId = crypto.randomUUID();
    await sql`INSERT INTO identity.users (id, email) VALUES (${userId}, 'old@example.com')`;

    const job = createJob({ eventType: 'user.updated', userId, email: 'updated@example.com' });
    await authSyncProcessor({ sql }, job);

    const rows = await sql`SELECT email FROM identity.users WHERE id = ${userId}`;
    expect(rows[0].email).toBe('updated@example.com');
  });

  it('throws retryable error when user not found for update', async () => {
    const userId = crypto.randomUUID();
    const job = createJob({ eventType: 'user.updated', userId, email: 'updated@example.com' });

    await expect(authSyncProcessor({ sql }, job)).rejects.toThrow(/not found for update/);
  });

  it('soft-deletes user on user.deleted', async () => {
    const userId = crypto.randomUUID();
    await sql`INSERT INTO identity.users (id, email) VALUES (${userId}, 'delete@example.com')`;

    const job = createJob({ eventType: 'user.deleted', userId });
    await authSyncProcessor({ sql }, job);

    const rows = await sql`SELECT status FROM identity.users WHERE id = ${userId}`;
    expect(rows[0].status).toBe('deactivated');
  });

  it('is idempotent for user.deleted when user already gone', async () => {
    const userId = crypto.randomUUID();
    const job = createJob({ eventType: 'user.deleted', userId });

    // Should not throw
    await expect(authSyncProcessor({ sql }, job)).resolves.not.toThrow();
  });

  it('emits outbox event on user creation', async () => {
    const userId = crypto.randomUUID();
    const job = createJob({ eventType: 'user.created', userId, email: 'event@example.com' });

    await authSyncProcessor({ sql }, job);

    const outbox = await sql`
      SELECT event_type FROM outbox
      WHERE aggregate_id = ${userId} AND status = 'pending'
    `;
    expect(outbox.length).toBeGreaterThanOrEqual(1);
    expect(outbox[0].event_type).toBe('identity.user_created');
  });
});
