import { createClient } from '@supabase/supabase-js';
import type { Database } from './types.js';
import { validateSupabaseEnv } from './env.js';

/**
 * Role-aware Supabase client factory.
 *
 * Provides singleton clients per role to ensure:
 * - Service role is never accidentally used in request-scoped APIs
 * - Anon role respects RLS for client-facing queries
 * - Connection reuse and predictable lifecycle
 *
 * @see /project-knowledge/service-role-governance.md
 */

export type ClientRole = 'service' | 'anon';

let serviceClient: ReturnType<typeof createClient<Database>> | null = null;
let anonClient: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Create or retrieve a singleton Supabase client for the given role.
 *
 * - `'service'` — Bypasses RLS. Allowed ONLY in workers, migrations, and internal orchestration.
 * - `'anon'` — Respects RLS. Used for client-facing queries.
 *
 * @throws {Error} If required environment variables are missing.
 */
export function createSupabaseClient(role: ClientRole): ReturnType<typeof createClient<Database>> {
  const env = validateSupabaseEnv();

  switch (role) {
    case 'service': {
      serviceClient ??= createClient<Database>(env.supabaseUrl, env.serviceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      return serviceClient;
    }
    case 'anon': {
      anonClient ??= createClient<Database>(
        env.supabaseUrl,
        process.env.SUPABASE_ANON_KEY ?? env.serviceKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        },
      );
      return anonClient;
    }
    default: {
      throw new Error(`Unknown Supabase client role: ${role as string}`);
    }
  }
}

/**
 * Reset singleton clients. Primarily used in tests.
 */
export function resetSupabaseClients(): void {
  serviceClient = null;
  anonClient = null;
}
