/**
 * SellerProfile State Machine — deterministic transition validation.
 *
 * Centralizes guard conditions so they can be tested independently
 * of the aggregate lifecycle methods.
 */

import type { SellerStatus } from '../../../../shared/contracts/identity/seller-schema.js';
import type { OnboardingState } from '../entities/onboarding-state.js';

export interface TransitionContext {
  readonly from: SellerStatus;
  readonly to: SellerStatus;
  readonly onboardingState: OnboardingState;
  readonly stripeConnectAccountId?: string;
  readonly activatedAt?: Date;
}

export interface TransitionResult {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly code?: string;
}

const VALID_TRANSITIONS: Record<SellerStatus, readonly SellerStatus[]> = {
  draft: ['pending_review'],
  pending_review: ['active'],
  active: ['suspended'],
  suspended: ['active'],
};

/**
 * Validate a state transition with all guard conditions.
 */
export function validateTransition(ctx: TransitionContext): TransitionResult {
  // 1. Check transition is structurally valid
  if (!VALID_TRANSITIONS[ctx.from].includes(ctx.to)) {
    return {
      allowed: false,
      code: 'IDENTITY_SELLER_INVALID_TRANSITION',
      reason: `Cannot transition from ${ctx.from} to ${ctx.to}`,
    };
  }

  // 2. Guard: draft → pending_review requires all onboarding steps
  if (ctx.from === 'draft' && ctx.to === 'pending_review') {
    if (!ctx.onboardingState.isComplete) {
      const missing = ['identity', 'banking', 'tax', 'terms'].filter(
        (s) => !ctx.onboardingState.hasStep(s as 'identity' | 'banking' | 'tax' | 'terms')
      );
      return {
        allowed: false,
        code: 'IDENTITY_SELLER_ONBOARDING_INCOMPLETE',
        reason: `Missing onboarding steps: [${missing.join(', ')}]`,
      };
    }
  }

  // 3. Guard: pending_review → active requires Stripe account
  if (ctx.from === 'pending_review' && ctx.to === 'active') {
    if (!ctx.stripeConnectAccountId) {
      return {
        allowed: false,
        code: 'IDENTITY_SELLER_STRIPE_REQUIRED',
        reason: 'Stripe Connect account not linked',
      };
    }
  }

  // 4. Guard: suspended → active preserves activatedAt (no explicit block, just info)
  if (ctx.from === 'suspended' && ctx.to === 'active') {
    // Reactivation is always allowed if structurally valid
    // activatedAt preservation is handled by the aggregate, not the guard
  }

  return { allowed: true };
}

/**
 * Check if a transition is valid without guard details.
 */
export function canTransition(from: SellerStatus, to: SellerStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Get all valid target states from a given state.
 */
export function validTargets(from: SellerStatus): readonly SellerStatus[] {
  return VALID_TRANSITIONS[from];
}
