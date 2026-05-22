/**
 * Session API Routes
 *
 * POST /v1/identity/sessions/revoke — Revokes all active sessions for the user
 */

import { Router, type Request, type Response } from 'express';
import type { IdentityProvider } from '../../application/ports/identity-provider.js';
import { logger } from '../../../shared/observability/logger.js';

export interface SessionRoutesDeps {
  readonly identityProvider: IdentityProvider;
}

export function createSessionRoutes(deps: SessionRoutesDeps): Router {
  const router = Router();

  router.post('/revoke', async (req: Request, res: Response) => {
    const correlationId = req.correlationId ?? crypto.randomUUID();
    const auth = req.auth;

    if (!auth) {
      res.status(401).json({
        error: 'IDENTITY_AUTH_MISSING',
        message: 'Authentication required',
        correlationId,
      });
      return;
    }

    try {
      await deps.identityProvider.revokeSessions(auth.userId);

      logger.info('All sessions revoked for user', {
        userId: auth.userId,
        correlationId,
      });

      res.status(200).json({
        status: 'revoked',
        userId: auth.userId,
        correlationId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to revoke sessions', {
        error: message,
        userId: auth.userId,
        correlationId,
      });
      res.status(500).json({
        error: 'IDENTITY_SESSION_REVOKE_FAILED',
        message,
        correlationId,
      });
    }
  });

  return router;
}
