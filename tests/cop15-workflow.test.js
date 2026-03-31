import { describe, it, expect } from 'vitest';

describe('getNextStep', () => {
  it('returns null for archived vehicle', () => {
    expect(getNextStep({ status: 'archived' })).toBeNull();
  });

  it('returns null for null input', () => {
    expect(getNextStep(null)).toBeNull();
  });

  it('suggests precondicionamiento for registered vehicle', () => {
    const step = getNextStep({ status: 'registered', testData: {} });
    expect(step.action).toContain('Precondicionamiento');
    expect(step.icon).toBe('🔧');
  });

  it('suggests release for ready-release vehicle', () => {
    const step = getNextStep({ status: 'ready-release', testData: {} });
    expect(step.action).toContain('Liberar');
    expect(step.icon).toBe('🚗');
  });
});

describe('_nextBusinessDay', () => {
  it('skips Saturday to Monday', () => {
    const sat = new Date(2026, 2, 7, 10, 0);
    const result = _nextBusinessDay(sat);
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(9);
  });
  it('Sunday becomes Monday', () => {
    const sun = new Date(2026, 2, 8, 10, 0);
    const result = _nextBusinessDay(sun);
    expect(result.getDay()).toBe(1);
  });
  it('weekday advances to next business day', () => {
    const wed = new Date(2026, 2, 4, 10, 0); // Wednesday
    const result = _nextBusinessDay(wed);
    expect(result.getDay()).toBe(4); // Thursday
  });
});

describe('_toLocalDatetimeStr', () => {
  it('returns correct format', () => {
    const d = new Date(2026, 2, 10, 14, 30);
    const result = _toLocalDatetimeStr(d);
    expect(result).toContain('2026-03-10');
    expect(result).toContain('14:30');
  });
});

describe('parseCSV', () => {
  it('populates allConfigurations', () => {
    parseCSV();
    expect(allConfigurations.length).toBeGreaterThan(0);
    expect(allConfigurations[0].codigo_config_text).toBeDefined();
  });
});
