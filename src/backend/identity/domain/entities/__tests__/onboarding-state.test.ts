import { describe, it, expect } from 'vitest';
import { OnboardingState } from '../onboarding-state.js';
import { DomainError } from '../../../../shared/errors/domain-error.js';

describe('OnboardingState', () => {
  it('creates with no completed steps', () => {
    const state = OnboardingState.create();
    expect(state.completedSteps).toEqual([]);
    expect(state.isComplete).toBe(false);
  });

  it('completes a step', () => {
    const state = OnboardingState.create();
    state.completeStep('identity');
    expect(state.hasStep('identity')).toBe(true);
    expect(state.isComplete).toBe(false);
  });

  it('is complete when all 4 steps done', () => {
    const state = OnboardingState.create();
    state.completeStep('identity');
    state.completeStep('banking');
    state.completeStep('tax');
    state.completeStep('terms');
    expect(state.isComplete).toBe(true);
    expect(state.completedSteps).toHaveLength(4);
  });

  it('rejects duplicate step completion', () => {
    const state = OnboardingState.create();
    state.completeStep('identity');
    expect(() => state.completeStep('identity')).toThrow(DomainError);
  });

  it('rehydrates from completed steps', () => {
    const state = OnboardingState.rehydrate({ completedSteps: ['identity', 'banking'] });
    expect(state.hasStep('identity')).toBe(true);
    expect(state.hasStep('banking')).toBe(true);
    expect(state.hasStep('tax')).toBe(false);
  });
});
