/**
 * IdentityProvider Port
 *
 * Abstracts authentication provider semantics from the domain layer.
 * Supabase Auth is the current implementation, but this interface allows
 * future provider swaps (Auth0, Cognito, Clerk, etc.) without domain changes.
 *
 * @see /project-knowledge/adr/002-auth-provider-decoupling.md
 */

export interface VerifiedToken {
  readonly sub: string;
  readonly email: string;
  readonly aud: string;
  readonly exp: number;
  readonly iat: number;
  readonly role?: string;
  readonly app_metadata?: Record<string, unknown>;
  readonly user_metadata?: Record<string, unknown>;
}

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly authProvider: string;
  readonly authProviderUserId: string;
  readonly roles: string[];
  readonly metadata?: Record<string, unknown>;
}

export interface IdentityProvider {
  /**
   * Verify a JWT access token and return the decoded claims.
   *
   * @throws {DomainError} IDENTITY_AUTH_INVALID_TOKEN if verification fails
   */
  verifyToken(token: string): Promise<VerifiedToken>;

  /**
   * Retrieve user information from the auth provider by user ID.
   * Returns null if the user does not exist at the provider.
   */
  getUser(userId: string): Promise<AuthUser | null>;

  /**
   * Revoke all active sessions for a user.
   * Used on suspension, password change, or security events.
   */
  revokeSessions(userId: string): Promise<void>;
}
