/**
 * TitleBar.tsx — Draggable window title bar with branding and action buttons.
 * Extracted from AppLayout.tsx to reduce file size.
 */

import React from 'react';
import ouroborosLogo from '../../../../public/OUROBOROS.png';

function SettingsGearIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.93 2.93l1.06 1.06M11.99 11.99l1.07 1.07M13.07 2.93l-1.06 1.06M4.01 11.99l-1.07 1.07" />
    </svg>
  );
}

function UsageBarIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="8" width="3" height="7" rx="0.5" />
      <rect x="6.5" y="3" width="3" height="12" rx="0.5" />
      <rect x="12" y="1" width="3" height="14" rx="0.5" />
    </svg>
  );
}

const hoverStyle = {
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.color = 'var(--text)';
    e.currentTarget.style.backgroundColor = 'rgba(128,128,128,0.15)';
  },
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.color = 'var(--text-muted)';
    e.currentTarget.style.backgroundColor = 'transparent';
  },
};

const titleButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '100%',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  transition: 'color 150ms, background-color 150ms',
  flexShrink: 0,
};

export function TitleBar(): React.ReactElement {
  return (
    <div
      className="titlebar-drag flex-shrink-0 flex items-center"
      style={{
        height: 'var(--titlebar-height, 32px)',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <img
        className="titlebar-no-drag select-none"
        src={ouroborosLogo}
        alt="Ouroboros"
        style={{ height: '18px', width: '18px', marginLeft: '8px', marginRight: '6px', flexShrink: 0, objectFit: 'contain', opacity: 0.9 }}
        draggable={false}
      />
      <span
        className="select-none"
        style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500, marginRight: '4px' }}
      >
        Ouroboros
      </span>
      <button
        className="titlebar-no-drag"
        title="Settings (Ctrl+,)"
        onClick={() => window.dispatchEvent(new CustomEvent('agent-ide:open-settings-panel'))}
        style={titleButtonStyle}
        {...hoverStyle}
      >
        <SettingsGearIcon />
      </button>
      <button
        className="titlebar-no-drag"
        title="Usage (Ctrl+U)"
        onClick={() => window.dispatchEvent(new CustomEvent('agent-ide:open-usage-panel'))}
        style={titleButtonStyle}
        {...hoverStyle}
      >
        <UsageBarIcon />
      </button>
      <div className="flex-1" />
      <div style={{ width: 140 }} />
    </div>
  );
}
