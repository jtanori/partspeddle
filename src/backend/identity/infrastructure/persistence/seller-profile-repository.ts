/**
 * PostgreSQL SellerProfile Repository
 *
 * Implements ISellerProfileRepository with outbox integration.
 * Manages both the seller_profiles table and the onboarding_steps table.
 */

import type postgres from 'postgres';
import type { ISellerProfileRepository } from '../../domain/repositories/seller-profile-repository.js';
import { SellerProfile } from '../../domain/entities/seller-profile.js';
import type { SellerStatus } from '../../../../shared/contracts/identity/seller-schema.js';
import { OnboardingState } from '../../domain/entities/onboarding-state.js';
import { Outbox } from '../../../shared/outbox/outbox.js';
import { PostgresOutboxAdapter } from '../../../shared/outbox/postgres-adapter.js';

export class PostgresSellerProfileRepository implements ISellerProfileRepository {
  constructor(private readonly sql: ReturnType<typeof postgres>) {}

  async findById(id: string): Promise<SellerProfile | null> {
    const profileRows = await this.sql`
      SELECT id, user_id, status, stripe_connect_account_id, activated_at
      FROM identity.seller_profiles
      WHERE id = ${id}
      LIMIT 1
    `;

    if (profileRows.length === 0) {
      return null;
    }

    const row = profileRows[0] as {
      id: string;
      user_id: string;
      status: string;
      stripe_connect_account_id: string | null;
      activated_at: Date | null;
    };

    const onboardingState = await this._loadOnboardingState(row.id);

    return SellerProfile.rehydrate({
      id: row.id,
      userId: row.user_id,
      status: row.status as SellerStatus,
      stripeConnectAccountId: row.stripe_connect_account_id ?? undefined,
      activatedAt: row.activated_at ? new Date(row.activated_at) : undefined,
      onboardingState,
    });
  }

  async findByUserId(userId: string): Promise<SellerProfile | null> {
    const profileRows = await this.sql`
      SELECT id, user_id, status, stripe_connect_account_id, activated_at
      FROM identity.seller_profiles
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    if (profileRows.length === 0) {
      return null;
    }

    const row = profileRows[0] as {
      id: string;
      user_id: string;
      status: string;
      stripe_connect_account_id: string | null;
      activated_at: Date | null;
    };

    const onboardingState = await this._loadOnboardingState(row.id);

    return SellerProfile.rehydrate({
      id: row.id,
      userId: row.user_id,
      status: row.status as SellerStatus,
      stripeConnectAccountId: row.stripe_connect_account_id ?? undefined,
      activatedAt: row.activated_at ? new Date(row.activated_at) : undefined,
      onboardingState,
    });
  }

  async save(profile: SellerProfile): Promise<void> {
    await this.sql.begin(async (tx) => {
      // Upsert seller profile
      await tx`
        INSERT INTO identity.seller_profiles (
          id, user_id, status, stripe_connect_account_id, activated_at, created_at, updated_at
        ) VALUES (
          ${profile.id}, ${profile.userId}, ${profile.status},
          ${profile.stripeConnectAccountId ?? null},
          ${profile.activatedAt ?? null},
          NOW(), NOW()
        )
        ON CONFLICT (user_id) DO UPDATE SET
          status = EXCLUDED.status,
          stripe_connect_account_id = EXCLUDED.stripe_connect_account_id,
          activated_at = EXCLUDED.activated_at,
          updated_at = NOW()
      `;

      // Upsert onboarding steps
      for (const step of profile.onboardingState.completedSteps) {
        await tx`
          INSERT INTO identity.onboarding_steps (seller_profile_id, step, completed_at, created_at, updated_at)
          VALUES (${profile.id}, ${step}, NOW(), NOW(), NOW())
          ON CONFLICT (seller_profile_id, step) DO UPDATE SET
            completed_at = EXCLUDED.completed_at,
            updated_at = NOW()
        `;
      }

      // Persist uncommitted events to outbox
      const outbox = new Outbox(new PostgresOutboxAdapter(tx));
      for (const event of profile.uncommittedEvents) {
        await outbox.insert(event);
      }
    });

    profile.clearEvents();
  }

  private async _loadOnboardingState(sellerProfileId: string): Promise<OnboardingState> {
    const rows = await this.sql<{ step: string }[]>`
      SELECT step
      FROM identity.onboarding_steps
      WHERE seller_profile_id = ${sellerProfileId}
        AND completed_at IS NOT NULL
    `;

    const completedSteps = rows.map((r) => r.step as 'identity' | 'banking' | 'tax' | 'terms');

    return OnboardingState.rehydrate({ completedSteps });
  }
}
