export default function SettingsLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '48px', padding: '24px' }}>
      <header>
        <div style={{ height: '32px', width: '150px', backgroundColor: 'var(--md-sys-color-surface-container-high)', borderRadius: '8px', animation: 'pulse 1.5s infinite' }} />
        <div style={{ height: '20px', width: '300px', backgroundColor: 'var(--md-sys-color-surface-container)', borderRadius: '4px', marginTop: '8px', animation: 'pulse 1.5s infinite' }} />
      </header>
      <div style={{ height: '300px', width: '100%', backgroundColor: 'var(--md-sys-color-surface-container)', borderRadius: '12px', animation: 'pulse 1.5s infinite' }} />
      <div style={{ height: '400px', width: '100%', backgroundColor: 'var(--md-sys-color-surface-container)', borderRadius: '12px', animation: 'pulse 1.5s infinite' }} />
    </div>
  );
}
