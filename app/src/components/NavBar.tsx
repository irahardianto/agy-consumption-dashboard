'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavBarProps {
  user: { email: string; id: string } | null;
}

export const NavBar: React.FC<NavBarProps> = ({ user }) => {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const switchRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Close dropdown on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus management when opening dropdown
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        switchRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Keyboard navigation within the dropdown menu
  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    const items = Array.from(
      menuRef.current?.querySelectorAll('#theme-toggle-switch, .action-link') || []
    ) as HTMLElement[];

    if (items.length === 0) return;

    const activeEl = document.activeElement as HTMLElement;
    const currentIndex = items.indexOf(activeEl);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % items.length;
      items[nextIndex]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + items.length) % items.length;
      items[prevIndex]?.focus();
    } else if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (currentIndex === 0) {
          e.preventDefault();
          setIsOpen(false);
          triggerRef.current?.focus();
        }
      } else {
        if (currentIndex === items.length - 1) {
          setIsOpen(false);
        }
      }
    }
  };

  // User parsing and dynamic styles helpers
  const email = user?.email || 'guest@example.com';
  const userId = user?.id || 'guest-user';

  const getDisplayNameFromEmail = (emailStr: string): string => {
    const localPart = emailStr.split('@')[0] || '';
    if (localPart === 'admin') return 'Admin User';
    return localPart
      .split(/[\._-]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const displayName = getDisplayNameFromEmail(email);

  const getInitials = (nameStr: string): string => {
    const parts = nameStr.trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) return '?';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + (parts[parts.length - 1]?.charAt(0) || '')).toUpperCase();
  };

  const initials = getInitials(displayName);

  const getHashId = (emailStr: string): number => {
    let sum = 0;
    for (let i = 0; i < emailStr.length; i++) {
      sum += emailStr.charCodeAt(i);
    }
    return sum % 5;
  };

  const hashId = getHashId(email);

  const navItems = [
    { label: 'Overview', href: '/', icon: 'dashboard' },
    { label: 'Users', href: '/users', icon: 'group' },
    { label: 'Methodology', href: '/methodology', icon: 'help_outline' },
    { label: 'Settings', href: '/settings', icon: 'settings' },
  ];

  return (
    <nav className="glass" style={{ 
      position: 'sticky', 
      top: 0, 
      zIndex: 100, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between', 
      padding: '0 24px', 
      height: '64px',
      borderBottom: '1px solid var(--md-sys-color-outline-variant)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span className="icon" style={{ color: 'var(--md-sys-color-primary)', fontSize: '32px' }}>
          rocket_launch
        </span>
        <h1 style={{ fontSize: '20px', fontWeight: '600' }}>Antigravity Consumption</h1>
      </div>

      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
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
                color: isActive ? 'var(--md-sys-color-on-secondary-container)' : 'var(--md-sys-color-on-surface-variant)',
                fontWeight: isActive ? '600' : '500',
                fontSize: '14px',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'var(--md-sys-color-surface-variant)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <span className="icon" aria-hidden="true" style={{ fontSize: '20px' }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>

      <div ref={containerRef} className="user-profile-container">
        
        {/* Trigger Button */}
        <button 
          ref={triggerRef}
          id="user-profile-trigger" 
          className="user-profile-trigger" 
          aria-haspopup="true" 
          aria-expanded={isOpen}
          aria-controls="user-profile-menu"
          onClick={() => setIsOpen(!isOpen)}
        >
          {/* User Info Block (Hidden on mobile) */}
          <div className="trigger-info">
            <span className="trigger-name">{displayName}</span>
            <span className="trigger-email">{email}</span>
          </div>
          
          {/* Avatar Initials Badge */}
          <div className={`avatar-badge avatar-color-${hashId}`} aria-hidden="true">
            {initials}
          </div>
          
          {/* Chevron Indicator */}
          <span className="icon chevron-icon" aria-hidden="true">expand_more</span>
        </button>

        {/* Mobile Scrim / Backdrop overlay */}
        {isOpen && (
          <div 
            className="mobile-scrim" 
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              zIndex: 150
            }}
          />
        )}

        {/* Dropdown Popover (Card) */}
        <div 
          ref={menuRef}
          id="user-profile-menu" 
          className="user-profile-card glass" 
          role="menu" 
          aria-labelledby="user-profile-trigger"
          hidden={!isOpen}
          onKeyDown={handleMenuKeyDown}
        >
          {/* Card Header */}
          <div className="profile-card-header">
            <div className={`avatar-large avatar-color-${hashId}`}>{initials}</div>
            <h3 className="profile-card-title">{displayName}</h3>
            <p className="profile-card-subtitle">{email}</p>
          </div>
          
          <div className="profile-card-divider" role="separator"></div>
          
          {/* Card Content / Meta Info */}
          <div className="profile-card-body">
            <div className="meta-row">
              <span className="meta-label">User ID:</span>
              <span className="meta-value">{userId}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Role:</span>
              <span className="meta-value badge">Administrator</span>
            </div>
          </div>
          
          <div className="profile-card-divider" role="separator"></div>
          
          {/* Quick Settings / Actions */}
          <div className="profile-card-actions" role="none">
            
            {/* Theme Switch Option */}
            <div className="action-item-wrapper">
              <div className="action-meta">
                <span className="icon">{isDarkMode ? 'dark_mode' : 'light_mode'}</span>
                <span className="action-label">Dark Theme</span>
              </div>
              
              {/* MD3 Switch */}
              <button 
                ref={switchRef}
                id="theme-toggle-switch" 
                className="md3-switch" 
                role="switch" 
                aria-checked={isDarkMode} 
                aria-label="Toggle dark theme"
                onClick={toggleTheme}
              >
                <span className="md3-switch-thumb">
                  <span className="icon" style={{ fontSize: '16px' }}>
                    {isDarkMode ? 'dark_mode' : 'light_mode'}
                  </span>
                </span>
              </button>
            </div>
            
            {/* Settings Shortcut */}
            <Link href="/settings" className="action-link" role="menuitem" onClick={() => setIsOpen(false)}>
              <span className="icon">settings</span>
              <span>Account Settings</span>
            </Link>

            {/* Logout Trigger */}
            <a href="/_gcp_iap/clear_session" className="action-link" role="menuitem">
              <span className="icon">logout</span>
              <span>Log Out</span>
            </a>
            
          </div>
        </div>
      </div>
    </nav>
  );
};
