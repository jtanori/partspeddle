/**
 * Supabase Auth Provider Implementation
 *
 * Implements the IdentityProvider port using jose for JWT verification
 * and Supabase REST API for user management.
 *
 * JWT verification uses the Supabase JWT secret (symmetric HS256).
 * This avoids SDK lock-in while maintaining compatibility.
 */

import { jwtVerify, type JWTVerifyResult } from 'jose';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  type IdentityProvider,
  type VerifiedToken,
  type AuthUser,
} from '../../application/ports/identity-provider.js';
import { DomainError } from '../../../../shared/errors/domain-error.js';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? '';
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';

function toVerifiedToken(result: JWTVerifyResult): VerifiedToken {
  const payload = result.payload;
  return {
    sub: typeof payload.sub === 'string' ? payload.sub : '',
    email: typeof payload.email === 'string' ? payload.email : '',
    aud: typeof payload.aud === 'string' ? payload.aud : '',
    exp: Number(payload.exp ?? 0),
    iat: Number(payload.iat ?? 0),
    role: typeof payload.role === 'string' ? payload.role : undefined,
    app_metadata: payload.app_metadata as Record<string, unknown> | undefined,
    user_metadata: payload.user_metadata as Record<string, unknown> | undefined,
  };
}

export class SupabaseAuthProvider implements IdentityProvider {
  private readonly secret: Uint8Array;
  private readonly adminClient: SupabaseClient;

  constructor() {
    if (!JWT_SECRET) {
      throw new Error('SUPABASE_JWT_SECRET is required for JWT verification');
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
    }
    this.secret = new TextEncoder().encode(JWT_SECRET);
    this.adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async verifyToken(token: string): Promise<VerifiedToken> {
    try {
      const result = await jwtVerify(token, this.secret, {
        clockTolerance: 30,
        issuer: `${SUPABASE_URL}/auth/v1`,
        audience: 'authenticated',
      });
      return toVerifiedToken(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown JWT error';
      throw new DomainError(
        'IDENTITY_AUTH_INVALID_TOKEN',
        `Token verification failed: ${message}`,
        crypto.randomUUID(),
        false
      );
    }
  }

  async getUser(userId: string): Promise<AuthUser | null> {
    const result = await this.adminClient.auth.admin.getUserById(userId);

    // Supabase types may not mark error as nullable; defensively check both shapes
    if ((result as { error?: { message: string } | null }).error) {
      return null;
    }

    const user = (
      result as {
        data?: {
          user?: {
            id: string;
            email?: string;
            app_metadata?: Record<string, unknown>;
            user_metadata?: Record<string, unknown>;
          } | null;
        };
      }
    ).data?.user;
    if (!user) {
      return null;
    }

    const roles: string[] = ['user'];
    const appRole = user.app_metadata?.role;
    if (appRole === 'seller') roles.push('seller');
    if (appRole === 'admin') roles.push('admin');

    return {
      id: user.id,
      email: user.email ?? '',
      authProvider: 'supabase',
      authProviderUserId: user.id,
      roles,
      metadata: user.user_metadata ?? {},
    };
  }

  async revokeSessions(userId: string): Promise<void> {
    const { error } = await this.adminClient.auth.admin.signOut(userId);
    if (error) {
      throw new DomainError(
        'IDENTITY_AUTH_REVOKE_FAILED',
        `Failed to revoke sessions: ${error.message}`,
        crypto.randomUUID(),
        true
      );
    }
  }
}
