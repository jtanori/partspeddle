import { describe, it, expect } from 'vitest';
import { validateTransition, canTransition, validTargets } from '../state-machine.js';
import { OnboardingState } from '../../entities/onboarding-state.js';

describe('SellerProfile State Machine', () => {
  describe('validateTransition', () => {
    it('allows draft → pending_review when onboarding complete', () => {
      const onboarding = OnboardingState.create();
      onboarding.completeStep('identity');
      onboarding.completeStep('banking');
      onboarding.completeStep('tax');
      onboarding.completeStep('terms');

      const result = validateTransition({
        from: 'draft',
        to: 'pending_review',
        onboardingState: onboarding,
      });
      expect(result.allowed).toBe(true);
    });

    it('blocks draft → pending_review when onboarding incomplete', () => {
      const onboarding = OnboardingState.create();
      onboarding.completeStep('identity');

      const result = validateTransition({
        from: 'draft',
        to: 'pending_review',
        onboardingState: onboarding,
      });
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('IDENTITY_SELLER_ONBOARDING_INCOMPLETE');
    });

    it('allows pending_review → active with stripe account', () => {
      const result = validateTransition({
        from: 'pending_review',
        to: 'active',
        onboardingState: OnboardingState.create(),
        stripeConnectAccountId: 'acct_123',
      });
      expect(result.allowed).toBe(true);
    });

    it('blocks pending_review → active without stripe account', () => {
      const result = validateTransition({
        from: 'pending_review',
        to: 'active',
        onboardingState: OnboardingState.create(),
      });
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('IDENTITY_SELLER_STRIPE_REQUIRED');
    });

    it('allows active ↔ suspended', () => {
      expect(
        validateTransition({
          from: 'active',
          to: 'suspended',
          onboardingState: OnboardingState.create(),
        }).allowed
      ).toBe(true);

      expect(
        validateTransition({
          from: 'suspended',
          to: 'active',
          onboardingState: OnboardingState.create(),
        }).allowed
      ).toBe(true);
    });

    it('blocks invalid transitions', () => {
      const result = validateTransition({
        from: 'active',
        to: 'draft',
        onboardingState: OnboardingState.create(),
      });
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('IDENTITY_SELLER_INVALID_TRANSITION');
    });
  });

  describe('canTransition', () => {
    it('returns true for valid transitions', () => {
      expect(canTransition('draft', 'pending_review')).toBe(true);
      expect(canTransition('pending_review', 'active')).toBe(true);
      expect(canTransition('active', 'suspended')).toBe(true);
      expect(canTransition('suspended', 'active')).toBe(true);
    });

    it('returns false for invalid transitions', () => {
      expect(canTransition('draft', 'active')).toBe(false);
      expect(canTransition('active', 'draft')).toBe(false);
      expect(canTransition('suspended', 'pending_review')).toBe(false);
    });
  });

  describe('validTargets', () => {
    it('returns correct targets for each state', () => {
      expect(validTargets('draft')).toEqual(['pending_review']);
      expect(validTargets('pending_review')).toEqual(['active']);
      expect(validTargets('active')).toEqual(['suspended']);
      expect(validTargets('suspended')).toEqual(['active']);
    });
  });
});
