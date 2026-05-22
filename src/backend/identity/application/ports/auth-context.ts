/**
 * AuthContext — Canonical Authenticated Request Shape
 *
 * The ONLY type used to represent an authenticated actor across the platform.
 * No Supabase SDK types leak into this contract.
 *
 * Supports human users, service accounts, and future machine actors.
 */

import { DomainError } from '../../../../shared/errors/domain-error.js';
import type { VerifiedToken } from './identity-provider.js';

export type UserRole = 'user' | 'seller' | 'admin';

export interface AuthContext {
  readonly userId: string;
  readonly authProvider: string;
  readonly authProviderUserId: string;
  readonly email: string;
  readonly roles: readonly UserRole[];
  readonly correlationId: string;
  readonly traceparent?: string;
}

export interface AuthContextProps {
  readonly verifiedToken: VerifiedToken;
  readonly correlationId: string;
  readonly traceparent?: string;
}

/**
 * Create an AuthContext from a verified JWT payload.
 *
 * @throws {DomainError} IDENTITY_AUTH_INVALID_CONTEXT if required claims missing
 */
export function createAuthContext(props: AuthContextProps): AuthContext {
  const { verifiedToken, correlationId, traceparent } = props;

  if (!verifiedToken.sub) {
    throw new DomainError(
      'IDENTITY_AUTH_INVALID_CONTEXT',
      'JWT missing sub (user ID) claim',
      correlationId,
      false,
    );
  }

  if (!verifiedToken.email) {
    throw new DomainError(
      'IDENTITY_AUTH_INVALID_CONTEXT',
      'JWT missing email claim',
      correlationId,
      false,
    );
  }

  // Derive roles from JWT claims
  const roles: UserRole[] = ['user'];
  const jwtRole = verifiedToken.role ??
    (verifiedToken.app_metadata?.role as string | undefined);

  if (jwtRole === 'seller') roles.push('seller');
  if (jwtRole === 'admin') roles.push('admin');

  return Object.freeze({
    userId: verifiedToken.sub,
    authProvider: 'supabase',
    authProviderUserId: verifiedToken.sub,
    email: verifiedToken.email,
    roles,
    correlationId,
    traceparent,
  });
}

/**
 * Check if the authenticated actor has a specific role.
 */
export function hasRole(ctx: AuthContext, role: UserRole): boolean {
  return ctx.roles.includes(role);
}

/**
 * Assert that the authenticated actor has a specific role.
 *
 * @throws {DomainError} IDENTITY_AUTH_FORBIDDEN if role missing
 */
export function requireRole(ctx: AuthContext, role: UserRole): void {
  if (!hasRole(ctx, role)) {
    throw new DomainError(
      'IDENTITY_AUTH_FORBIDDEN',
      `Required role '${role}' not present`,
      ctx.correlationId,
      false,
    );
  }
}
