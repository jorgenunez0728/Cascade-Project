import { describe, it, expect } from 'vitest';

// All functions are on globalThis via setup.js

describe('escapeHtml', () => {
  it('escapes & < > " \'', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
  it('handles null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
  it('handles numbers', () => {
    expect(escapeHtml(42)).toBe('42');
  });
  it('safe string unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });
  it('XSS vector neutralized', () => {
    const result = escapeHtml('<img onerror=alert(1)>');
    expect(result).not.toContain('<img');
  });
});

describe('safeParse', () => {
  it('returns fallback for null key', () => {
    const result = safeParse('__vitest_nonexistent__', { x: 1 });
    expect(result.x).toBe(1);
  });
  it('returns fallback for corrupted data', () => {
    localStorage.setItem('__vitest_corrupt__', '{invalid json!!!');
    const result = safeParse('__vitest_corrupt__', { ok: true });
    expect(result.ok).toBe(true);
    localStorage.removeItem('__vitest_corrupt__');
  });
  it('parses valid JSON', () => {
    localStorage.setItem('__vitest_valid__', '{"a":1,"b":"two"}');
    const result = safeParse('__vitest_valid__', {});
    expect(result.a).toBe(1);
    expect(result.b).toBe('two');
    localStorage.removeItem('__vitest_valid__');
  });
  it('returns array fallback for corrupt array', () => {
    localStorage.setItem('__vitest_arr__', '[not valid');
    const result = safeParse('__vitest_arr__', []);
    expect(Array.isArray(result)).toBe(true);
    localStorage.removeItem('__vitest_arr__');
  });
});

describe('debounce', () => {
  it('returns a function', () => {
    const fn = debounce(() => {}, 100);
    expect(typeof fn).toBe('function');
  });
});

describe('_formatBytes', () => {
  it('formats bytes correctly', () => {
    expect(_formatBytes(0)).toBe('0 B');
    expect(_formatBytes(1024)).toBe('1.0 KB');
    expect(_formatBytes(1048576)).toBe('1.00 MB');
  });
});

describe('CONFIG', () => {
  it('exists with statusLabels', () => {
    expect(typeof CONFIG).toBe('object');
    expect(CONFIG.statusLabels).toBeDefined();
    expect(CONFIG.statusLabels.registered).toBeDefined();
  });
});
