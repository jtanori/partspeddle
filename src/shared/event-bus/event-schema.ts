import { z } from 'zod';
import { PAYLOAD_HARD_LIMIT_BYTES } from './domain-event.js';

/**
 * Validates that a serialized payload does not exceed the hard size limit.
 */
function validatePayloadSize(payload: Record<string, unknown>): boolean {
  const size = new TextEncoder().encode(JSON.stringify(payload)).length;
  return size <= PAYLOAD_HARD_LIMIT_BYTES;
}

/**
 * Zod schema for the canonical domain event envelope.
 *
 * Enforces:
 * - UUID format on identifiers
 * - eventType: domain.action (past tense, lowercase)
 * - eventVersion: integer >= 1
 * - ISO-8601 datetime on occurredAt
 * - Payload hard limit of 64KB
 *
 * @see /project-knowledge/event-envelope-standard.md
 */
export const domainEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().regex(/^[a-z]+\.[a-z_]+$/, {
    message: 'Event type must match domain.action format (past tense, lowercase)',
  }),
  eventVersion: z.number().int().min(1),
  occurredAt: z.string().datetime(),
  correlationId: z.string().uuid(),
  causationId: z.string().uuid(),
  actorId: z.string().min(1),
  domain: z.string().regex(/^[a-z]+$/, {
    message: 'Domain must be a single lowercase word',
  }),
  aggregateId: z.string().uuid(),
  payload: z.record(z.unknown()).refine(validatePayloadSize, {
    message: `Payload exceeds hard limit of ${PAYLOAD_HARD_LIMIT_BYTES} bytes`,
  }),
  metadata: z
    .object({
      traceparent: z.string().optional(),
      sourceIp: z.string().optional(),
      clientVersion: z.string().optional(),
    })
    .optional(),
});

/**
 * Inferred TypeScript type from the Zod schema.
 */
export type DomainEventEnvelope = z.infer<typeof domainEventSchema>;

export { PAYLOAD_HARD_LIMIT_BYTES, PAYLOAD_HARD_LIMIT_BYTES as PAYLOAD_SIZE_LIMIT };
