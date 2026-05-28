/**
 * SellerProfile aggregate root — Identity bounded context.
 *
 * Manages seller lifecycle with deterministic state machine transitions.
 *
 * State machine:
 *   draft → pending_review → active ↔ suspended
 *     ↑                       ↓
 *     └─── reactivation ──────┘
 *
 * Invariants:
 * - All 4 onboarding steps required before pending_review
 * - Stripe Connect account required before active
 * - activated_at set only on first activation (immutable thereafter)
 * - Reactivation preserves original activated_at
 * - draft is irreversible (no transitions back to draft)
 */

import { DomainEvent } from '../../../../shared/event-bus/domain-event.js';
import { DomainError } from '../../../../shared/errors/domain-error.js';
import { OnboardingState } from './onboarding-state.js';
import type {
  SellerStatus,
  OnboardingStep,
} from '../../../../shared/contracts/identity/seller-schema.js';
import {
  createSellerOnboardingStepCompletedEvent,
  createSellerActivatedEvent,
  createSellerSuspendedEvent,
  createSellerReactivatedEvent,
} from '../events/seller-events.js';

const VALID_TRANSITIONS: Record<SellerStatus, readonly SellerStatus[]> = {
  draft: ['pending_review'],
  pending_review: ['active'],
  active: ['suspended'],
  suspended: ['active'],
};

export interface SellerProfileProps {
  readonly id: string;
  readonly userId: string;
  readonly status?: SellerStatus;
  readonly stripeConnectAccountId?: string;
  readonly activatedAt?: Date;
  readonly onboardingState?: OnboardingState;
}

export class SellerProfile {
  readonly id: string;
  readonly userId: string;
  private _status: SellerStatus;
  private _stripeConnectAccountId: string | undefined;
  private _activatedAt: Date | undefined;
  private _onboardingState: OnboardingState;
  private _uncommittedEvents: DomainEvent[] = [];

  private constructor(props: SellerProfileProps) {
    this.id = props.id;
    this.userId = props.userId;
    this._status = props.status ?? 'draft';
    this._stripeConnectAccountId = props.stripeConnectAccountId;
    this._activatedAt = props.activatedAt;
    this._onboardingState = props.onboardingState ?? OnboardingState.create();
    this._validate();
  }

  // ─── Factory Methods ────────────────────────────────────────────────────────

  static create(
    props: { readonly id: string; readonly userId: string },
    _correlationId: string,
    _actorId = 'system'
  ): SellerProfile {
    const profile = new SellerProfile({ id: props.id, userId: props.userId });
    return profile;
  }

  static rehydrate(props: SellerProfileProps): SellerProfile {
    return new SellerProfile(props);
  }

  // ─── Accessors ──────────────────────────────────────────────────────────────

  get status(): SellerStatus {
    return this._status;
  }

  get stripeConnectAccountId(): string | undefined {
    return this._stripeConnectAccountId;
  }

  get activatedAt(): Date | undefined {
    return this._activatedAt;
  }

  get onboardingState(): OnboardingState {
    return this._onboardingState;
  }

  get uncommittedEvents(): readonly DomainEvent[] {
    return this._uncommittedEvents;
  }

  // ─── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Complete an onboarding step.
   *
   * @throws {DomainError} IDENTITY_ONBOARDING_STEP_ALREADY_COMPLETED if duplicate
   */
  completeOnboardingStep(step: OnboardingStep, correlationId: string, actorId = 'system'): void {
    this._onboardingState.completeStep(step);
    this._uncommittedEvents.push(
      createSellerOnboardingStepCompletedEvent(
        { sellerProfileId: this.id, userId: this.userId, step },
        correlationId,
        actorId
      )
    );
  }

  /**
   * Link a Stripe Connect account.
   * Required before activation.
   */
  linkStripeAccount(stripeAccountId: string): void {
    if (!stripeAccountId || stripeAccountId.trim().length === 0) {
      throw new DomainError(
        'IDENTITY_SELLER_INVALID_STRIPE_ACCOUNT',
        'Stripe Connect account ID cannot be empty',
        crypto.randomUUID(),
        false
      );
    }
    this._stripeConnectAccountId = stripeAccountId;
  }

  /**
   * Submit for review (draft → pending_review).
   * All onboarding steps must be completed.
   */
  submitForReview(correlationId: string, _actorId = 'system'): void {
    this._assertTransitionTo('pending_review');

    if (!this._onboardingState.isComplete) {
      const missing = ['identity', 'banking', 'tax', 'terms'].filter(
        (s) => !this._onboardingState.hasStep(s as OnboardingStep)
      );
      throw new DomainError(
        'IDENTITY_SELLER_ONBOARDING_INCOMPLETE',
        `Cannot submit for review: missing onboarding steps [${missing.join(', ')}]`,
        correlationId,
        false,
        { missingSteps: missing }
      );
    }

    this._status = 'pending_review';
  }

  /**
   * Activate the seller (pending_review → active).
   * Requires Stripe Connect account.
   * Sets activated_at only on first activation.
   */
  activate(correlationId: string, actorId = 'system'): void {
    this._assertTransitionTo('active');

    if (!this._stripeConnectAccountId) {
      throw new DomainError(
        'IDENTITY_SELLER_STRIPE_REQUIRED',
        'Cannot activate: Stripe Connect account not linked',
        correlationId,
        false
      );
    }

    this._status = 'active';
    const isFirstActivation = !this._activatedAt;
    if (isFirstActivation) {
      this._activatedAt = new Date();
    }

    this._uncommittedEvents.push(
      createSellerActivatedEvent(
        {
          sellerProfileId: this.id,
          userId: this.userId,
          stripeConnectAccountId: this._stripeConnectAccountId,
          firstActivation: isFirstActivation,
        },
        correlationId,
        actorId
      )
    );
  }

  /**
   * Suspend the seller (active → suspended).
   */
  suspend(reason: string, correlationId: string, actorId = 'system'): void {
    this._assertTransitionTo('suspended');
    this._status = 'suspended';
    this._uncommittedEvents.push(
      createSellerSuspendedEvent(
        { sellerProfileId: this.id, userId: this.userId, reason },
        correlationId,
        actorId
      )
    );
  }

  /**
   * Reactivate the seller (suspended → active).
   * Preserves the original activated_at.
   */
  reactivate(correlationId: string, actorId = 'system'): void {
    this._assertTransitionTo('active');
    this._status = 'active';
    this._uncommittedEvents.push(
      createSellerReactivatedEvent(
        {
          sellerProfileId: this.id,
          userId: this.userId,
          activatedAt: this._activatedAt?.toISOString(),
        },
        correlationId,
        actorId
      )
    );
  }

  clearEvents(): void {
    this._uncommittedEvents = [];
  }

  // ─── Invariants ─────────────────────────────────────────────────────────────

  private _assertTransitionTo(target: SellerStatus): void {
    if (!VALID_TRANSITIONS[this._status].includes(target)) {
      throw new DomainError(
        'IDENTITY_SELLER_INVALID_TRANSITION',
        `Cannot transition from ${this._status} to ${target}`,
        crypto.randomUUID(),
        false,
        { from: this._status, to: target }
      );
    }
  }

  private _validate(): void {
    if (!this.id) {
      throw new DomainError(
        'IDENTITY_SELLER_INVALID_ID',
        'SellerProfile.id is required',
        crypto.randomUUID(),
        false
      );
    }
    if (!this.userId) {
      throw new DomainError(
        'IDENTITY_SELLER_INVALID_USER_ID',
        'SellerProfile.userId is required',
        crypto.randomUUID(),
        false
      );
    }
  }
}
