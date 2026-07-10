// Force server-side rendering — BigQuery calls need service account creds at runtime
export const dynamic = 'force-dynamic';

import React from 'react';
import { getPricingSettings } from '@/lib/settings';
import { PricingForm } from '@/components/PricingForm';

export default async function SettingsPage() {
  const pricing = await getPricingSettings();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
      <header>
        <h2 style={{ fontSize: 'var(--md-sys-typescale-headline-medium-size)', fontWeight: '600' }}>Settings</h2>
        <p style={{ color: 'var(--md-sys-color-on-surface-variant)', marginTop: '4px' }}>
          Configure pricing and manage user identity mappings.
        </p>
      </header>

      <PricingForm initialPricing={pricing} />


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
