import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DashboardSettingsForm } from './DashboardSettingsForm';

describe('DashboardSettingsForm component', () => {
  it('renders with initial settings and options', () => {
    const html = renderToString(
      <DashboardSettingsForm
        initialSettings={{
          defaultDateRange: '7d',
          refreshInterval: '5m',
          currencyDisplay: 'EUR',
        }}
      />
    );

    expect(html).toContain('Dashboard Preferences');
    expect(html).toContain('Default Date Range');
    expect(html).toContain('Refresh Interval');
    expect(html).toContain('Currency Display');
  });
});
