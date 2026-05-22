import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSupabaseClient, resetSupabaseClients } from '../client.js';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockImplementation((_url: string, key: string) => ({
    key,
    from: vi.fn(),
    auth: { signOut: vi.fn() },
  })),
}));

vi.mock('../env.js', () => ({
  validateSupabaseEnv: vi.fn().mockReturnValue({
    supabaseUrl: 'http://localhost:54321',
    serviceKey: 'test-service-key',
    databaseUrl: 'postgresql://localhost/test',
  }),
}));

describe('createSupabaseClient', () => {
  beforeEach(() => {
    resetSupabaseClients();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates service role client', () => {
    const client = createSupabaseClient('service');

    expect(client).toBeDefined();
    expect(client.key).toBe('test-service-key');
  });

  it('creates anon client', () => {
    vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key');

    const client = createSupabaseClient('anon');

    expect(client).toBeDefined();
    expect(client.key).toBe('test-anon-key');
  });

  it('falls back to service key when anon key is missing', () => {
    const client = createSupabaseClient('anon');

    expect(client.key).toBe('test-service-key');
  });

  it('returns singleton for repeated service role calls', () => {
    const first = createSupabaseClient('service');
    const second = createSupabaseClient('service');

    expect(first).toBe(second);
  });

  it('returns singleton for repeated anon calls', () => {
    vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key');

    const first = createSupabaseClient('anon');
    const second = createSupabaseClient('anon');

    expect(first).toBe(second);
  });

  it('throws on unknown role', () => {
    expect(() => createSupabaseClient('admin' as unknown as 'service')).toThrow(
      'Unknown Supabase client role',
    );
  });
});
