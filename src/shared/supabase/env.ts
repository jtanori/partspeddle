/**
 * Supabase Environment Validation
 *
 * All Supabase-related configuration is validated at startup.
 * Missing required variables cause immediate failure with a clear message.
 *
 * @see /project-knowledge/service-role-governance.md
 */

import { assertDefined } from '../utils/assert.js';

export interface SupabaseEnv {
  readonly supabaseUrl: string;
  readonly serviceKey: string;
  readonly databaseUrl: string;
}

const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'DATABASE_URL',
] as const;

/**
 * Validate that all required Supabase environment variables are present.
 *
 * @throws {Error} If any required variable is missing or empty.
 */
export function validateSupabaseEnv(): SupabaseEnv {
  const missing: string[] = [];

  for (const name of REQUIRED_VARS) {
    const value = process.env[name];
    if (!value || value.trim().length === 0) {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        `Application cannot start without Supabase configuration.`,
    );
  }

  return {
    supabaseUrl: assertDefined(
      process.env.SUPABASE_URL,
      'SUPABASE_URL is required',
    ),
    serviceKey: assertDefined(
      process.env.SUPABASE_SERVICE_KEY,
      'SUPABASE_SERVICE_KEY is required',
    ),
    databaseUrl: assertDefined(
      process.env.DATABASE_URL,
      'DATABASE_URL is required',
    ),
  };
}
