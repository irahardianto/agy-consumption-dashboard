/**
 * Pure metrics calculation utilities for dashboard overview and analytics.
 * Follows Testability-First architectural patterns with zero I/O or DOM dependencies.
 */

import { toLocalDateString } from './dateUtils';

export interface TrendResult {
  /**
   * Absolute percentage value (e.g., 25 for +25% or -25%).
   */
  value: number;
  /**
   * True if current >= prev (positive or neutral direction).
   */
  isPositive: boolean;
  /**
   * Explicit direction indicator.
   */
  direction: 'up' | 'down' | 'neutral';
}

export interface ModelBreakdownEntry {
  model: string;
  shortModel: string;
  tokens: number;
  cost: number;
  percentage: number;
}

export interface UsageRow {
  model: string;
  tokens: number;
  cost: number;
  [key: string]: any;
}

export interface PeriodComparisonDates {
  prevStartStr: string;
  prevEndStr: string;
}

/**
 * Calculates percentage trend between current and previous period metrics.
 *
 * Rules:
 * - If prev === 0 and current > 0 => { value: 100, isPositive: true, direction: 'up' }
 * - If prev === 0 and current === 0 => { value: 0, isPositive: true, direction: 'neutral' }
 * - If prev === 0 and current < 0 => { value: 100, isPositive: false, direction: 'down' }
 * - Otherwise => Math.round(((current - prev) / prev) * 100)
 *
 * @param current - Current period metric value.
 * @param prev - Previous period metric value.
 * @returns Structured TrendResult.
 */
export function calculateTrend(current: number, prev: number): TrendResult {
  if (prev === 0) {
    if (current > 0) {
      return { value: 100, isPositive: true, direction: 'up' };
    }
    if (current < 0) {
      return { value: 100, isPositive: false, direction: 'down' };
    }
    return { value: 0, isPositive: true, direction: 'neutral' };
  }

  const diff = current - prev;
  if (diff === 0) {
    return { value: 0, isPositive: true, direction: 'neutral' };
  }

  const pct = Math.round((diff / prev) * 100);
  return {
    value: Math.abs(pct),
    isPositive: pct >= 0,
    direction: pct > 0 ? 'up' : 'down',
  };
}

/**
 * Aggregates token and cost metrics grouped by model, computes percentages,
 * and sorts descending by total tokens.
 *
 * @param data - Array of usage rows with model, tokens, and cost.
 * @param topN - Number of top models to return. Defaults to 5.
 * @returns Sorted array of ModelBreakdownEntry items with topN entries.
 */
export function computeModelBreakdown(
  data: UsageRow[],
  topN: number = 5
): ModelBreakdownEntry[] {
  if (!data || data.length === 0) {
    return [];
  }

  const modelTotals = data.reduce<Record<string, { tokens: number; cost: number }>>(
    (acc, row) => {
      if (!row || !row.model) return acc;
      if (!acc[row.model]) {
        acc[row.model] = { tokens: 0, cost: 0 };
      }
      acc[row.model].tokens += (row.tokens || 0);
      acc[row.model].cost += (row.cost || 0);
      return acc;
    },
    {}
  );

  const sortedEntries = Object.entries(modelTotals)
    .sort(([, a], [, b]) => b.tokens - a.tokens)
    .slice(0, topN);

  const totalTokens = sortedEntries.reduce((sum, [, v]) => sum + v.tokens, 0);

  return sortedEntries.map(([model, vals]) => {
    const shortModel = model.split('/').pop() ?? model;
    const percentage = totalTokens > 0 ? (vals.tokens / totalTokens) * 100 : 0;
    return {
      model,
      shortModel,
      tokens: vals.tokens,
      cost: vals.cost,
      percentage,
    };
  });
}

/**
 * Calculates previous period window with identical duration immediately preceding current window.
 *
 * @param start - Start date string (YYYY-MM-DD).
 * @param end - End date string (YYYY-MM-DD).
 * @param referenceDate - Optional reference Date for clock injection.
 * @returns PeriodComparisonDates with ISO date strings (YYYY-MM-DD).
 */
export function calculatePreviousPeriodDates(
  start?: string | null,
  end?: string | null,
  referenceDate: Date = new Date()
): PeriodComparisonDates {
  const currentStart = start
    ? new Date(`${start}T00:00:00`)
    : new Date(referenceDate.getTime() - 3 * 24 * 60 * 60 * 1000);

  const currentEnd = end
    ? new Date(`${end}T00:00:00`)
    : new Date(referenceDate.getTime());

  const durationMs = currentEnd.getTime() - currentStart.getTime();

  // Formulation:
  // prev_end = current_start - 1 day
  // prev_start = prev_end - current_duration
  const prevEnd = new Date(currentStart.getTime() - 24 * 60 * 60 * 1000);
  const prevStart = new Date(prevEnd.getTime() - durationMs);

  return {
    prevStartStr: toLocalDateString(prevStart),
    prevEndStr: toLocalDateString(prevEnd),
  };
}
