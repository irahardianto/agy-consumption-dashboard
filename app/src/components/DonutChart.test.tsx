import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (init: any) => [init, vi.fn()],
    useRef: (init: any) => ({ current: init }),
  };
});

import { DonutChart } from './DonutChart';

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

describe('DonutChart Component', () => {
  it('renders empty state message when data is empty', () => {
    const result = DonutChart({ data: [] });
    expect(result).toBeDefined();
    const jsonStr = JSON.stringify(result, replacer());
    expect(jsonStr).toContain('No model usage data available for this period');
  });

  it('renders empty state when all values are zero', () => {
    const result = DonutChart({ data: [{ label: 'gemini-3.5-flash', value: 0 }] });
    expect(result).toBeDefined();
    const jsonStr = JSON.stringify(result, replacer());
    expect(jsonStr).toContain('No model usage data available for this period');
  });

  it('renders chart and legends with model labels and token counts', () => {
    const data = [
      { label: 'publishers/google/models/gemini-3.5-flash', value: 1000000 },
      { label: 'models/gemini-3.1-pro-preview', value: 500000 },
    ];
    const result = DonutChart({ data });
    expect(result).toBeDefined();
    const jsonStr = JSON.stringify(result, replacer());
    expect(jsonStr).toContain('gemini-3.5-flash');
    expect(jsonStr).toContain('gemini-3.1-pro-preview');
    expect(jsonStr).toContain('Total Tokens');
  });
});
