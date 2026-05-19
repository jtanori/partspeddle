import { describe, it, expect } from 'vitest';
import {
  parseTraceparent,
  generateTraceparent,
  createChildTraceparent,
  getTraceContext,
  setTraceContext,
  runWithTraceContext,
} from '../tracing.js';

describe('parseTraceparent', () => {
  it('parses valid traceparent', () => {
    const ctx = parseTraceparent('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');

    expect(ctx).toBeDefined();
    expect(ctx?.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(ctx?.parentId).toBe('b7ad6b7169203331');
    expect(ctx?.flags).toBe('01');
  });

  it('returns null for invalid traceparent', () => {
    expect(parseTraceparent('invalid')).toBeNull();
    expect(parseTraceparent('')).toBeNull();
  });
});

describe('generateTraceparent', () => {
  it('generates valid traceparent', () => {
    const ctx = generateTraceparent();

    expect(ctx.traceparent).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
    expect(ctx.traceId).toHaveLength(32);
    expect(ctx.parentId).toHaveLength(16);
  });
});

describe('createChildTraceparent', () => {
  it('preserves traceId, generates new parentId', () => {
    const parent = generateTraceparent();
    const child = createChildTraceparent(parent);

    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentId).not.toBe(parent.parentId);
    expect(child.traceparent).not.toBe(parent.traceparent);
  });
});

describe('AsyncLocalStorage trace context', () => {
  it('stores and retrieves trace context', () => {
    const ctx = generateTraceparent();
    setTraceContext(ctx);

    expect(getTraceContext()?.traceId).toBe(ctx.traceId);
  });

  it('runWithTraceContext scopes context correctly', () => {
    const ctx1 = generateTraceparent();
    const ctx2 = generateTraceparent();

    setTraceContext(ctx1);

    runWithTraceContext(ctx2, () => {
      expect(getTraceContext()?.traceId).toBe(ctx2.traceId);
    });

    expect(getTraceContext()?.traceId).toBe(ctx1.traceId);
  });
});
