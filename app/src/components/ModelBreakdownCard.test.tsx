import { describe, it, expect, vi } from 'vitest';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (init: any) => [init, vi.fn()],
    useRef: (init: any) => ({ current: init }),
  };
});

import { ModelBreakdownCard } from './ModelBreakdownCard';

const replacer = () => {
  const seen = new WeakSet();
  return (key: string, value: any) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return;
      seen.add(value);
    }
    return value;
  };
};

describe('ModelBreakdownCard Component', () => {
  it('returns null when breakdown is empty', () => {
    const result = ModelBreakdownCard({ breakdown: [] });
    expect(result).toBeNull();
  });

  it('renders breakdown items with short model names, tokens, and percentages', () => {
    const breakdown = [
      {
        model: 'publishers/google/models/gemini-1.5-pro',
        shortModel: 'gemini-1.5-pro',
        tokens: 1_500_000,
        cost: 7.5,
        percentage: 75.0,
      },
      {
        model: 'publishers/google/models/gemini-1.5-flash',
        shortModel: 'gemini-1.5-flash',
        tokens: 500_000,
        cost: 0.5,
        percentage: 25.0,
      },
    ];

    const result = ModelBreakdownCard({ breakdown });
    expect(result).toBeDefined();

    const jsonStr = JSON.stringify(result, replacer());
    expect(jsonStr).toContain('Model Breakdown');
    expect(jsonStr).toContain('gemini-1.5-pro');
    expect(jsonStr).toContain('1.50M tokens');
    expect(jsonStr).toContain('75.0%');
    expect(jsonStr).toContain('gemini-1.5-flash');
    expect(jsonStr).toContain('0.50M tokens');
    expect(jsonStr).toContain('25.0%');
  });
});
