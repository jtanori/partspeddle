/**
 * Auth Middleware
 *
 * Extracts and verifies JWT from Authorization header.
 * Attaches AuthContext to the request for downstream use.
 * Does NOT create user records — lazy provisioning is handled
 * at the application/service layer, not at the middleware edge.
 *
 * Supports optional auth: if `optional` is true, unauthenticated
 * requests proceed with `req.auth` undefined.
 */

import type { Request, Response, NextFunction } from 'express';
import { type IdentityProvider } from '../../application/ports/identity-provider.js';
import { createAuthContext, type AuthContext } from '../../application/ports/auth-context.js';
import { DomainError } from '../../../../shared/errors/domain-error.js';

export interface AuthMiddlewareOptions {
  /**
   * If true, unauthenticated requests proceed without error.
   * `req.auth` will be undefined in that case.
   */
  readonly optional?: boolean;
}

export function authMiddleware(provider: IdentityProvider, options: AuthMiddlewareOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization ?? '';
    const correlationId = req.correlationId ?? crypto.randomUUID();

    // No auth header
    if (!authHeader) {
      if (options.optional) {
        next();
        return;
      }
      res.status(401).json({
        error: 'IDENTITY_AUTH_MISSING',
        message: 'Authorization header required',
        correlationId,
      });
      return;
    }

    // Expect "Bearer <token>"
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      if (options.optional) {
        next();
        return;
      }
      res.status(401).json({
        error: 'IDENTITY_AUTH_INVALID_FORMAT',
        message: 'Authorization header must be "Bearer <token>"',
        correlationId,
      });
      return;
    }

    try {
      const verifiedToken = await provider.verifyToken(token);
      const auth: AuthContext = createAuthContext({
        verifiedToken,
        correlationId,
        traceparent: req.traceparent,
      });
      req.auth = auth;
      next();
    } catch (error) {
      if (options.optional) {
        next();
        return;
      }

      if (error instanceof DomainError) {
        res.status(401).json({
          error: error.code,
          message: error.message,
          correlationId,
        });
        return;
      }

      const message = error instanceof Error ? error.message : 'Unknown auth error';
      res.status(401).json({
        error: 'IDENTITY_AUTH_INVALID_TOKEN',
        message,
        correlationId,
      });
    }
  };
}
