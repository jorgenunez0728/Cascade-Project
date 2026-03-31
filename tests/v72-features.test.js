import { describe, it, expect, vi } from 'vitest';

describe('V7.2-B: Productivity Heatmap', () => {
  it('returns empty string when no archived vehicles', () => {
    const origVehicles = db.vehicles;
    db.vehicles = [];
    const result = v72RenderProductivityHeatmap();
    expect(result).toBe('');
    db.vehicles = origVehicles;
  });

  it('returns empty string when fewer than 3 archived vehicles', () => {
    const origVehicles = db.vehicles;
    db.vehicles = [
      { status: 'archived', archivedAt: new Date().toISOString() },
      { status: 'archived', archivedAt: new Date().toISOString() },
    ];
    const result = v72RenderProductivityHeatmap();
    expect(result).toBe('');
    db.vehicles = origVehicles;
  });
});

describe('V7.2-C: Gas Depletion Forecast', () => {
  it('returns empty string when invState not available', () => {
    const origInvState = globalThis.invState;
    globalThis.invState = undefined;
    const result = v72RenderGasDepletion();
    expect(result).toBe('');
    globalThis.invState = origInvState;
  });

  it('returns empty string when no in-use gases', () => {
    const origInvState = globalThis.invState;
    globalThis.invState = { gases: [{ status: 'Empty', readings: [] }] };
    const result = v72RenderGasDepletion();
    expect(result).toBe('');
    globalThis.invState = origInvState;
  });
});

describe('V7.2-D: Grouped Notifications', () => {
  it('returns empty array when no notifications', () => {
    const orig = globalThis._notificationLog;
    globalThis._notificationLog = [];
    const result = v72GroupedNotifications();
    expect(result).toEqual([]);
    globalThis._notificationLog = orig;
  });

  it('groups duplicate notifications within 5 min', () => {
    const orig = globalThis._notificationLog;
    const now = Date.now();
    globalThis._notificationLog = [
      { message: 'Gas bajo en cilindro X', type: 'warning', timestamp: now, read: false },
      { message: 'Gas bajo en cilindro X', type: 'warning', timestamp: now - 60000, read: false },
      { message: 'Gas bajo en cilindro X', type: 'warning', timestamp: now - 120000, read: false },
    ];
    const result = v72GroupedNotifications();
    expect(result.length).toBe(1);
    expect(result[0].count).toBe(3);
    globalThis._notificationLog = orig;
  });

  it('sorts errors before warnings', () => {
    const orig = globalThis._notificationLog;
    const now = Date.now();
    globalThis._notificationLog = [
      { message: 'Info message', type: 'info', timestamp: now, read: false },
      { message: 'Error message', type: 'error', timestamp: now - 1000, read: false },
      { message: 'Warning message', type: 'warning', timestamp: now - 2000, read: false },
    ];
    const result = v72GroupedNotifications();
    expect(result[0].type).toBe('error');
    expect(result[1].type).toBe('warning');
    expect(result[2].type).toBe('info');
    globalThis._notificationLog = orig;
  });
});

describe('V7.2-E: Turnaround Trend', () => {
  it('returns empty string with fewer than 5 archived', () => {
    const result = v72RenderTurnaroundTrend([{ registeredAt: '2026-01-01', archivedAt: '2026-01-02' }]);
    expect(result).toBe('');
  });

  it('returns empty string with null input', () => {
    const result = v72RenderTurnaroundTrend(null);
    expect(result).toBe('');
  });
});

describe('V7.2-A: Vehicle Switcher', () => {
  it('v72UpdateFabBadge does not throw without FAB element', () => {
    expect(() => v72UpdateFabBadge()).not.toThrow();
  });
});

describe('V7.2-F: Shift Summary', () => {
  it('v72ShiftSummary does not throw', () => {
    // Reset the date guard so it can run
    localStorage.removeItem('kia_shift_summary_date');
    expect(() => v72ShiftSummary()).not.toThrow();
  });

  it('sets summary date in localStorage', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(localStorage.getItem('kia_shift_summary_date')).toBe(today);
  });

  it('does not run twice on same day', () => {
    // Second call should be a no-op (already set for today)
    const toastsBefore = document.querySelectorAll('.toast').length;
    v72ShiftSummary();
    const toastsAfter = document.querySelectorAll('.toast').length;
    expect(toastsAfter).toBe(toastsBefore);
  });
});
