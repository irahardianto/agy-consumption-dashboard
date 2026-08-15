import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PricingForm } from './PricingForm';

describe('PricingForm component', () => {
  it('renders model pricing structure and rates', () => {
    const html = renderToString(
      <PricingForm
        initialPricing={{
          'gemini-3.5-flash': { input: 1.5, output: 7.5 },
        }}
      />
    );

    expect(html).toContain('Model Pricing');
    expect(html).toContain('gemini-3.5-flash');
    expect(html).toContain('Reset to Defaults');
  });
});
