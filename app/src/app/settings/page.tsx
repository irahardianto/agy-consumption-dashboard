// Force server-side rendering — BigQuery calls need service account creds at runtime
export const dynamic = 'force-dynamic';

import React from 'react';
import { getPricingSettings, getSettings, getUserMappings } from '@/lib/settings';
import { PricingForm } from '@/components/PricingForm';
import { DashboardSettingsForm } from '@/components/DashboardSettingsForm';
import { CsvUploadZone } from '@/components/CsvUploadZone';
import { UserMappingTable } from '@/components/UserMappingTable';

export default async function SettingsPage() {
  const [pricing, settings, userMappings] = await Promise.all([
    getPricingSettings(),
    getSettings(),
    getUserMappings()
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
      <header>
        <h2 style={{ fontSize: 'var(--md-sys-typescale-headline-medium-size)', fontWeight: '600' }}>Settings</h2>
        <p style={{ color: 'var(--md-sys-color-on-surface-variant)', marginTop: '4px' }}>
          Configure pricing, dashboard preferences, and manage user identity mappings.
        </p>
      </header>
      
      <DashboardSettingsForm initialSettings={settings} />

      <PricingForm initialPricing={pricing} />

      <section style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '600' }}>User Mapping</h3>
            <p style={{ fontSize: '14px', color: 'var(--md-sys-color-on-surface-variant)' }}>
              Map OS usernames to corporate identities. Upload a CSV or manage manually below.
            </p>
          </div>
        </div>
        
        <CsvUploadZone />
        
        <UserMappingTable initialMappings={userMappings} />
      </section>
    </div>
  );
}
