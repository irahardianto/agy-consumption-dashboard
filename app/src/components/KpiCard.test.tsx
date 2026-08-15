import { describe, it, expect } from 'vitest';
import { KpiCard } from './KpiCard';

describe('KpiCard component', () => {
  it('renders label, value, and unit without crashing', () => {
    const result = KpiCard({ label: 'Total Requests', value: '1,234', unit: 'reqs', icon: 'bolt' });
    expect(result).toBeDefined();
    const str = JSON.stringify(result);
    expect(str).toContain('Total Requests');
    expect(str).toContain('1,234');
    expect(str).toContain('reqs');
    expect(str).toContain('bolt');
  });

  it('renders positive trend correctly', () => {
    const result = KpiCard({
      label: 'Tokens',
      value: '5.2M',
      trend: { value: 12, isPositive: true },
      trendLabel: 'vs last week',
    });
    expect(result).toBeDefined();
    const str = JSON.stringify(result);
    expect(str).toContain('12');
    expect(str).toContain('trending_up');
    expect(str).toContain('vs last week');
  });

  it('renders negative trend correctly', () => {
    const result = KpiCard({
      label: 'Cost',
      value: '$50.00',
      trend: { value: 8, isPositive: false },
    });
    expect(result).toBeDefined();
    const str = JSON.stringify(result);
    expect(str).toContain('8');
    expect(str).toContain('trending_down');
  });
});
