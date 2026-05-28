/**
 * Lazy User Provisioning Service
 *
 * Ensures a domain User record exists for an authenticated actor.
 * Called at application boundaries (route handlers, event consumers)
 * rather than inside auth middleware.
 *
 * Pattern:
 * 1. Check if user exists in local DB
 * 2. If not, create from auth provider data
 * 3. Return the domain user
 */

import { type AuthContext } from '../ports/auth-context.js';
import { type IdentityProvider } from '../ports/identity-provider.js';
import { User } from '../../domain/entities/user.js';
import type { IUserRepository } from '../../domain/repositories/user-repository.js';
import { logger } from '../../../shared/observability/logger.js';

export interface LazyProvisioningDeps {
  readonly userRepository: IUserRepository;
  readonly identityProvider: IdentityProvider;
}

export interface ProvisionedUser {
  readonly user: User;
  readonly isNew: boolean;
}

/**
 * Ensure a User aggregate exists for the given auth context.
 *
 * @returns The existing or newly-created user, plus a flag indicating if new.
 */
export async function ensureUser(
  deps: LazyProvisioningDeps,
  auth: AuthContext
): Promise<ProvisionedUser> {
  // 1. Try to find existing user
  const existing = await deps.userRepository.findById(auth.userId);
  if (existing) {
    return { user: existing, isNew: false };
  }

  // 2. Fetch from auth provider (double-check before creating)
  const authUser = await deps.identityProvider.getUser(auth.userId);
  if (!authUser) {
    logger.warn('Auth user not found at provider during lazy provisioning', {
      userId: auth.userId,
      correlationId: auth.correlationId,
    });
    throw new Error(`User ${auth.userId} exists in JWT but not at auth provider`);
  }

  // 3. Create new domain user
  const user = User.create(
    { id: authUser.id, email: authUser.email },
    auth.correlationId,
    auth.userId // actorId = the user themselves
  );

  await deps.userRepository.save(user);

  logger.info('Lazy provisioned new user', {
    userId: authUser.id,
    email: authUser.email,
    correlationId: auth.correlationId,
  });

  return { user, isNew: true };
}
