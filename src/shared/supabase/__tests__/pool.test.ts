import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPool, closePool, executeInTransaction, withTimeout } from '../pool.js';

const mockBegin = vi.fn();
const mockEnd = vi.fn();
const mockSql = vi.fn().mockReturnValue([]);

vi.mock('postgres', () => ({
  default: vi.fn().mockImplementation(() => {
    const sql = Object.assign(vi.fn().mockReturnValue([]), {
      begin: mockBegin,
      end: mockEnd,
    });
    return sql;
  }),
}));

vi.mock('../env.js', () => ({
  validateSupabaseEnv: vi.fn().mockReturnValue({
    supabaseUrl: 'http://localhost:54321',
    serviceKey: 'test-service-key',
    databaseUrl: 'postgresql://localhost/test',
  }),
}));

describe('createPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await closePool();
  });

  it('returns a singleton pool', () => {
    const first = createPool();
    const second = createPool();

    expect(first).toBe(second);
  });

  it('passes default config to postgres', async () => {
    createPool();

    const { default: postgres } = await import('postgres');
    const call = vi.mocked(postgres).mock.calls[0];
    expect(call[0]).toBe('postgresql://localhost/test');
    expect(call[1]).toMatchObject({
      max: 20,
      connect_timeout: 5,
      idle_timeout: 20,
      connection: {
        statement_timeout: 5000,
      },
    });
  });

  it('allows config overrides', async () => {
    createPool({ max: 10, queryTimeoutMs: 10000 });

    const { default: postgres } = await import('postgres');
    const call = vi.mocked(postgres).mock.calls[0];
    expect(call[1]).toMatchObject({
      max: 10,
      connection: {
        statement_timeout: 10000,
      },
    });
  });
});

describe('closePool', () => {
  it('closes the pool and resets singleton', async () => {
    const pool = createPool();
    await closePool();

    expect(mockEnd).toHaveBeenCalledWith({ timeout: 5 });

    const next = createPool();
    expect(next).not.toBe(pool);
  });
});

describe('executeInTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBegin.mockReset();
  });

  it('executes callback within transaction', async () => {
    const callback = vi.fn().mockResolvedValue('result');
    mockBegin.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({ sql: mockSql });
    });

    const result = await executeInTransaction(callback);

    expect(mockBegin).toHaveBeenCalled();
    expect(callback).toHaveBeenCalled();
    expect(result).toBe('result');
  });

  it('re-throws callback errors', async () => {
    const error = new Error('tx failed');
    mockBegin.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({ sql: mockSql });
    });

    await expect(
      executeInTransaction(async () => {
        throw error;
      }),
    ).rejects.toThrow('tx failed');
  });
});

describe('withTimeout', () => {
  it('returns query result when resolved before timeout', async () => {
    const result = await withTimeout(Promise.resolve('success'), 1000);

    expect(result).toBe('success');
  });

  it('throws DomainError when query exceeds timeout', async () => {
    const slowQuery = new Promise<string>((resolve) => {
      setTimeout(() => resolve('too late'), 100);
    });

    await expect(withTimeout(slowQuery, 10)).rejects.toMatchObject({
      code: 'SHARED_DB_QUERY_TIMEOUT',
    });
  });
});
