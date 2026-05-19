import { describe, it, expect } from 'vitest';
import { DomainError } from '../domain-error.js';
import { wrapError, mapToHttpResponse, isRetryable } from '../error-mapper.js';

describe('wrapError', () => {
  it('passes through DomainError unchanged', () => {
    const original = new DomainError('TEST_CODE', 'msg', 'corr-1', true);
    const wrapped = wrapError(original, 'OTHER', 'corr-2');

    expect(wrapped).toBe(original);
  });

  it('wraps raw Error in DomainError', () => {
    const wrapped = wrapError(new Error('something broke'), 'SHARED_ERROR', 'corr-1');

    expect(wrapped).toBeInstanceOf(DomainError);
    expect(wrapped.code).toBe('SHARED_ERROR');
    expect(wrapped.message).toBe('something broke');
    expect(wrapped.correlationId).toBe('corr-1');
  });

  it('wraps non-Error values', () => {
    const wrapped = wrapError('plain string', 'SHARED_ERROR', 'corr-1');

    expect(wrapped.message).toBe('plain string');
  });
});

describe('mapToHttpResponse', () => {
  it('maps NOT_FOUND to 404', () => {
    const error = new DomainError('IDENTITY_SELLER_NOT_FOUND', 'Not found', 'corr-1');
    const { status, body } = mapToHttpResponse(error);

    expect(status).toBe(404);
    expect(body.error.code).toBe('IDENTITY_SELLER_NOT_FOUND');
  });

  it('maps CONFLICT to 409', () => {
    const error = new DomainError('MARKETPLACE_LISTING_CONFLICT', 'Conflict', 'corr-1');
    const { status } = mapToHttpResponse(error);

    expect(status).toBe(409);
  });

  it('maps VALIDATION to 422', () => {
    const error = new DomainError('IDENTITY_VALIDATION', 'Invalid', 'corr-1');
    const { status } = mapToHttpResponse(error);

    expect(status).toBe(422);
  });

  it('maps SHARED_ to 500', () => {
    const error = new DomainError('SHARED_DB_QUERY_TIMEOUT', 'Timeout', 'corr-1');
    const { status } = mapToHttpResponse(error);

    expect(status).toBe(500);
  });

  it('includes canonical error shape', () => {
    const error = new DomainError('TEST', 'msg', 'corr-1', true);
    const { body } = mapToHttpResponse(error);

    expect(body.error).toEqual({
      code: 'TEST',
      message: 'msg',
      correlationId: 'corr-1',
      retryable: true,
    });
  });
});

describe('isRetryable', () => {
  it('returns retryable flag for DomainError', () => {
    expect(isRetryable(new DomainError('X', 'Y', 'Z', true))).toBe(true);
    expect(isRetryable(new DomainError('X', 'Y', 'Z', false))).toBe(false);
  });

  it('returns false for non-DomainError', () => {
    expect(isRetryable(new Error('raw'))).toBe(false);
  });
});
