/**
 * Seller API Routes
 *
 * POST /v1/identity/sellers/register — Creates seller profile
 * POST /v1/identity/sellers/me/onboarding/:step — Completes onboarding step
 */

import { Router, type Request, type Response } from 'express';
import type { ISellerProfileRepository } from '../../domain/repositories/seller-profile-repository.js';
import {
  RegisterSellerRequestSchema,
  SellerProfileResponseSchema,
} from '../dto/seller-dto.js';
import { SellerProfile } from '../../domain/entities/seller-profile.js';
import { logger } from '../../../shared/observability/logger.js';
import { DomainError } from '../../../../shared/errors/domain-error.js';

export interface SellerRoutesDeps {
  readonly sellerProfileRepository: ISellerProfileRepository;
}

export function createSellerRoutes(deps: SellerRoutesDeps): Router {
  const router = Router();

  // POST /v1/identity/sellers/register
  router.post('/register', async (req: Request, res: Response) => {
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

    const parseResult = RegisterSellerRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'IDENTITY_SELLER_INVALID_REQUEST',
        message: parseResult.error.errors.map((e) => e.message).join(', '),
        correlationId,
      });
      return;
    }

    const { stripeConnectAccountId } = parseResult.data;

    try {
      // Check if seller profile already exists
      const existing = await deps.sellerProfileRepository.findByUserId(auth.userId);
      if (existing) {
        res.status(409).json({
          error: 'IDENTITY_SELLER_ALREADY_EXISTS',
          message: 'Seller profile already exists for this user',
          correlationId,
        });
        return;
      }

      const profile = SellerProfile.create(
        { id: crypto.randomUUID(), userId: auth.userId },
        correlationId,
        auth.userId,
      );
      profile.linkStripeAccount(stripeConnectAccountId);

      await deps.sellerProfileRepository.save(profile);

      const response = SellerProfileResponseSchema.parse({
        id: profile.id,
        userId: profile.userId,
        status: profile.status,
        stripeConnectAccountId: profile.stripeConnectAccountId,
        activatedAt: profile.activatedAt?.toISOString(),
        completedOnboardingSteps: profile.onboardingState.completedSteps,
      });

      res.status(201).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to register seller', {
        error: message,
        userId: auth.userId,
        correlationId,
      });

      if (error instanceof DomainError) {
        res.status(422).json({
          error: error.code,
          message: error.message,
          correlationId,
        });
        return;
      }

      res.status(500).json({
        error: 'IDENTITY_SELLER_REGISTRATION_FAILED',
        message,
        correlationId,
      });
    }
  });

  // POST /v1/identity/sellers/me/onboarding/:step
  router.post('/me/onboarding/:step', async (req: Request, res: Response) => {
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

    const step = req.params.step;
    const validSteps = ['identity', 'banking', 'tax', 'terms'] as const;
    if (!validSteps.includes(step as typeof validSteps[number])) {
      res.status(400).json({
        error: 'IDENTITY_ONBOARDING_INVALID_STEP',
        message: `Invalid onboarding step: ${step}`,
        correlationId,
      });
      return;
    }

    try {
      const profile = await deps.sellerProfileRepository.findByUserId(auth.userId);

      if (!profile) {
        res.status(404).json({
          error: 'IDENTITY_SELLER_NOT_FOUND',
          message: 'Seller profile not found',
          correlationId,
        });
        return;
      }

      profile.completeOnboardingStep(step as typeof validSteps[number], correlationId, auth.userId);
      await deps.sellerProfileRepository.save(profile);

      const response = SellerProfileResponseSchema.parse({
        id: profile.id,
        userId: profile.userId,
        status: profile.status,
        stripeConnectAccountId: profile.stripeConnectAccountId,
        activatedAt: profile.activatedAt?.toISOString(),
        completedOnboardingSteps: profile.onboardingState.completedSteps,
      });

      res.status(200).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to complete onboarding step', {
        error: message,
        userId: auth.userId,
        step,
        correlationId,
      });

      if (error instanceof DomainError) {
        res.status(422).json({
          error: error.code,
          message: error.message,
          correlationId,
        });
        return;
      }

      res.status(500).json({
        error: 'IDENTITY_ONBOARDING_STEP_FAILED',
        message,
        correlationId,
      });
    }
  });

  return router;
}
