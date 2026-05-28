export class DomainError extends Error {
  readonly code: string;
  readonly correlationId: string;
  readonly isRetryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    correlationId: string,
    isRetryable = false,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.correlationId = correlationId;
    this.isRetryable = isRetryable;
    this.details = details;
    this.name = 'DomainError';

    // Maintain proper stack trace for where our error was thrown
    Error.captureStackTrace(this, DomainError);
  }

  /**
   * Serialize to a JSON-safe object.
   *
   * Stack traces are omitted by default. Safe for queues, logs, events, and DLQs.
   */
  toJSON(): Record<string, unknown> {
    const envelope: Record<string, unknown> = {
      code: this.code,
      message: this.message,
      correlationId: this.correlationId,
      retryable: this.isRetryable,
      name: this.name,
    };
    if (this.details !== undefined) {
      envelope.details = this.details;
    }
    return envelope;
  }
}
