'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavBarProps {
  // user prop retained for API compatibility but identity is not displayed.
  // Authentication is handled entirely at the IAP level — no login/logout UI is needed.
  user?: { email: string; id: string } | null;
}

export const NavBar: React.FC<NavBarProps> = ({ user }) => {
  const pathname = usePathname();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = savedTheme ? savedTheme === 'dark' : systemPrefersDark;
    setIsDarkMode(dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    localStorage.setItem('theme', nextDark ? 'dark' : 'light');
    document.documentElement.style.colorScheme = nextDark ? 'dark' : 'light';
  };

  const navItems = [
    { label: 'Overview', href: '/', icon: 'dashboard' },
    { label: 'Users', href: '/users', icon: 'group' },
    { label: 'Methodology', href: '/methodology', icon: 'help_outline' },
    { label: 'Settings', href: '/settings', icon: 'settings' },
  ];

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        padding: '16px 24px 8px 24px',
        backgroundColor: 'var(--md-sys-color-background)',
      }}
    >
      <nav
        className="glass"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          height: '64px',
          maxWidth: '1440px',
          margin: '0 auto',
          borderRadius: 'var(--md-sys-shape-corner-large)',
          boxShadow: 'var(--md-sys-elevation-1)',
        }}
      >
        {/* Logo + Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="icon" style={{ color: 'var(--md-sys-color-primary)', fontSize: '32px' }}>
            rocket_launch
          </span>
          <h1 style={{ fontSize: '20px', fontWeight: '600' }}>Antigravity Consumption</h1>
        </div>

        {/* Primary navigation */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: 'var(--md-sys-shape-corner-full)',
                  backgroundColor: isActive ? 'var(--md-sys-color-secondary-container)' : 'transparent',
                  color: isActive
                    ? 'var(--md-sys-color-on-secondary-container)'
                    : 'var(--md-sys-color-on-surface-variant)',
                  fontWeight: isActive ? '600' : '500',
                  fontSize: '14px',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'var(--md-sys-color-surface-variant)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span className="icon" aria-hidden="true" style={{ fontSize: '20px' }}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Right side: theme toggle and user email */}
        <div ref={containerRef} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {user?.email && (
            <span style={{ fontSize: '14px', color: 'var(--md-sys-color-on-surface-variant)', fontWeight: '500' }}>
              {user.email}
            </span>
          )}
          <button
            id="theme-toggle-btn"
            aria-label={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-pressed={isDarkMode}
            onClick={toggleTheme}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--md-sys-color-on-surface-variant)',
              transition: 'background-color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--md-sys-color-surface-variant)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span className="icon" style={{ fontSize: '22px' }}>
              {isDarkMode ? 'dark_mode' : 'light_mode'}
            </span>
          </button>
        </div>
      </nav>
    </header>
  );
};
