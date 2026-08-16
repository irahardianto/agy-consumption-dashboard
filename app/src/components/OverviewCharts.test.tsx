import { describe, it, expect } from 'vitest';
import { OverviewCharts } from './OverviewCharts';
import type { UsageDataPoint, UserUsage } from '@/lib/bigquery';

describe('OverviewCharts component', () => {
  it('renders usage chart, top users chart, and heatmap card', () => {
    const usageData: UsageDataPoint[] = [
      { day: '2026-08-14', model: 'gemini-1.5-pro', requests: 10, tokens: 100000, cost: 0.5 },
      { day: '2026-08-15', model: 'gemini-1.5-flash', requests: 20, tokens: 200000, cost: 0.2 },
    ];
    const topUsers: UserUsage[] = [
      {
        os_username: 'alice',
        displayName: 'Alice',
        email: 'alice@example.com',
        team: 'AI',
        requests: 15,
        input_tokens: 100000,
        output_tokens: 50000,
        tokens: 150000,
        cost: 0.4,
      },
      {
        os_username: 'bob',
        displayName: 'Bob',
        email: 'bob@example.com',
        team: 'Eng',
        requests: 20,
        input_tokens: 100000,
        output_tokens: 50000,
        tokens: 150000,
        cost: 0.3,
      },
    ];

    const result = OverviewCharts({
      usageData,
      topUsers,
      startDate: '2026-08-14',
      endDate: '2026-08-15',
    });

    expect(result).toBeDefined();
    const jsonStr = JSON.stringify(result);
    expect(jsonStr).toContain('Token Consumption Over Time');
    expect(jsonStr).toContain('Top Users by Token Usage');
    expect(jsonStr).toContain('Usage Heatmap');
  });
});
