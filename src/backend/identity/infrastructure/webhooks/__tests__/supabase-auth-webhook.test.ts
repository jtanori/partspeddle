import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { jwtVerify } from 'jose';
import {
  createSupabaseAuthWebhookHandler,
  type AuthWebhookDeps,
  type SupabaseAuthWebhookPayload,
} from '../supabase-auth-webhook.js';
import { InMemoryWebhookIdempotencyStore } from '../webhook-idempotency-store.js';
import type { Queue } from 'bullmq';

// Mock jose jwtVerify
vi.mock('jose', () => ({
  jwtVerify: vi.fn().mockResolvedValue({ payload: { sub: 'test' } }),
}));

function createMockQueue(): Queue {
  return {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    name: 'identity-webhooks',
  } as unknown as Queue;
}

function createDeps(overrides: Partial<AuthWebhookDeps> = {}): AuthWebhookDeps {
  return {
    queue: createMockQueue(),
    idempotencyStore: new InMemoryWebhookIdempotencyStore(),
    ...overrides,
  };
}

function createReq(body: unknown, authHeader = 'Bearer valid-token'): Request {
  return {
    headers: { authorization: authHeader },
    body,
    correlationId: 'corr-1',
  } as unknown as Request;
}

function createRes(): Response {
  const res = {
    statusCode: 200,
    jsonBody: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.jsonBody = body;
      return this;
    },
  };
  return res as unknown as Response;
}

function createPayload(type: SupabaseAuthWebhookPayload['type']): SupabaseAuthWebhookPayload {
  return {
    type,
    table: 'users',
    record: {
      id: 'user-123',
      email: 'test@example.com',
      raw_user_meta_data: {},
    },
    schema: 'auth',
    old_record: null,
  };
}

describe('createSupabaseAuthWebhookHandler', () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = 'test-jwt-secret-for-webhook-validation';
    process.env.SUPABASE_URL = 'http://localhost:54321';
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_URL;
  });

  it('returns 400 for invalid payload', async () => {
    const handler = createSupabaseAuthWebhookHandler(createDeps());
    const req = createReq(null);
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toMatchObject({ error: 'IDENTITY_WEBHOOK_INVALID_PAYLOAD' });
  });

  it('returns 400 for payload missing type', async () => {
    const handler = createSupabaseAuthWebhookHandler(createDeps());
    const req = createReq({ record: { id: 'user-123' } });
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toMatchObject({ error: 'IDENTITY_WEBHOOK_INVALID_PAYLOAD' });
  });

  it('returns 202 and enqueues job for valid payload', async () => {
    const deps = createDeps();
    const handler = createSupabaseAuthWebhookHandler(deps);
    const payload = createPayload('user.created');
    const req = createReq(payload);
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(202);
    expect(res.jsonBody).toMatchObject({ status: 'accepted' });
    expect(deps.queue.add).toHaveBeenCalledTimes(1);

    const callArgs = vi.mocked(deps.queue.add).mock.calls[0];
    expect(callArgs[0]).toBe('user.created');
    expect(callArgs[1].data.userId).toBe('user-123');
    expect(callArgs[2]).toMatchObject({ jobId: expect.any(String) });
  });

  it('returns 200 deduplicated when event already processed', async () => {
    const store = new InMemoryWebhookIdempotencyStore();
    const deps = createDeps({ idempotencyStore: store });
    const handler = createSupabaseAuthWebhookHandler(deps);
    const payload = createPayload('user.created');

    // Pre-mark as processed to simulate duplicate
    const eventId = `user.created:user-123:${Date.now()}`;
    await store.markProcessed('supabase', eventId);

    // Mock isProcessed to return true for any supabase event
    vi.spyOn(store, 'isProcessed').mockResolvedValue(true);

    const req = createReq(payload);
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({ status: 'deduplicated' });
    expect(deps.queue.add).not.toHaveBeenCalled();
  });

  it('returns 401 on invalid authorization', async () => {
    vi.mocked(jwtVerify).mockRejectedValueOnce(new Error('Invalid token'));
    const handler = createSupabaseAuthWebhookHandler(createDeps());
    const payload = createPayload('user.created');
    const req = createReq(payload, 'Bearer invalid-token');
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toMatchObject({ error: 'IDENTITY_WEBHOOK_INVALID_SIGNATURE' });
  });

  it('handles user.updated event', async () => {
    const deps = createDeps();
    const handler = createSupabaseAuthWebhookHandler(deps);
    const payload = createPayload('user.updated');
    const req = createReq(payload);
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(202);
    const callArgs = vi.mocked(deps.queue.add).mock.calls[0];
    expect(callArgs[0]).toBe('user.updated');
  });

  it('handles user.deleted event', async () => {
    const deps = createDeps();
    const handler = createSupabaseAuthWebhookHandler(deps);
    const payload = createPayload('user.deleted');
    const req = createReq(payload);
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(202);
    const callArgs = vi.mocked(deps.queue.add).mock.calls[0];
    expect(callArgs[0]).toBe('user.deleted');
  });
});
