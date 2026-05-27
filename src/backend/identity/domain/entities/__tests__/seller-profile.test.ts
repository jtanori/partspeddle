import { describe, it, expect } from 'vitest';
import { SellerProfile } from '../seller-profile.js';
import { DomainError } from '../../../../../shared/errors/domain-error.js';

describe('SellerProfile', () => {
  describe('creation', () => {
    it('creates with draft status', () => {
      const profile = SellerProfile.create({ id: crypto.randomUUID(), userId: crypto.randomUUID() }, 'corr-1');
      expect(profile.status).toBe('draft');
      expect(profile.activatedAt).toBeUndefined();
    });
  });

  describe('onboarding', () => {
    it('completes an onboarding step and emits event', () => {
      const profile = SellerProfile.create({ id: crypto.randomUUID(), userId: crypto.randomUUID() }, 'corr-1');
      profile.completeOnboardingStep('identity', 'corr-1');
      expect(profile.onboardingState.hasStep('identity')).toBe(true);
      expect(profile.uncommittedEvents).toHaveLength(1);
      expect(profile.uncommittedEvents[0].eventType).toBe('identity.seller_onboarding_step_completed');
    });

    it('rejects duplicate step completion', () => {
      const profile = SellerProfile.create({ id: crypto.randomUUID(), userId: crypto.randomUUID() }, 'corr-1');
      profile.completeOnboardingStep('identity', 'corr-1');
      expect(() => profile.completeOnboardingStep('identity', 'corr-1')).toThrow(DomainError);
    });
  });

  describe('stripe account', () => {
    it('links stripe account', () => {
      const profile = SellerProfile.create({ id: crypto.randomUUID(), userId: crypto.randomUUID() }, 'corr-1');
      profile.linkStripeAccount('acct_123');
      expect(profile.stripeConnectAccountId).toBe('acct_123');
    });

    it('rejects empty stripe account id', () => {
      const profile = SellerProfile.create({ id: crypto.randomUUID(), userId: crypto.randomUUID() }, 'corr-1');
      expect(() => profile.linkStripeAccount('')).toThrow(DomainError);
    });
  });

  describe('submit for review', () => {
    it('transitions draft → pending_review when onboarding complete', () => {
      const profile = SellerProfile.create({ id: crypto.randomUUID(), userId: crypto.randomUUID() }, 'corr-1');
      profile.completeOnboardingStep('identity', 'corr-1');
      profile.completeOnboardingStep('banking', 'corr-1');
      profile.completeOnboardingStep('tax', 'corr-1');
      profile.completeOnboardingStep('terms', 'corr-1');
      profile.submitForReview('corr-1');
      expect(profile.status).toBe('pending_review');
    });

    it('rejects submit when onboarding incomplete', () => {
      const profile = SellerProfile.create({ id: crypto.randomUUID(), userId: crypto.randomUUID() }, 'corr-1');
      profile.completeOnboardingStep('identity', 'corr-1');
      expect(() => profile.submitForReview('corr-1')).toThrow(DomainError);
    });
  });

  describe('activation', () => {
    it('activates when stripe linked and sets activated_at', () => {
      const profile = SellerProfile.create({ id: crypto.randomUUID(), userId: crypto.randomUUID() }, 'corr-1');
      profile.completeOnboardingStep('identity', 'corr-1');
      profile.completeOnboardingStep('banking', 'corr-1');
      profile.completeOnboardingStep('tax', 'corr-1');
      profile.completeOnboardingStep('terms', 'corr-1');
      profile.submitForReview('corr-1');
      profile.linkStripeAccount('acct_123');
      profile.clearEvents();
      profile.activate('corr-1');
      expect(profile.status).toBe('active');
      expect(profile.activatedAt).toBeInstanceOf(Date);
      expect(profile.uncommittedEvents).toHaveLength(1); // activated
      expect(profile.uncommittedEvents[0].eventType).toBe('identity.seller_activated');
    });

    it('rejects activation without stripe account', () => {
      const profile = SellerProfile.create({ id: crypto.randomUUID(), userId: crypto.randomUUID() }, 'corr-1');
      profile.completeOnboardingStep('identity', 'corr-1');
      profile.completeOnboardingStep('banking', 'corr-1');
      profile.completeOnboardingStep('tax', 'corr-1');
      profile.completeOnboardingStep('terms', 'corr-1');
      profile.submitForReview('corr-1');
      expect(() => profile.activate('corr-1')).toThrow(DomainError);
    });
  });

  describe('suspension and reactivation', () => {
    it('suspends active seller', () => {
      const profile = SellerProfile.create({ id: crypto.randomUUID(), userId: crypto.randomUUID() }, 'corr-1');
      profile.completeOnboardingStep('identity', 'corr-1');
      profile.completeOnboardingStep('banking', 'corr-1');
      profile.completeOnboardingStep('tax', 'corr-1');
      profile.completeOnboardingStep('terms', 'corr-1');
      profile.submitForReview('corr-1');
      profile.linkStripeAccount('acct_123');
      profile.activate('corr-1');
      const activatedAt = profile.activatedAt;
      profile.suspend('fraud detected', 'corr-1');
      expect(profile.status).toBe('suspended');
      profile.reactivate('corr-1');
      expect(profile.status).toBe('active');
      expect(profile.activatedAt).toEqual(activatedAt); // preserved
    });

    it('rejects invalid transitions', () => {
      const profile = SellerProfile.create({ id: crypto.randomUUID(), userId: crypto.randomUUID() }, 'corr-1');
      expect(() => profile.activate('corr-1')).toThrow(DomainError);
      expect(() => profile.suspend('reason', 'corr-1')).toThrow(DomainError);
    });
  });

  describe('clearEvents', () => {
    it('clears uncommitted events', () => {
      const profile = SellerProfile.create({ id: crypto.randomUUID(), userId: crypto.randomUUID() }, 'corr-1');
      profile.completeOnboardingStep('identity', 'corr-1');
      expect(profile.uncommittedEvents).toHaveLength(1);
      profile.clearEvents();
      expect(profile.uncommittedEvents).toHaveLength(0);
    });
  });
});
