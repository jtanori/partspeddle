/**
 * In-Memory SellerProfile Repository — for unit testing.
 *
 * No outbox integration; events remain on the aggregate for test assertions.
 */

import type { ISellerProfileRepository } from '../../domain/repositories/seller-profile-repository.js';
import { SellerProfile } from '../../domain/entities/seller-profile.js';

export class InMemorySellerProfileRepository implements ISellerProfileRepository {
  private readonly profiles = new Map<string, SellerProfile>();
  private readonly userIdIndex = new Map<string, string>(); // userId -> id

  findById(id: string): Promise<SellerProfile | null> {
    const profile = this.profiles.get(id);
    return Promise.resolve(
      profile
        ? SellerProfile.rehydrate({
            id: profile.id,
            userId: profile.userId,
            status: profile.status,
            stripeConnectAccountId: profile.stripeConnectAccountId,
            activatedAt: profile.activatedAt,
            onboardingState: profile.onboardingState,
          })
        : null,
    );
  }

  findByUserId(userId: string): Promise<SellerProfile | null> {
    const id = this.userIdIndex.get(userId);
    if (!id) return Promise.resolve(null);
    return this.findById(id);
  }

  save(profile: SellerProfile): Promise<void> {
    this.profiles.set(
      profile.id,
      SellerProfile.rehydrate({
        id: profile.id,
        userId: profile.userId,
        status: profile.status,
        stripeConnectAccountId: profile.stripeConnectAccountId,
        activatedAt: profile.activatedAt,
        onboardingState: profile.onboardingState,
      }),
    );
    this.userIdIndex.set(profile.userId, profile.id);
    return Promise.resolve();
  }

  clear(): void {
    this.profiles.clear();
    this.userIdIndex.clear();
  }
}
