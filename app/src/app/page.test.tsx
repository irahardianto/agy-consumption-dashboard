import { describe, it, expect, vi, beforeEach } from 'vitest';
import OverviewPage from './page';
import * as bigquery from '@/lib/bigquery';
import * as settingsModule from '@/lib/settings';

// Mock dependencies
vi.mock('@/lib/bigquery', () => ({
  getOverviewMetrics: vi.fn(),
  getUsageOverTime: vi.fn(),
  getTopUsers: vi.fn(),
}));

vi.mock('@/lib/settings', () => ({
  getSettings: vi.fn(),
}));

describe('OverviewPage Server Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(settingsModule.getSettings).mockResolvedValue({
      defaultDateRange: '3days',
      currencyDisplay: 'USD',
    });

    vi.mocked(bigquery.getOverviewMetrics).mockImplementation(async (start) => {
      const startStr = typeof start === 'string' ? start : '';
      if (startStr.startsWith('2026')) {
        // Current metrics
        return {
          totalRequests: 1000,
          activeUsers: 25,
          totalTokens: 2_000_000,
          totalCost: 10.5,
        };
      }
      // Previous period metrics
      return {
        totalRequests: 800,
        activeUsers: 20,
        totalTokens: 1_600_000,
        totalCost: 8.0,
      };
    });

    vi.mocked(bigquery.getUsageOverTime).mockResolvedValue([
      { day: '2026-08-13', model: 'gemini-1.5-pro', requests: 500, tokens: 1_000_000, cost: 5.0 },
      { day: '2026-08-14', model: 'gemini-1.5-flash', requests: 500, tokens: 1_000_000, cost: 1.0 },
    ]);

    vi.mocked(bigquery.getTopUsers).mockResolvedValue([
      {
        os_username: 'alice',
        displayName: 'Alice',
        email: 'alice@example.com',
        team: 'Core',
        requests: 500,
        input_tokens: 600_000,
        output_tokens: 600_000,
        tokens: 1_200_000,
        cost: 6.0,
      },
      {
        os_username: 'bob',
        displayName: 'Bob',
        email: 'bob@example.com',
        team: 'Core',
        requests: 500,
        input_tokens: 400_000,
        output_tokens: 400_000,
        tokens: 800_000,
        cost: 4.0,
      },
    ]);
  });

  it('renders overview page with metrics, trends, and charts for default parameters', async () => {
    const searchParams = Promise.resolve({});
    const pageElement = await OverviewPage({ searchParams });

    expect(pageElement).toBeDefined();
    expect(pageElement.type).toBe('div');

    const jsonStr = JSON.stringify(pageElement);
    expect(jsonStr).toContain('Overview');
    expect(jsonStr).toContain('Tracking AI consumption across your organization.');
    expect(jsonStr).toContain('"totalRequests":1000');
    expect(jsonStr).toContain('"activeUsers":25');
    expect(jsonStr).toContain('"totalTokens":2000000');
    expect(jsonStr).toContain('"gemini-1.5-pro"');
    expect(jsonStr).toContain('"gemini-1.5-flash"');
  });

  it('handles custom date range search parameters correctly', async () => {
    const searchParams = Promise.resolve({
      preset: 'custom',
      startDate: '2026-08-01',
      endDate: '2026-08-10',
    });

    const pageElement = await OverviewPage({ searchParams });
    expect(pageElement).toBeDefined();

    expect(bigquery.getOverviewMetrics).toHaveBeenCalledWith('2026-08-01', '2026-08-10');
    expect(bigquery.getUsageOverTime).toHaveBeenCalledWith('2026-08-01', '2026-08-10');
    expect(bigquery.getTopUsers).toHaveBeenCalledWith('2026-08-01', '2026-08-10');
  });

  it('respects currency settings from database', async () => {
    vi.mocked(settingsModule.getSettings).mockResolvedValue({
      defaultDateRange: 'month',
      currencyDisplay: 'EUR',
    });

    const searchParams = Promise.resolve({});
    const pageElement = await OverviewPage({ searchParams });

    expect(pageElement).toBeDefined();
    const jsonStr = JSON.stringify(pageElement);
    expect(jsonStr).toContain('"currency":"EUR"');
  });
});
