/**
 * User API Routes
 *
 * GET /v1/identity/users/me — Returns the authenticated user
 */

import { Router, type Request, type Response } from 'express';
import type { IUserRepository } from '../../domain/repositories/user-repository.js';
import { UserResponseSchema } from '../dto/user-dto.js';
import { logger } from '../../../shared/observability/logger.js';

export interface UserRoutesDeps {
  readonly userRepository: IUserRepository;
}

export function createUserRoutes(deps: UserRoutesDeps): Router {
  const router = Router();

  router.get('/me', async (req: Request, res: Response) => {
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
      const user = await deps.userRepository.findById(auth.userId);

      if (!user) {
        res.status(404).json({
          error: 'IDENTITY_USER_NOT_FOUND',
          message: 'User not found',
          correlationId,
        });
        return;
      }

      const response = UserResponseSchema.parse({
        id: user.id,
        email: user.email,
        status: user.status,
        authProvider: auth.authProvider,
      });

      res.status(200).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch user', { error: message, userId: auth.userId, correlationId });
      res.status(500).json({
        error: 'IDENTITY_USER_FETCH_FAILED',
        message,
        correlationId,
      });
    }
  });

  return router;
}
