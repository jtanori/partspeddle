/**
 * Identity Integration Tests
 *
 * Scenarios:
 * 1. Auth sync trigger creates user + profile
 * 2. Onboarding completion transitions seller status
 * 3. Event emission verified (outbox entry created)
 *
 * Requires: running Postgres + Redis, migrations applied.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from '../../setup-integration.js';
import { User } from '../../../src/identity/domain/entities/user.js';
import { Profile } from '../../../src/identity/domain/entities/profile.js';
import { SellerProfile } from '../../../src/identity/domain/entities/seller-profile.js';
import { PostgresUserRepository } from '../../../src/identity/infrastructure/persistence/user-repository.js';
import { PostgresProfileRepository } from '../../../src/identity/infrastructure/persistence/profile-repository.js';
import { PostgresSellerProfileRepository } from '../../../src/identity/infrastructure/persistence/seller-profile-repository.js';

describe('Identity Lifecycle (integration)', () => {
  it('creates user and profile via repository', async () => {
    const userRepo = new PostgresUserRepository(sql);
    const profileRepo = new PostgresProfileRepository(sql);

    const user = User.create({ id: crypto.randomUUID(), email: 'test@example.com' }, 'corr-1');
    await userRepo.save(user);

    const profile = new Profile({ id: crypto.randomUUID(), userId: user.id });
    await profileRepo.save(profile);

    const foundUser = await userRepo.findById(user.id);
    expect(foundUser).not.toBeNull();
    expect(foundUser!.email).toBe('test@example.com');

    const foundProfile = await profileRepo.findByUserId(user.id);
    expect(foundProfile).not.toBeNull();
    expect(foundProfile!.userId).toBe(user.id);
  });

  it('persists outbox events on user save', async () => {
    const userRepo = new PostgresUserRepository(sql);
    const user = User.create({ id: crypto.randomUUID(), email: 'test@example.com' }, 'corr-1');
    await userRepo.save(user);

    const outboxRows = await sql`
      SELECT event_type, aggregate_id
      FROM outbox
      WHERE status = 'pending'
    `;

    expect(outboxRows.length).toBeGreaterThanOrEqual(1);
    expect((outboxRows[0] as { event_type: string }).event_type).toBe('identity.user_created');
  });

  it('completes seller onboarding and transitions status', async () => {
    const userRepo = new PostgresUserRepository(sql);
    const sellerRepo = new PostgresSellerProfileRepository(sql);

    const user = User.create({ id: crypto.randomUUID(), email: 'seller@example.com' }, 'corr-1');
    await userRepo.save(user);

    const profile = SellerProfile.create(
      { id: crypto.randomUUID(), userId: user.id },
      'corr-1',
    );
    profile.linkStripeAccount('acct_test');
    await sellerRepo.save(profile);

    // Complete all onboarding steps
    profile.completeOnboardingStep('identity', 'corr-1');
    profile.completeOnboardingStep('banking', 'corr-1');
    profile.completeOnboardingStep('tax', 'corr-1');
    profile.completeOnboardingStep('terms', 'corr-1');
    profile.submitForReview('corr-1');
    profile.activate('corr-1');
    await sellerRepo.save(profile);

    const found = await sellerRepo.findById(profile.id);
    expect(found).not.toBeNull();
    expect(found!.status).toBe('active');
    expect(found!.activatedAt).toBeInstanceOf(Date);
    expect(found!.onboardingState.isComplete).toBe(true);
  });
});
