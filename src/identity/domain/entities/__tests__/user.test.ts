import { describe, it, expect } from 'vitest';
import { User } from '../user.js';
import { DomainError } from '../../../../shared/errors/domain-error.js';

describe('User', () => {
  describe('creation', () => {
    it('creates with active status and emits created event', () => {
      const user = User.create(
        { id: '550e8400-e29b-41d4-a716-446655440000', email: 'test@example.com' },
        'corr-1',
      );

      expect(user.status).toBe('active');
      expect(user.email).toBe('test@example.com');
      expect(user.uncommittedEvents).toHaveLength(1);
      expect(user.uncommittedEvents[0].eventType).toBe('identity.user_created');
      expect(user.uncommittedEvents[0].payload).toMatchObject({
        userId: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
      });
    });

    it('rejects invalid email', () => {
      expect(() =>
        User.create({ id: crypto.randomUUID(), email: 'not-an-email' }, 'corr-1'),
      ).toThrow(DomainError);
    });

    it('rejects empty email', () => {
      expect(() => User.create({ id: crypto.randomUUID(), email: '' }, 'corr-1')).toThrow(
        DomainError,
      );
    });
  });

  describe('rehydration', () => {
    it('rehydrates without emitting events', () => {
      const user = User.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        status: 'suspended',
      });

      expect(user.status).toBe('suspended');
      expect(user.uncommittedEvents).toHaveLength(0);
    });
  });

  describe('status transitions', () => {
    it('active → suspended emits suspended event', () => {
      const user = User.create(
        { id: '550e8400-e29b-41d4-a716-446655440000', email: 'test@example.com' },
        'corr-1',
      );
      user.clearEvents();

      user.suspend('Fraud detected', 'corr-2');

      expect(user.status).toBe('suspended');
      expect(user.uncommittedEvents).toHaveLength(1);
      expect(user.uncommittedEvents[0].eventType).toBe('identity.user_suspended');
      expect(user.uncommittedEvents[0].payload).toMatchObject({
        reason: 'Fraud detected',
        previousStatus: 'active',
      });
    });

    it('suspended → active emits reactivated event', () => {
      const user = User.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        status: 'suspended',
      });

      user.reactivate('corr-3');

      expect(user.status).toBe('active');
      expect(user.uncommittedEvents).toHaveLength(1);
      expect(user.uncommittedEvents[0].eventType).toBe('identity.user_reactivated');
    });

    it('rejects active → active (no self-transition)', () => {
      const user = User.create(
        { id: '550e8400-e29b-41d4-a716-446655440000', email: 'test@example.com' },
        'corr-1',
      );
      user.clearEvents();

      expect(() => user.reactivate('corr-2')).toThrow(DomainError);
    });

    it('rejects suspended → deactivated (no skip)', () => {
      const user = User.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        status: 'suspended',
      });

      // deactivated is not in VALID_TRANSITIONS['suspended']
      expect(() => user.suspend('reason', 'corr')).toThrow(DomainError);
    });

    it('rejects deactivated → any (terminal state)', () => {
      const user = User.rehydrate({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        status: 'deactivated',
      });

      expect(() => user.suspend('reason', 'corr')).toThrow(DomainError);
      expect(() => user.reactivate('corr')).toThrow(DomainError);
    });
  });

  describe('clearEvents', () => {
    it('clears uncommitted events', () => {
      const user = User.create(
        { id: '550e8400-e29b-41d4-a716-446655440000', email: 'test@example.com' },
        'corr-1',
      );
      expect(user.uncommittedEvents).toHaveLength(1);

      user.clearEvents();

      expect(user.uncommittedEvents).toHaveLength(0);
    });
  });
});
