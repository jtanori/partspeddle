import { describe, it, expect, vi } from 'vitest';
import { correlationIdMiddleware } from '../correlation-id.js';

describe('correlationIdMiddleware', () => {
  function createMocks(headers: Record<string, string> = {}) {
    const req = { headers } as unknown as import('express').Request;
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as import('express').Response;
    const next = vi.fn();
    return { req, res, next };
  }

  it('extracts existing correlationId and traceparent', () => {
    const { req, res, next } = createMocks({
      'x-correlation-id': 'corr-123',
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    });

    correlationIdMiddleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-Id', 'corr-123');
    expect(res.setHeader).toHaveBeenCalledWith(
      'traceparent',
      '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
    );
    expect(next).toHaveBeenCalled();
  });

  it('generates new IDs when headers missing', () => {
    const { req, res, next } = createMocks();

    correlationIdMiddleware(req, res, next);

    const corrCall = vi.mocked(res.setHeader).mock.calls.find((c) => c[0] === 'X-Correlation-Id');
    const traceCall = vi.mocked(res.setHeader).mock.calls.find((c) => c[0] === 'traceparent');

    expect(corrCall?.[1]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(traceCall?.[1]).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
    expect(next).toHaveBeenCalled();
  });

  it('stores IDs on request object', () => {
    const { req, res, next } = createMocks({
      'x-correlation-id': 'corr-123',
      traceparent: '00-abc123',
    });

    correlationIdMiddleware(req, res, next);

    // Invalid traceparent falls back to generated, but correlationId extracts
    expect((req as unknown as Record<string, unknown>).correlationId).toBe('corr-123');
  });
});
