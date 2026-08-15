import { describe, it, expect } from 'vitest';
import { formatCost } from './currencyUtils';

describe('formatCost utility', () => {
  it('should format USD with default 3 decimals', () => {
    expect(formatCost(12.3456, 'USD')).toBe('$12.346');
    expect(formatCost(0, 'USD')).toBe('$0.000');
  });

  it('should format USD when currency is omitted (default USD)', () => {
    expect(formatCost(10.5)).toBe('$10.500');
  });

  it('should format EUR with 0.92 conversion rate', () => {
    // 100 * 0.92 = 92.000
    expect(formatCost(100, 'EUR', 2)).toBe('€92.00');
  });

  it('should format GBP with 0.78 conversion rate', () => {
    // 100 * 0.78 = 78.000
    expect(formatCost(100, 'GBP', 2)).toBe('£78.00');
  });

  it('should support custom decimal places', () => {
    expect(formatCost(5.123456, 'USD', 4)).toBe('$5.1235');
    expect(formatCost(5.123456, 'USD', 0)).toBe('$5');
  });

  it('should default to $ symbol when currency is unknown', () => {
    expect(formatCost(50, 'JPY')).toBe('$50.000');
  });
});
