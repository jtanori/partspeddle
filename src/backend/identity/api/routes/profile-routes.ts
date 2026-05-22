/**
 * Profile API Routes
 *
 * PATCH /v1/identity/profiles/me — Updates the authenticated user's profile
 */

import { Router, type Request, type Response } from 'express';
import type { IProfileRepository } from '../../domain/repositories/profile-repository.js';
import {
  UpdateProfileRequestSchema,
  ProfileResponseSchema,
} from '../dto/profile-dto.js';
import { logger } from '../../../shared/observability/logger.js';

export interface ProfileRoutesDeps {
  readonly profileRepository: IProfileRepository;
}

export function createProfileRoutes(deps: ProfileRoutesDeps): Router {
  const router = Router();

  router.patch('/me', async (req: Request, res: Response) => {
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

    // Validate request body
    const parseResult = UpdateProfileRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'IDENTITY_PROFILE_INVALID_REQUEST',
        message: parseResult.error.errors.map((e) => e.message).join(', '),
        correlationId,
      });
      return;
    }

    const { displayName, avatarUrl } = parseResult.data;

    try {
      let profile = await deps.profileRepository.findByUserId(auth.userId);

      if (!profile) {
        // Lazy-create profile if missing
        const { Profile } = await import('../../domain/entities/profile.js');
        profile = new Profile({ id: crypto.randomUUID(), userId: auth.userId });
      }

      if (displayName !== undefined) {
        profile.updateDisplayName(displayName);
      }
      if (avatarUrl !== undefined) {
        profile.updateAvatarUrl(avatarUrl);
      }

      await deps.profileRepository.save(profile);

      const response = ProfileResponseSchema.parse({
        id: profile.id,
        userId: profile.userId,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      });

      res.status(200).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update profile', {
        error: message,
        userId: auth.userId,
        correlationId,
      });
      res.status(500).json({
        error: 'IDENTITY_PROFILE_UPDATE_FAILED',
        message,
        correlationId,
      });
    }
  });

  return router;
}
