/**
 * Date utility helpers for the dashboard date filter.
 * All date operations use local time to match human expectations.
 */

/** Format a Date as YYYY-MM-DD using local (not UTC) time. */
export function toLocalDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Get today's date as YYYY-MM-DD. */
function today(): string {
  return toLocalDateString(new Date());
}

/** Get the date N days ago as YYYY-MM-DD. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalDateString(d);
}

export type DateRange = {
  start: string | undefined;
  end: string | undefined;
};

/**
 * Resolve a date range from URL search params.
 *
 * @param preset  - One of: 'today' | '3days' | 'week' | 'month' | 'custom'
 * @param startDate - YYYY-MM-DD string (only used when preset === 'custom')
 * @param endDate   - YYYY-MM-DD string (only used when preset === 'custom')
 * @returns { start, end } — both undefined means "use BigQuery default (last 30 days)"
 */
export function resolveDateRange(
  preset?: string,
  startDate?: string,
  endDate?: string
): DateRange {
  switch (preset) {
    case 'today':
      return { start: today(), end: today() };

    case '3days':
      return { start: daysAgo(3), end: today() };

    case 'week':
      return { start: daysAgo(7), end: today() };

    case 'month':
      return { start: daysAgo(30), end: today() };

    case 'custom':
      // Only return custom range when both values are present
      if (startDate && endDate) {
        return { start: startDate, end: endDate };
      }
      // Fall through to default if incomplete
      return { start: undefined, end: undefined };

    default:
      // No preset — default to last 3 days for a useful initial view
      return { start: daysAgo(3), end: today() };
  }
}

/**
 * Build a human-readable label for the current date range selection.
 * Used by the DateFilter trigger button.
 */
export function buildRangeLabel(
  preset?: string,
  startDate?: string,
  endDate?: string
): string {
  switch (preset) {
    case 'today':
      return 'Today';
    case '3days':
      return 'Last 3 Days';
    case 'week':
      return 'This Week';
    case 'month':
      return 'This Month';
    case 'custom': {
      if (startDate && endDate) {
        const fmt = (s: string) => {
          const d = new Date(`${s}T00:00:00`);
          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        };
        return `Custom: ${fmt(startDate)} – ${fmt(endDate)}`;
      }
      return 'Custom Range';
    }
    default:
      return 'Last 3 Days';
  }
}
