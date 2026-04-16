/**
 * AppLayout.mobile.tsx
 * Mobile navigation bar extracted from AppLayout.tsx (Wave 28 Phase A pre-split).
 * Provides MobileNavBar and related primitives for the bottom tab switcher
 * shown on web/mobile builds (hidden in Electron via CSS).
 */

import React from 'react';

export type MobilePanel = 'chat' | 'editor' | 'terminal' | 'files';

export const MOBILE_NAV_ITEMS: { id: MobilePanel; label: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'editor', label: 'Editor' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'chat', label: 'Chat' },
];

export const MOBILE_NAV_STYLE: React.CSSProperties = {
  display: 'none', flexShrink: 0, minHeight: '56px',
  alignItems: 'stretch', justifyContent: 'space-around',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
};

export function mobileNavButtonStyle(isActive: boolean): React.CSSProperties {
  return {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    flex: 1, gap: '3px', border: 'none', fontSize: '10px', cursor: 'pointer', padding: '6px 0',
    fontFamily: 'var(--font-ui, sans-serif)', position: 'relative',
    background: isActive ? 'rgba(255, 255, 255, 0.06)' : 'none', // hardcoded: opacity scrim — non-semantic tint for active mobile tab
    color: isActive ? 'var(--interactive-accent)' : 'var(--text-secondary)',
    fontWeight: isActive ? 600 : 400,
    transition: 'color 100ms ease, background-color 100ms ease',
  };
}

export const ACTIVE_INDICATOR_STYLE: React.CSSProperties = {
  position: 'absolute', top: 0, left: '25%', right: '25%',
  height: '2px', borderRadius: '1px', backgroundColor: 'var(--interactive-accent)',
};

export function MobileNavIcon({ id }: { id: MobilePanel }): React.ReactElement {
  if (id === 'files') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="5" y="2" width="10" height="13" rx="1.5" />
        <rect x="3" y="5" width="10" height="13" rx="1.5" fill="var(--surface-panel)" />
      </svg>
    );
  }
  if (id === 'editor') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <polyline points="7,5 3,10 7,15" /><polyline points="13,5 17,10 13,15" /><line x1="11" y1="3" x2="9" y2="17" />
      </svg>
    );
  }
  if (id === 'terminal') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="16" height="14" rx="2" />
        <polyline points="6,8 9,11 6,14" />
        <line x1="11" y1="14" x2="15" y2="14" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h12a2 2 0 012 2v6a2 2 0 01-2 2H8l-4 3v-3a2 2 0 01-2-2V6a2 2 0 012-2z" />
    </svg>
  );
}

interface MobileNavButtonProps {
  item: { id: MobilePanel; label: string };
  isActive: boolean;
  onSwitch: (p: MobilePanel) => void;
}

export function MobileNavButton({ item, isActive, onSwitch }: MobileNavButtonProps): React.ReactElement {
  return (
    <button key={item.id} onClick={() => onSwitch(item.id)} style={mobileNavButtonStyle(isActive)}>
      <MobileNavIcon id={item.id} />
      <span>{item.label}</span>
      {isActive && <span style={ACTIVE_INDICATOR_STYLE} />}
    </button>
  );
}

interface MobileNavBarProps { active: MobilePanel; onSwitch: (p: MobilePanel) => void; }

export function MobileNavBar({ active, onSwitch }: MobileNavBarProps): React.ReactElement {
  return (
    <nav data-layout="mobile-nav" className="web-mobile-only" style={MOBILE_NAV_STYLE}>
      {MOBILE_NAV_ITEMS.map((item) => (
        <MobileNavButton key={item.id} item={item} isActive={item.id === active} onSwitch={onSwitch} />
      ))}
    </nav>
  );
}
