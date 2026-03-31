import { describe, it, expect, vi } from 'vitest';

describe('Event Bus', () => {
  it('emitEvent triggers registered handler', () => {
    const handler = vi.fn();
    onEvent('test:fire', handler);
    emitEvent('test:fire', { val: 42 });
    expect(handler).toHaveBeenCalledWith({ val: 42 });
    offEvent('test:fire', handler);
  });

  it('offEvent removes handler', () => {
    const handler = vi.fn();
    onEvent('test:off', handler);
    offEvent('test:off', handler);
    emitEvent('test:off', {});
    expect(handler).not.toHaveBeenCalled();
  });

  it('onceEvent fires only once', () => {
    const handler = vi.fn();
    onceEvent('test:once', handler);
    emitEvent('test:once', { a: 1 });
    emitEvent('test:once', { a: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ a: 1 });
  });

  it('handler errors do not break other handlers', () => {
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();
    onEvent('test:err', bad);
    onEvent('test:err', good);
    emitEvent('test:err', {});
    expect(good).toHaveBeenCalled();
    offEvent('test:err', bad);
    offEvent('test:err', good);
  });
});
