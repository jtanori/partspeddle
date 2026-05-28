/**
 * Supabase Auth Webhook Handler
 *
 * Receives Supabase Auth lifecycle webhooks, verifies signatures,
 * checks idempotency, and enqueues async processing jobs.
 *
 * Endpoint: POST /v1/identity/webhooks/supabase-auth
 *
 * Security:
 * - Verifies JWT from Authorization header using SUPABASE_JWT_SECRET
 * - Returns 401 on invalid/missing token
 * - Returns 202 immediately (async processing)
 *
 * Events handled:
 * - user.created → enqueue profile creation
 * - user.updated → enqueue profile update
 * - user.deleted → enqueue cleanup
 */

import type { Request, Response } from 'express';
import { jwtVerify } from 'jose';
import type { Queue } from 'bullmq';
import type { WebhookIdempotencyStore } from './webhook-idempotency-store.js';
import { logger } from '../../../shared/observability/logger.js';

export interface SupabaseAuthWebhookPayload {
  readonly type: 'user.created' | 'user.updated' | 'user.deleted';
  readonly table: string;
  readonly record: {
    readonly id: string;
    readonly email?: string;
    readonly phone?: string;
    readonly raw_user_meta_data?: Record<string, unknown>;
  };
  readonly schema: string;
  readonly old_record: Record<string, unknown> | null;
}

export interface AuthWebhookDeps {
  readonly queue: Queue;
  readonly idempotencyStore: WebhookIdempotencyStore;
}

/**
 * Verify the webhook JWT signature.
 *
 * @throws {Error} If token is invalid or missing
 */
async function verifyWebhookToken(authHeader: string): Promise<void> {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET ?? '';
  const supabaseUrl = process.env.SUPABASE_URL ?? '';

  if (!jwtSecret) {
    throw new Error('SUPABASE_JWT_SECRET is not configured');
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new Error('Invalid Authorization header format');
  }

  const secret = new TextEncoder().encode(jwtSecret);
  await jwtVerify(token, secret, {
    clockTolerance: 30,
    issuer: `${supabaseUrl}/auth/v1`,
    audience: 'authenticated',
  });
}

/**
 * Express handler for Supabase Auth webhooks.
 */
export function createSupabaseAuthWebhookHandler(deps: AuthWebhookDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId ?? crypto.randomUUID();

    try {
      // 1. Verify JWT signature
      const authHeader = req.headers.authorization ?? '';
      await verifyWebhookToken(authHeader);

      // 2. Validate payload shape
      const payload = req.body as unknown;
      if (!payload || typeof payload !== 'object') {
        res.status(400).json({
          error: 'IDENTITY_WEBHOOK_INVALID_PAYLOAD',
          message: 'Webhook payload must be an object',
          correlationId,
        });
        return;
      }

      const webhookPayload = payload as SupabaseAuthWebhookPayload;
      // Runtime validation after `as` cast — type system assumes correctness,
      // but we must guard against malformed payloads at runtime.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!webhookPayload.type || !webhookPayload.record?.id) {
        res.status(400).json({
          error: 'IDENTITY_WEBHOOK_INVALID_PAYLOAD',
          message: 'Webhook payload must include type and record.id',
          correlationId,
        });
        return;
      }

      const eventId = `${webhookPayload.type}:${webhookPayload.record.id}:${Date.now()}`;

      // 3. Idempotency check
      const alreadyProcessed = await deps.idempotencyStore.isProcessed('supabase', eventId);
      if (alreadyProcessed) {
        logger.info('Webhook deduplicated', {
          eventId,
          eventType: webhookPayload.type,
          correlationId,
        });
        res.status(200).json({ status: 'deduplicated', correlationId });
        return;
      }

      // 4. Enqueue async processing job
      await deps.queue.add(
        webhookPayload.type,
        {
          data: {
            eventType: webhookPayload.type,
            userId: webhookPayload.record.id,
            email: webhookPayload.record.email,
            rawMeta: webhookPayload.record.raw_user_meta_data,
            oldRecord: webhookPayload.old_record,
          },
          metadata: {
            correlationId,
            actorId: 'system:webhook',
            attempt: 1,
            enqueuedAt: new Date().toISOString(),
          },
        },
        { jobId: eventId }
      );

      // 5. Mark processed (best-effort; job enqueue succeeded)
      await deps.idempotencyStore.markProcessed('supabase', eventId);

      logger.info('Webhook accepted and enqueued', {
        eventId,
        eventType: webhookPayload.type,
        userId: webhookPayload.record.id,
        correlationId,
      });

      res.status(202).json({ status: 'accepted', correlationId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown webhook error';
      logger.error('Webhook processing failed', {
        error: message,
        correlationId,
      });

      if (
        message.includes('invalid') ||
        message.includes('JWT') ||
        message.includes('token') ||
        message.includes('Authorization')
      ) {
        res.status(401).json({
          error: 'IDENTITY_WEBHOOK_INVALID_SIGNATURE',
          message,
          correlationId,
        });
        return;
      }

      res.status(500).json({
        error: 'IDENTITY_WEBHOOK_PROCESSING_FAILED',
        message,
        correlationId,
      });
    }
  };
}
