import { describe, it, expect } from 'vitest';
import { resolveDateRange, buildRangeLabel, toLocalDateString } from './dateUtils';

// Helper: compute an expected date string using the same local-date logic the function uses
function localDateString(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const todayStr = localDateString(0);

describe('resolveDateRange', () => {
  // ── No-arg / default / show-all ───────────────────────────────────────────

  it('returns last 3 days when called with no args', () => {
    const result = resolveDateRange();
    expect(result.start).toBe(localDateString(-3));
    expect(result.end).toBe(todayStr);
  });

  it('returns last 3 days for unrecognized preset', () => {
    const result = resolveDateRange('unknown-preset');
    expect(result.start).toBe(localDateString(-3));
    expect(result.end).toBe(todayStr);
  });

  // ── Preset: today ─────────────────────────────────────────────────────────

  it('returns today as both start and end for preset=today', () => {
    const result = resolveDateRange('today');
    expect(result.start).toBe(todayStr);
    expect(result.end).toBe(todayStr);
  });

  // ── Preset: 3days ─────────────────────────────────────────────────────────

  it('returns 3 days ago to today for preset=3days', () => {
    const result = resolveDateRange('3days');
    expect(result.start).toBe(localDateString(-3));
    expect(result.end).toBe(todayStr);
  });

  // ── Preset: week ──────────────────────────────────────────────────────────

  it('returns 7 days ago to today for preset=week', () => {
    const result = resolveDateRange('week');
    expect(result.start).toBe(localDateString(-7));
    expect(result.end).toBe(todayStr);
  });

  // ── Preset: month ─────────────────────────────────────────────────────────

  it('returns 30 days ago to today for preset=month', () => {
    const result = resolveDateRange('month');
    expect(result.start).toBe(localDateString(-30));
    expect(result.end).toBe(todayStr);
  });

  // ── Preset: custom ────────────────────────────────────────────────────────

  it('returns startDate,endDate as-is for preset=custom', () => {
    const result = resolveDateRange('custom', '2024-01-01', '2024-01-31');
    expect(result.start).toBe('2024-01-01');
    expect(result.end).toBe('2024-01-31');
  });

  it('returns undefined,undefined for preset=custom without dates', () => {
    const result = resolveDateRange('custom');
    expect(result.start).toBeUndefined();
    expect(result.end).toBeUndefined();
  });

  // ── Date format validation ─────────────────────────────────────────────────

  it('returns dates in YYYY-MM-DD format', () => {
    const isoPattern = /^\d{4}-\d{2}-\d{2}$/;

    for (const preset of ['today', '3days', 'week', 'month']) {
      const result = resolveDateRange(preset);
      expect(result.start, `${preset} start`).toMatch(isoPattern);
      expect(result.end, `${preset} end`).toMatch(isoPattern);
    }
  });
});

describe('buildRangeLabel', () => {
  // ── Default label (no preset) ─────────────────────────────────────────────

  it('returns "Last 3 Days" when called with no args', () => {
    expect(buildRangeLabel()).toBe('Last 3 Days');
  });

  it('returns "Last 3 Days" for unrecognized preset', () => {
    expect(buildRangeLabel('unknown')).toBe('Last 3 Days');
  });

  // ── Preset labels ─────────────────────────────────────────────────────────

  it('returns "Today" for preset=today', () => {
    expect(buildRangeLabel('today')).toBe('Today');
  });

  it('returns "Last 3 Days" for preset=3days', () => {
    expect(buildRangeLabel('3days')).toBe('Last 3 Days');
  });

  it('returns "This Week" for preset=week', () => {
    expect(buildRangeLabel('week')).toBe('This Week');
  });

  it('returns "This Month" for preset=month', () => {
    expect(buildRangeLabel('month')).toBe('This Month');
  });

  // ── Custom labels ─────────────────────────────────────────────────────────

  it('returns a formatted "Custom: ..." label when both dates are provided', () => {
    const label = buildRangeLabel('custom', '2024-01-01', '2024-01-31');
    expect(label).toMatch(/^Custom:/);
    // Should contain some representation of the dates
    expect(label).toMatch(/Jan/);
  });

  it('returns "Custom Range" for preset=custom without dates', () => {
    expect(buildRangeLabel('custom')).toBe('Custom Range');
  });
});

describe('toLocalDateString', () => {
  it('formats Date in local YYYY-MM-DD format with padding', () => {
    const d = new Date(2026, 0, 5); // Jan 5, 2026
    expect(toLocalDateString(d)).toBe('2026-01-05');
  });

  it('correctly handles double digit months and days', () => {
    const d = new Date(2025, 11, 25); // Dec 25, 2025
    expect(toLocalDateString(d)).toBe('2025-12-25');
  });

  it('correctly formats leap year dates', () => {
    const d = new Date(2024, 1, 29); // Feb 29, 2024
    expect(toLocalDateString(d)).toBe('2024-02-29');
  });

  it('correctly formats year-end transition dates', () => {
    const d = new Date(2025, 11, 31); // Dec 31, 2025
    expect(toLocalDateString(d)).toBe('2025-12-31');
  });
});
