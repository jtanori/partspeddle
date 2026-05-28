import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { assertDefined } from '@/shared/utils/assert';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    assertDefined(
      process.env.SUPABASE_AUTH_URL,
      'SUPABASE_AUTH_URL is required',
    ),
    assertDefined(
      process.env.SUPABASE_ANON_KEY,
      'SUPABASE_ANON_KEY is required',
    ),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );
}
