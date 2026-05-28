import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../logger.js';

describe('logger', () => {
  let logs: string[] = [];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits structured JSON with required fields', () => {
    logger.info('test message');

    expect(logs).toHaveLength(1);
    const entry = JSON.parse(logs[0]);
    expect(entry.timestamp).toBeTruthy();
    expect(entry.level).toBe('info');
    expect(entry.service).toBe('vintrack');
    expect(entry.message).toBe('test message');
  });

  it('includes correlationId and traceparent in meta', () => {
    logger.info('test', {}, { correlationId: 'abc-123', traceparent: 'tp-456' });

    const entry = JSON.parse(logs[0]);
    expect(entry.correlationId).toBe('abc-123');
    expect(entry.traceparent).toBe('tp-456');
  });

  it('redacts sensitive keys', () => {
    logger.info('test', {
      password: 'secret123',
      apiKey: 'sk-live-xxx',
      normalField: 'visible',
    });

    const entry = JSON.parse(logs[0]);
    expect(entry.context.password).toBe('[REDACTED]');
    expect(entry.context.apiKey).toBe('[REDACTED]');
    expect(entry.context.normalField).toBe('visible');
  });

  it('redacts JWT strings', () => {
    logger.info('test', {
      token: 'mock-jwt-token-12345',
    });

    const entry = JSON.parse(logs[0]);
    expect(entry.context.token).toBe('[REDACTED]');
  });

  it('detects circular references', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;

    logger.info('test', obj);

    const entry = JSON.parse(logs[0]);
    expect(entry.context.self).toBe('[CIRCULAR]');
  });

  it('respects max depth', () => {
    const deep = { l1: { l2: { l3: { l4: { l5: { l6: 'deep' } } } } } };

    logger.info('test', deep);

    const entry = JSON.parse(logs[0]);
    expect(entry.context.l1.l2.l3.l4.l5.l6).toBe('[MAX_DEPTH_EXCEEDED]');
  });

  it('handles oversized log entries', () => {
    const huge = { data: 'x'.repeat(100 * 1024) };

    logger.info('test', huge);

    const entry = JSON.parse(logs[0]);
    expect(entry.context).toBe('[OVERSIZED_LOG_ENTRY]');
  });
});
