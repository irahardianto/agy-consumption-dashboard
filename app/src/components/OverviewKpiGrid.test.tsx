import { describe, it, expect } from 'vitest';
import { OverviewKpiGrid } from './OverviewKpiGrid';

describe('OverviewKpiGrid component', () => {
  it('renders all 4 KPI cards with metric values and trends', () => {
    const metrics = {
      totalRequests: 12500,
      activeUsers: 42,
      totalTokens: 5_500_000,
      totalCost: 12.345,
    };

    const trends = {
      requestsTrend: { value: 15, isPositive: true, direction: 'up' as const },
      activeUsersTrend: { value: 5, isPositive: true, direction: 'up' as const },
      tokensTrend: { value: 20, isPositive: false, direction: 'down' as const },
      costTrend: { value: 8, isPositive: true, direction: 'up' as const },
    };

    const result = OverviewKpiGrid({ metrics, trends, currency: 'USD' });
    expect(result).toBeDefined();

    const jsonStr = JSON.stringify(result);
    expect(jsonStr).toContain('Total Requests');
    expect(jsonStr).toContain('12,500');
    expect(jsonStr).toContain('Active Users');
    expect(jsonStr).toContain('42');
    expect(jsonStr).toContain('Tokens Consumed');
    expect(jsonStr).toContain('5.50');
    expect(jsonStr).toContain('Inferred Cost');
    expect(jsonStr).toContain('$12.345');
    expect(jsonStr).toContain('"value":15');
    expect(jsonStr).toContain('"direction":"up"');
    expect(jsonStr).toContain('"direction":"down"');
  });

  it('renders correctly with default currency and undefined trends', () => {
    const metrics = {
      totalRequests: 0,
      activeUsers: 0,
      totalTokens: 0,
      totalCost: 0,
    };

    const result = OverviewKpiGrid({ metrics });
    expect(result).toBeDefined();

    const jsonStr = JSON.stringify(result);
    expect(jsonStr).toContain('Total Requests');
    expect(jsonStr).toContain('0');
    expect(jsonStr).toContain('$0.000');
  });
});
