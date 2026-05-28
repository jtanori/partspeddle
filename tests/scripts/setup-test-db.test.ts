import { describe, it, expect } from 'vitest';

describe('setup-test-db migration validation', () => {
  it('accepts valid migration filenames', async () => {
    const validateFilename = (f: string) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f);

    expect(validateFilename('20260519000001_create_outbox.sql')).toBe(true);
    expect(validateFilename('20260519000002_identity_schema.sql')).toBe(true);
  });

  it('rejects invalid migration filenames', async () => {
    const validateFilename = (f: string) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f);

    expect(validateFilename('create_outbox.sql')).toBe(false); // missing timestamp
    expect(validateFilename('20260519_create_outbox.sql')).toBe(false); // short timestamp
    expect(validateFilename('20260519000001-create-outbox.sql')).toBe(false); // hyphens
    expect(validateFilename('20260519000001 Create Outbox.sql')).toBe(false); // spaces + uppercase
  });
});
