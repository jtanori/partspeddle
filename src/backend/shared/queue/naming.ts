/**
 * Queue Naming Convention
 *
 * Enforces domain-scoped queue names and derived DLQ names.
 *
 * @see /project-knowledge/queue-contracts.md
 */

const NAME_PATTERN = /^[a-z]+-[a-z-]+$/;

export interface QueueNames {
  readonly queue: string;
  readonly dlq: string;
}

/**
 * Derive queue and DLQ names from domain and purpose.
 */
export function deriveQueueNames(domain: string, purpose: string): QueueNames {
  const queue = `${domain}-${purpose}`;
  const dlq = `${queue}-dlq`;

  if (!NAME_PATTERN.test(queue)) {
    throw new Error(
      `Invalid queue name "${queue}". Must match domain-purpose format (lowercase, hyphen-separated).`
    );
  }

  return { queue, dlq };
}
