import { describe, it, expect } from 'vitest';
import {
  calculateTrend,
  computeModelBreakdown,
  calculatePreviousPeriodDates,
} from './metricsUtils';

describe('calculateTrend', () => {
  it('calculates positive trend correctly', () => {
    const result = calculateTrend(150, 100);
    expect(result).toEqual({
      value: 50,
      isPositive: true,
      direction: 'up',
    });
  });

  it('calculates negative trend correctly', () => {
    const result = calculateTrend(80, 100);
    expect(result).toEqual({
      value: 20,
      isPositive: false,
      direction: 'down',
    });
  });

  it('handles zero change between periods', () => {
    const result = calculateTrend(100, 100);
    expect(result).toEqual({
      value: 0,
      isPositive: true,
      direction: 'neutral',
    });
  });

  it('handles division by zero when prev is 0 and current > 0', () => {
    const result = calculateTrend(50, 0);
    expect(result).toEqual({
      value: 100,
      isPositive: true,
      direction: 'up',
    });
  });

  it('handles division by zero when prev is 0 and current is 0', () => {
    const result = calculateTrend(0, 0);
    expect(result).toEqual({
      value: 0,
      isPositive: true,
      direction: 'neutral',
    });
  });

  it('handles division by zero when prev is 0 and current < 0', () => {
    const result = calculateTrend(-25, 0);
    expect(result).toEqual({
      value: 100,
      isPositive: false,
      direction: 'down',
    });
  });

  it('rounds percentage to nearest integer', () => {
    const result = calculateTrend(10, 3);
    // (10 - 3) / 3 * 100 = 233.333... -> 233
    expect(result).toEqual({
      value: 233,
      isPositive: true,
      direction: 'up',
    });
  });
});

describe('computeModelBreakdown', () => {
  it('returns empty array when data is empty or invalid', () => {
    expect(computeModelBreakdown([])).toEqual([]);
    expect(computeModelBreakdown(null as any)).toEqual([]);
    expect(computeModelBreakdown(undefined as any)).toEqual([]);
  });

  it('aggregates multiple rows for the same model and computes percentages', () => {
    const data = [
      { model: 'publishers/google/models/gemini-1.5-pro', tokens: 600_000, cost: 3.0 },
      { model: 'publishers/google/models/gemini-1.5-flash', tokens: 300_000, cost: 0.3 },
      { model: 'publishers/google/models/gemini-1.5-pro', tokens: 100_000, cost: 0.5 },
    ];

    const result = computeModelBreakdown(data);
    expect(result).toHaveLength(2);

    // Total tokens = 700k + 300k = 1M
    expect(result[0]).toEqual({
      model: 'publishers/google/models/gemini-1.5-pro',
      shortModel: 'gemini-1.5-pro',
      tokens: 700_000,
      cost: 3.5,
      percentage: 70,
    });

    expect(result[1]).toEqual({
      model: 'publishers/google/models/gemini-1.5-flash',
      shortModel: 'gemini-1.5-flash',
      tokens: 300_000,
      cost: 0.3,
      percentage: 30,
    });
  });

  it('sorts models descending by token count and respects topN limit', () => {
    const data = [
      { model: 'model-a', tokens: 100, cost: 1 },
      { model: 'model-b', tokens: 500, cost: 5 },
      { model: 'model-c', tokens: 300, cost: 3 },
      { model: 'model-d', tokens: 800, cost: 8 },
      { model: 'model-e', tokens: 200, cost: 2 },
      { model: 'model-f', tokens: 400, cost: 4 },
    ];

    const result = computeModelBreakdown(data, 3);
    expect(result).toHaveLength(3);
    expect(result.map(r => r.model)).toEqual(['model-d', 'model-b', 'model-f']);
  });

  it('handles models with 0 tokens safely without NaN percentage', () => {
    const data = [
      { model: 'model-zero', tokens: 0, cost: 0 },
    ];
    const result = computeModelBreakdown(data);
    expect(result).toHaveLength(1);
    expect(result[0].percentage).toBe(0);
  });
});

describe('calculatePreviousPeriodDates', () => {
  it('calculates prior period with identical duration when start and end are provided', () => {
    // 5-day window: 2026-05-10 to 2026-05-15 (duration 5 days)
    // prevEnd = 2026-05-09
    // prevStart = 2026-05-04
    const result = calculatePreviousPeriodDates('2026-05-10', '2026-05-15');
    expect(result.prevEndStr).toBe('2026-05-09');
    expect(result.prevStartStr).toBe('2026-05-04');
  });

  it('calculates single-day period comparison', () => {
    const result = calculatePreviousPeriodDates('2026-08-16', '2026-08-16');
    expect(result.prevEndStr).toBe('2026-08-15');
    expect(result.prevStartStr).toBe('2026-08-15');
  });

  it('uses referenceDate when start and end are omitted', () => {
    const refDate = new Date(2026, 5, 20); // June 20, 2026
    const result = calculatePreviousPeriodDates(undefined, undefined, refDate);
    // Default duration is 3 days: currentStart = June 17, currentEnd = June 20
    // prevEnd = June 16
    // prevStart = June 13
    expect(result.prevEndStr).toBe('2026-06-16');
    expect(result.prevStartStr).toBe('2026-06-13');
  });

  it('handles month boundary transitions correctly', () => {
    const result = calculatePreviousPeriodDates('2026-03-02', '2026-03-05');
    // duration 3 days (March 2 to March 5)
    // prevEnd = 2026-03-01
    // prevStart = 2026-02-26
    expect(result.prevEndStr).toBe('2026-03-01');
    expect(result.prevStartStr).toBe('2026-02-26');
  });
});
