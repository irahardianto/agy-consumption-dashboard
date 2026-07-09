// Force server-side rendering — BigQuery calls need service account creds at runtime
export const dynamic = 'force-dynamic';

import React from 'react';

export default function MethodologyPage() {
  const sections = [
    {
      title: 'Data Source',
      content: 'Usage data is captured via the Vertex AI request-response logging API (setPublisherModelConfig). This captures the full payload of every request and response between Antigravity and Gemini publisher models.'
    },
    {
      title: 'Token Counts',
      content: 'Unlike many dashboards that estimate token usage using heuristics, this dashboard uses real token counts (promptTokenCount, candidatesTokenCount, thoughtsTokenCount) provided directly in the usageMetadata field of the Gemini response.'
    },
    {
      title: 'Cost Calculation',
      content: 'Costs are "inferred" by multiplying the real token counts by the per-model pricing rates configured in the Settings page. These rates default to Google Cloud\'s published list prices.'
    },
    {
      title: 'User Identification',
      content: 'Antigravity injects a <user_information> block into the system prompt of every conversation. We extract the OS username from this block using regex. Admins can then map these OS usernames to corporate identities in the Settings page.'
    },
    {
      title: 'Sub-Agent Attribution',
      content: 'Antigravity often uses sub-agents for internal routing or specialized tasks. These calls are attributed to the user who initiated the parent session by matching the trajectory_id. Overhead calls without a trajectory_id are distributed proportionally.'
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '800px' }}>
      <header>
        <h2 style={{ fontSize: 'var(--md-sys-typescale-headline-medium-size)', fontWeight: '600' }}>Methodology</h2>
        <p style={{ color: 'var(--md-sys-color-on-surface-variant)', marginTop: '4px' }}>
          Understanding how your usage data is collected, attributed, and calculated.
        </p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {sections.map((section, i) => (
          <div key={i} className="card">
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: 'var(--md-sys-color-primary)' }}>
              {section.title}
            </h3>
            <p style={{ lineHeight: '1.6', color: 'var(--md-sys-color-on-surface)' }}>
              {section.content}
            </p>
          </div>
        ))}
      </div>
      
      <div style={{ 
        padding: '24px', 
        borderRadius: 'var(--md-sys-shape-corner-medium)', 
        backgroundColor: 'var(--md-sys-color-primary-container)',
        color: 'var(--md-sys-color-on-primary-container)',
        display: 'flex',
        gap: '16px'
      }}>
        <span className="icon">info</span>
        <p style={{ fontSize: '14px' }}>
          Note: Inferred costs shown in this dashboard may differ from your actual Google Cloud invoice due to tiered pricing, committed use discounts, or free tier credits.
        </p>
      </div>
    </div>
  );
}
