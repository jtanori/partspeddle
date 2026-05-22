import { describe, it, expect, vi } from 'vitest';
import { ensureUser } from '../lazy-user-provisioning.js';
import { InMemoryUserRepository } from '../../../infrastructure/persistence/user-repository.memory.js';
import { User } from '../../../domain/entities/user.js';
import type { IdentityProvider, AuthUser } from '../../ports/identity-provider.js';
import type { AuthContext } from '../../ports/auth-context.js';

function createMockProvider(user: AuthUser | null): IdentityProvider {
  return {
    verifyToken: vi.fn(),
    getUser: vi.fn().mockResolvedValue(user),
    revokeSessions: vi.fn(),
  };
}

function createAuthContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-123',
    authProvider: 'supabase',
    authProviderUserId: 'user-123',
    email: 'test@example.com',
    roles: ['user'],
    correlationId: 'corr-1',
    ...overrides,
  };
}

describe('ensureUser (lazy provisioning)', () => {
  it('returns existing user without creating new', async () => {
    const repo = new InMemoryUserRepository();
    const existing = User.create({ id: 'user-123', email: 'test@example.com' }, 'corr-1');
    await repo.save(existing);

    const provider = createMockProvider(null);
    const auth = createAuthContext();

    const result = await ensureUser({ userRepository: repo, identityProvider: provider }, auth);

    expect(result.isNew).toBe(false);
    expect(result.user.id).toBe('user-123');
    expect(provider.getUser).not.toHaveBeenCalled();
  });

  it('creates new user when not found locally', async () => {
    const repo = new InMemoryUserRepository();
    const provider = createMockProvider({
      id: 'user-123',
      email: 'test@example.com',
      authProvider: 'supabase',
      authProviderUserId: 'user-123',
      roles: ['user'],
    });
    const auth = createAuthContext();

    const result = await ensureUser({ userRepository: repo, identityProvider: provider }, auth);

    expect(result.isNew).toBe(true);
    expect(result.user.id).toBe('user-123');
    expect(result.user.email).toBe('test@example.com');

    // Verify persisted
    const found = await repo.findById('user-123');
    expect(found).not.toBeNull();
  });

  it('throws when auth provider user not found', async () => {
    const repo = new InMemoryUserRepository();
    const provider = createMockProvider(null);
    const auth = createAuthContext();

    await expect(
      ensureUser({ userRepository: repo, identityProvider: provider }, auth),
    ).rejects.toThrow('User user-123 exists in JWT but not at auth provider');
  });
});
