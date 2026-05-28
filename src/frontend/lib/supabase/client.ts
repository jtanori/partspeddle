import { createBrowserClient } from '@supabase/ssr';
import { assertDefined } from '@/shared/utils/assert';

export function createClient() {
  return createBrowserClient(
    assertDefined(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      'NEXT_PUBLIC_SUPABASE_URL is required',
    ),
    assertDefined(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      'NEXT_PUBLIC_SUPABASE_ANON_KEY is required',
    ),
  );
}
