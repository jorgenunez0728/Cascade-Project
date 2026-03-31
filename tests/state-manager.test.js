import { describe, it, expect, vi } from 'vitest';

describe('State Manager', () => {
  it('registers and retrieves module state', () => {
    stateManager.register('__test_mod__', {
      state: { count: 0 },
      storageKey: null,
      saveFn: null,
    });
    const state = stateManager.get('__test_mod__');
    expect(state).toEqual({ count: 0 });
  });

  it('returns undefined for unknown module', () => {
    expect(stateManager.get('__nonexistent__')).toBeUndefined();
  });

  it('set updates state and calls saveFn', () => {
    const saveFn = vi.fn();
    stateManager.register('__test_save__', {
      state: { x: 1 },
      storageKey: null,
      saveFn,
    });
    stateManager.set('__test_save__', { x: 2 });
    expect(stateManager.get('__test_save__')).toEqual({ x: 2 });
    expect(saveFn).toHaveBeenCalled();
  });

  it('onChange listener fires on set', () => {
    const listener = vi.fn();
    stateManager.register('__test_listen__', {
      state: { v: 'a' },
      storageKey: null,
      saveFn: null,
    });
    const unsub = stateManager.onChange('__test_listen__', listener);
    stateManager.set('__test_listen__', { v: 'b' });
    expect(listener).toHaveBeenCalledWith({ v: 'b' }, '__test_listen__');
    unsub();
    stateManager.set('__test_listen__', { v: 'c' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notify fires listeners without replacing state', () => {
    const listener = vi.fn();
    stateManager.register('__test_notify__', {
      state: { n: 1 },
      storageKey: null,
      saveFn: null,
    });
    stateManager.onChange('__test_notify__', listener);
    stateManager.notify('__test_notify__');
    expect(listener).toHaveBeenCalledWith({ n: 1 }, '__test_notify__');
  });

  it('snapshot returns module info', () => {
    stateManager.register('__test_snap__', {
      state: { a: 1, b: 2 },
      storageKey: 'test_key',
      saveFn: null,
    });
    const snap = stateManager.snapshot();
    expect(snap['__test_snap__']).toBeDefined();
    expect(snap['__test_snap__'].stateKeys).toContain('a');
    expect(snap['__test_snap__'].storageKey).toBe('test_key');
  });

  it('modules returns list of registered modules', () => {
    const mods = stateManager.modules();
    expect(Array.isArray(mods)).toBe(true);
    expect(mods).toContain('cop15');
  });

  it('cop15 is pre-registered', () => {
    const state = stateManager.get('cop15');
    expect(state).toBeDefined();
    expect(state.vehicles).toBeDefined();
  });
});
