/**
 * OnboardingState entity — tracks completion of mandatory seller onboarding steps.
 *
 * Steps: identity | banking | tax | terms
 * All 4 required before a seller can submit for review.
 */

import { DomainError } from '../../../../shared/errors/domain-error.js';
import type { OnboardingStep } from '../../../../shared/contracts/identity/seller-schema.js';

const ALL_STEPS: readonly OnboardingStep[] = ['identity', 'banking', 'tax', 'terms'];

export interface OnboardingStateProps {
  readonly completedSteps: readonly OnboardingStep[];
}

export class OnboardingState {
  private _completedSteps: Set<OnboardingStep>;

  constructor(props: OnboardingStateProps) {
    this._completedSteps = new Set(props.completedSteps);
    this._validate();
  }

  // ─── Factory ────────────────────────────────────────────────────────────────

  static create(): OnboardingState {
    return new OnboardingState({ completedSteps: [] });
  }

  static rehydrate(props: OnboardingStateProps): OnboardingState {
    return new OnboardingState(props);
  }

  // ─── Accessors ──────────────────────────────────────────────────────────────

  get completedSteps(): readonly OnboardingStep[] {
    return Array.from(this._completedSteps);
  }

  get isComplete(): boolean {
    return ALL_STEPS.every((step) => this._completedSteps.has(step));
  }

  hasStep(step: OnboardingStep): boolean {
    return this._completedSteps.has(step);
  }

  // ─── Mutations ──────────────────────────────────────────────────────────────

  completeStep(step: OnboardingStep): void {
    if (this._completedSteps.has(step)) {
      throw new DomainError(
        'IDENTITY_ONBOARDING_STEP_ALREADY_COMPLETED',
        `Onboarding step '${step}' is already completed`,
        crypto.randomUUID(),
        false,
        { step },
      );
    }
    this._completedSteps.add(step);
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  private _validate(): void {
    for (const step of this._completedSteps) {
      if (!ALL_STEPS.includes(step)) {
        throw new DomainError(
          'IDENTITY_ONBOARDING_INVALID_STEP',
          `Invalid onboarding step: ${step}`,
          crypto.randomUUID(),
          false,
          { step, allowed: ALL_STEPS },
        );
      }
    }
  }
}
