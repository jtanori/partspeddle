import { describe, it, expect } from 'vitest';
import { deriveQueueNames } from '../naming.js';

describe('deriveQueueNames', () => {
  it('derives queue and dlq names', () => {
    const names = deriveQueueNames('identity', 'onboarding');

    expect(names.queue).toBe('identity-onboarding');
    expect(names.dlq).toBe('identity-onboarding-dlq');
  });

  it('derives names with multi-word purpose', () => {
    const names = deriveQueueNames('transaction', 'orchestration');

    expect(names.queue).toBe('transaction-orchestration');
    expect(names.dlq).toBe('transaction-orchestration-dlq');
  });

  it('throws on uppercase domain', () => {
    expect(() => deriveQueueNames('Identity', 'onboarding')).toThrow(
      'Invalid queue name',
    );
  });

  it('throws on underscore in purpose', () => {
    expect(() => deriveQueueNames('identity', 'onboarding_steps')).toThrow(
      'Invalid queue name',
    );
  });

  it('throws on empty purpose', () => {
    expect(() => deriveQueueNames('identity', '')).toThrow(
      'Invalid queue name',
    );
  });
});
