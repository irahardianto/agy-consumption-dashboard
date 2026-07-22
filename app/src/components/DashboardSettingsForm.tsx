'use client';

import React, { useState, useTransition } from 'react';
import { updateDashboardSetting } from '@/app/actions';

interface DashboardSettingsFormProps {
  initialSettings: Record<string, string>;
}

export function DashboardSettingsForm({ initialSettings }: DashboardSettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [settings, setSettings] = useState({
    defaultDateRange: initialSettings['defaultDateRange'] || '7d',
    refreshInterval: initialSettings['refreshInterval'] || 'never',
    currencyDisplay: initialSettings['currencyDisplay'] || 'USD'
  });

  const handleChange = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    
    startTransition(async () => {
      await updateDashboardSetting(key, value);
    });
  };

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h3 style={{ fontSize: '18px', fontWeight: '600' }}>Dashboard Preferences</h3>
        <p style={{ fontSize: '14px', color: 'var(--md-sys-color-on-surface-variant)' }}>
          Configure general dashboard behavior and display options.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500' }}>Default Date Range</label>
          <select 
            value={settings.defaultDateRange} 
            onChange={(e) => handleChange('defaultDateRange', e.target.value)}
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--md-sys-color-outline)', backgroundColor: 'var(--md-sys-color-surface)', color: 'inherit' }}
            disabled={isPending}
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="this_month">This Month</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500' }}>Refresh Interval</label>
          <select 
            value={settings.refreshInterval} 
            onChange={(e) => handleChange('refreshInterval', e.target.value)}
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--md-sys-color-outline)', backgroundColor: 'var(--md-sys-color-surface)', color: 'inherit' }}
            disabled={isPending}
          >
            <option value="never">Never (Manual)</option>
            <option value="5m">Every 5 minutes</option>
            <option value="15m">Every 15 minutes</option>
            <option value="1h">Every 1 hour</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500' }}>Currency Display</label>
          <select 
            value={settings.currencyDisplay} 
            onChange={(e) => handleChange('currencyDisplay', e.target.value)}
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--md-sys-color-outline)', backgroundColor: 'var(--md-sys-color-surface)', color: 'inherit' }}
            disabled={isPending}
          >
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
          </select>
        </div>
      </div>
      
      {isPending && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--md-sys-color-primary)', fontSize: '14px' }}>
          <span className="icon" style={{ animation: 'spin 1s linear infinite' }}>sync</span>
          Saving preferences...
        </div>
      )}
    </section>
  );
}
