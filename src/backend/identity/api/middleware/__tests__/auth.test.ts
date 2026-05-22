import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../auth.js';
import type { IdentityProvider } from '../../../application/ports/identity-provider.js';
import { DomainError } from '../../../../shared/errors/domain-error.js';

function createMockProvider(verifyResult?: unknown): IdentityProvider {
  return {
    verifyToken: vi.fn().mockImplementation(async (token: string) => {
      if (verifyResult) return verifyResult;
      if (token === 'valid-token') {
        return {
          sub: 'user-123',
          email: 'test@example.com',
          aud: 'authenticated',
          exp: Date.now() / 1000 + 3600,
          iat: Date.now() / 1000,
        };
      }
      throw new DomainError('IDENTITY_AUTH_INVALID_TOKEN', 'Invalid token', 'corr-1', false);
    }),
    getUser: vi.fn(),
    revokeSessions: vi.fn(),
  };
}

function createReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    correlationId: 'corr-1',
    ...overrides,
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

function createNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

describe('authMiddleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const provider = createMockProvider();
    const middleware = authMiddleware(provider);
    const req = createReq();
    const res = createRes();
    const next = createNext();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toMatchObject({ error: 'IDENTITY_AUTH_MISSING' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization format is invalid', async () => {
    const provider = createMockProvider();
    const middleware = authMiddleware(provider);
    const req = createReq({ headers: { authorization: 'Basic dXNlcjpwYXNz' } });
    const res = createRes();
    const next = createNext();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toMatchObject({ error: 'IDENTITY_AUTH_INVALID_FORMAT' });
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches auth context on valid token', async () => {
    const provider = createMockProvider();
    const middleware = authMiddleware(provider);
    const req = createReq({ headers: { authorization: 'Bearer valid-token' } });
    const res = createRes();
    const next = createNext();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.auth).toBeDefined();
    expect(req.auth!.userId).toBe('user-123');
    expect(req.auth!.email).toBe('test@example.com');
    expect(req.auth!.roles).toContain('user');
  });

  it('returns 401 on invalid token', async () => {
    const provider = createMockProvider();
    const middleware = authMiddleware(provider);
    const req = createReq({ headers: { authorization: 'Bearer invalid-token' } });
    const res = createRes();
    const next = createNext();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toMatchObject({ error: 'IDENTITY_AUTH_INVALID_TOKEN' });
    expect(next).not.toHaveBeenCalled();
  });

  it('proceeds without auth when optional and header missing', async () => {
    const provider = createMockProvider();
    const middleware = authMiddleware(provider, { optional: true });
    const req = createReq();
    const res = createRes();
    const next = createNext();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.auth).toBeUndefined();
  });

  it('proceeds without auth when optional and token invalid', async () => {
    const provider = createMockProvider();
    const middleware = authMiddleware(provider, { optional: true });
    const req = createReq({ headers: { authorization: 'Bearer invalid-token' } });
    const res = createRes();
    const next = createNext();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.auth).toBeUndefined();
  });

  it('derives seller role from app_metadata', async () => {
    const provider = createMockProvider({
      sub: 'user-123',
      email: 'test@example.com',
      aud: 'authenticated',
      exp: Date.now() / 1000 + 3600,
      iat: Date.now() / 1000,
      app_metadata: { role: 'seller' },
    });
    const middleware = authMiddleware(provider);
    const req = createReq({ headers: { authorization: 'Bearer valid-token' } });
    const res = createRes();
    const next = createNext();

    await middleware(req, res, next);

    expect(req.auth!.roles).toContain('seller');
  });

  it('derives admin role from role claim', async () => {
    const provider = createMockProvider({
      sub: 'user-123',
      email: 'test@example.com',
      aud: 'authenticated',
      exp: Date.now() / 1000 + 3600,
      iat: Date.now() / 1000,
      role: 'admin',
    });
    const middleware = authMiddleware(provider);
    const req = createReq({ headers: { authorization: 'Bearer valid-token' } });
    const res = createRes();
    const next = createNext();

    await middleware(req, res, next);

    expect(req.auth!.roles).toContain('admin');
  });
});
