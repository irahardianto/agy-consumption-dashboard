import { describe, it, expect } from 'vitest';
import { ChartCard } from './ChartCard';
import React from 'react';

describe('ChartCard component', () => {
  it('renders title and children structure', () => {
    const result = ChartCard({
      title: 'Usage Trends',
      children: React.createElement('div', null, 'Chart Content'),
    });
    expect(result).toBeDefined();
    const str = JSON.stringify(result);
    expect(str).toContain('Usage Trends');
    expect(str).toContain('Chart Content');
  });

  it('renders subtitle when provided', () => {
    const result = ChartCard({
      title: 'Model Breakdown',
      subtitle: 'Distribution of tokens by model',
      children: React.createElement('div', null, 'Content'),
    });
    expect(result).toBeDefined();
    const str = JSON.stringify(result);
    expect(str).toContain('Model Breakdown');
    expect(str).toContain('Distribution of tokens by model');
  });
});
