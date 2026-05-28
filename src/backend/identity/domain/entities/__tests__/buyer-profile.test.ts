import { describe, it, expect } from 'vitest';
import { BuyerProfile } from '../buyer-profile.js';

describe('BuyerProfile', () => {
  it('constructs with required fields', () => {
    const bp = new BuyerProfile({
      id: '550e8400-e29b-41d4-a716-446655440000',
      userId: '550e8400-e29b-41d4-a716-446655440001',
    });

    expect(bp.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(bp.userId).toBe('550e8400-e29b-41d4-a716-446655440001');
  });

  it('rejects missing id', () => {
    expect(() => new BuyerProfile({ id: '', userId: 'u1' })).toThrow('BuyerProfile.id is required');
  });

  it('rejects missing userId', () => {
    expect(() => new BuyerProfile({ id: 'id1', userId: '' })).toThrow(
      'BuyerProfile.userId is required'
    );
  });
});
