/**
 * User aggregate root — Identity bounded context.
 *
 * Manages user lifecycle and status transitions. Invariants:
 * - Status transitions: active ↔ suspended, active → deactivated (no skips)
 * - Email format validated; uniqueness enforced at repository level
 * - Suspension emits identity.user.suspended (cascades to session revocation downstream)
 */

import { DomainEvent } from '../../../../shared/event-bus/domain-event.js';
import { DomainError } from '../../../../shared/errors/domain-error.js';
import type { Profile } from './profile.js';
import type { BuyerProfile } from './buyer-profile.js';
import type { UserStatus } from '../../../../shared/contracts/identity/user-schema.js';
import {
  createUserCreatedEvent,
  createUserSuspendedEvent,
  createUserReactivatedEvent,
} from '../events/user-events.js';

const VALID_TRANSITIONS: Record<UserStatus, readonly UserStatus[]> = {
  active: ['suspended', 'deactivated'],
  suspended: ['active'],
  deactivated: [],
};

export interface UserProps {
  readonly id: string;
  readonly email: string;
  readonly status?: UserStatus;
  readonly profile?: Profile;
  readonly buyerProfile?: BuyerProfile;
}

export class User {
  readonly id: string;
  readonly email: string;
  private _status: UserStatus;
  private _profile: Profile | undefined;
  private _buyerProfile: BuyerProfile | undefined;
  private _uncommittedEvents: DomainEvent[] = [];

  private constructor(props: UserProps) {
    this.id = props.id;
    this.email = props.email;
    this._status = props.status ?? 'active';
    this._profile = props.profile;
    this._buyerProfile = props.buyerProfile;
    this._validate();
  }

  // ─── Factory Methods ────────────────────────────────────────────────────────

  static create(
    props: { readonly id: string; readonly email: string },
    correlationId: string,
    actorId = 'system',
  ): User {
    const user = new User({ id: props.id, email: props.email, status: 'active' });
    user._uncommittedEvents.push(
      createUserCreatedEvent({ userId: props.id, email: props.email }, correlationId, actorId),
    );
    return user;
  }

  static rehydrate(props: UserProps): User {
    return new User(props);
  }

  // ─── Accessors ──────────────────────────────────────────────────────────────

  get status(): UserStatus {
    return this._status;
  }

  get profile(): Profile | undefined {
    return this._profile;
  }

  get buyerProfile(): BuyerProfile | undefined {
    return this._buyerProfile;
  }

  get uncommittedEvents(): readonly DomainEvent[] {
    return this._uncommittedEvents;
  }

  // ─── Mutations ──────────────────────────────────────────────────────────────

  suspend(reason: string, correlationId: string, actorId = 'system'): void {
    this._assertTransitionTo('suspended');
    this._status = 'suspended';
    this._uncommittedEvents.push(
      createUserSuspendedEvent(
        { userId: this.id, reason, previousStatus: 'active' },
        correlationId,
        actorId,
      ),
    );
  }

  reactivate(correlationId: string, actorId = 'system'): void {
    this._assertTransitionTo('active');
    this._status = 'active';
    this._uncommittedEvents.push(
      createUserReactivatedEvent(
        { userId: this.id, previousStatus: 'suspended' },
        correlationId,
        actorId,
      ),
    );
  }

  clearEvents(): void {
    this._uncommittedEvents = [];
  }

  // ─── Invariants ─────────────────────────────────────────────────────────────

  private _assertTransitionTo(target: UserStatus): void {
    if (!VALID_TRANSITIONS[this._status].includes(target)) {
      throw new DomainError(
        'IDENTITY_USER_INVALID_TRANSITION',
        `Cannot transition from ${this._status} to ${target}`,
        crypto.randomUUID(),
        false,
        { from: this._status, to: target },
      );
    }
  }

  private _validate(): void {
    if (!this.id) {
      throw new DomainError(
        'IDENTITY_USER_INVALID_ID',
        'User.id is required',
        crypto.randomUUID(),
        false,
      );
    }
    if (!this.email.includes('@')) {
      throw new DomainError(
        'IDENTITY_USER_INVALID_EMAIL',
        'User.email must be a valid email address',
        crypto.randomUUID(),
        false,
      );
    }
  }
}
