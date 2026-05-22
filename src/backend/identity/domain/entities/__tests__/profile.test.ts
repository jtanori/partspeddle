import { describe, it, expect } from 'vitest';
import { Profile } from '../profile.js';

describe('Profile', () => {
  it('constructs with required fields', () => {
    const profile = new Profile({
      id: '550e8400-e29b-41d4-a716-446655440000',
      userId: '550e8400-e29b-41d4-a716-446655440001',
    });

    expect(profile.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(profile.userId).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(profile.displayName).toBeUndefined();
  });

  it('accepts optional displayName and avatarUrl', () => {
    const profile = new Profile({
      id: '550e8400-e29b-41d4-a716-446655440000',
      userId: '550e8400-e29b-41d4-a716-446655440001',
      displayName: 'Test User',
      avatarUrl: 'https://example.com/avatar.png',
    });

    expect(profile.displayName).toBe('Test User');
    expect(profile.avatarUrl).toBe('https://example.com/avatar.png');
  });

  it('updates displayName', () => {
    const profile = new Profile({
      id: '550e8400-e29b-41d4-a716-446655440000',
      userId: '550e8400-e29b-41d4-a716-446655440001',
    });

    profile.updateDisplayName('New Name');
    expect(profile.displayName).toBe('New Name');
  });

  it('updates avatarUrl', () => {
    const profile = new Profile({
      id: '550e8400-e29b-41d4-a716-446655440000',
      userId: '550e8400-e29b-41d4-a716-446655440001',
    });

    profile.updateAvatarUrl('https://new.example.com/avatar.png');
    expect(profile.avatarUrl).toBe('https://new.example.com/avatar.png');
  });

  it('rejects missing id', () => {
    expect(() => new Profile({ id: '', userId: 'u1' })).toThrow('Profile.id is required');
  });

  it('rejects missing userId', () => {
    expect(() => new Profile({ id: 'id1', userId: '' })).toThrow('Profile.userId is required');
  });
});
