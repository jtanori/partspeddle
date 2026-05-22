import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { errorHandlerMiddleware } from '../error-handler.js';
import { DomainError } from '../../../errors/domain-error.js';

describe('errorHandlerMiddleware', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMocks(correlationId?: string) {
    const req = { correlationId } as unknown as import('express').Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as import('express').Response;
    const next = vi.fn();
    return { req, res, next };
  }

  it('maps DomainError to canonical response', () => {
    const { req, res, next } = createMocks('corr-123');
    const error = new DomainError('TEST_CODE', 'Test error', 'corr-123', false);

    errorHandlerMiddleware(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'TEST_CODE',
        message: 'Test error',
        correlationId: 'corr-123',
        retryable: false,
      },
    });
  });

  it('wraps raw Error and hides details from client', () => {
    const { req, res, next } = createMocks('corr-123');
    const raw = new Error('database exploded');

    errorHandlerMiddleware(raw, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = vi.mocked(res.json).mock.calls[0][0];
    expect(body.error.message).toBe('An unexpected error occurred');
    expect(body.error.code).toBe('SHARED_INTERNAL_ERROR');
  });

  it('uses unknown correlationId when missing', () => {
    const { req, res, next } = createMocks();
    const error = new DomainError('X', 'Y', 'corr-1');

    errorHandlerMiddleware(error, req, res, next);

    const body = vi.mocked(res.json).mock.calls[0][0];
    expect(body.error.correlationId).toBe('corr-1');
  });
});
