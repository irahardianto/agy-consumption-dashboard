// Force server-side rendering — BigQuery calls need service account creds at runtime
export const dynamic = 'force-dynamic';

import React from 'react';
import { getSettings } from '@/lib/settings';
import { PRICING_DEFAULTS } from '@/lib/cost';
import { DataTable } from '@/components/DataTable';

export default async function SettingsPage() {
  const settings = await getSettings();

  const pricingData = Object.entries(PRICING_DEFAULTS).map(([model, pricing]) => ({
    model,
    input: pricing.input,
    output: pricing.output,
  }));

  const pricingColumns = [
    { header: 'Model', accessor: 'model' as const },
    { header: 'Input ($/1M)', accessor: 'input' as const, align: 'right' as const },
    { header: 'Output ($/1M)', accessor: 'output' as const, align: 'right' as const },
    { 
      header: 'Actions', 
      accessor: () => (
        <button style={{ color: 'var(--md-sys-color-primary)', fontWeight: '600', fontSize: '12px' }}>
          EDIT
        </button>
      ),
      align: 'right' as const
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
      <header>
        <h2 style={{ fontSize: 'var(--md-sys-typescale-headline-medium-size)', fontWeight: '600' }}>Settings</h2>
        <p style={{ color: 'var(--md-sys-color-on-surface-variant)', marginTop: '4px' }}>
          Configure pricing and manage user identity mappings.
        </p>
      </header>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '600' }}>Model Pricing</h3>
            <p style={{ fontSize: '14px', color: 'var(--md-sys-color-on-surface-variant)' }}>
              Inferred costs are calculated based on these rates.
            </p>
          </div>
          <button className="button-primary">
            <span className="icon">refresh</span>
            Reset to Defaults
          </button>
        </div>
        <div className="card" style={{ padding: 0 }}>
          <DataTable data={pricingData} columns={pricingColumns} />
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '600' }}>User Mapping</h3>
            <p style={{ fontSize: '14px', color: 'var(--md-sys-color-on-surface-variant)' }}>
              Map OS usernames to corporate identities.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="button-text">
              <span className="icon">download</span>
              Export CSV
            </button>
            <button className="button-primary">
              <span className="icon">upload</span>
              Upload CSV
            </button>
          </div>
        </div>
        <div className="card" style={{ 
          height: '200px', 
          border: '2px dashed var(--md-sys-color-outline-variant)', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          backgroundColor: 'transparent'
        }}>
          <span className="icon" style={{ fontSize: '48px', color: 'var(--md-sys-color-outline)', marginBottom: '16px' }}>
            cloud_upload
          </span>
          <p style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Drag and drop CSV here to upload mappings</p>
          <span style={{ fontSize: '12px', color: 'var(--md-sys-color-outline)', marginTop: '8px' }}>
            Format: os_username, display_name, email
          </span>
        </div>
      </section>
    </div>
  );
}
