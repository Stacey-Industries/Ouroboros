/**
 * TitleBar.tsx — Draggable window title bar with branding, dropdown menus, and action buttons.
 *
 * Sub-modules:
 *   TitleBar.menus.ts   — menu data definitions
 *   TitleBar.navbar.tsx — NavbarMenus with keyboard navigation
 *   TitleBar.mobile.tsx — MobileHamburgerMenu, MobileOverflowMenu
 */

import React, { useCallback, useEffect, useState } from 'react';

import ouroborosLogo from '../../../../public/OUROBOROS.png';
import { useToastContext } from '../../contexts/ToastContext';
import {
  OPEN_EXTENSION_STORE_EVENT,
  OPEN_MCP_STORE_EVENT,
  OPEN_SETTINGS_PANEL_EVENT,
} from '../../hooks/appEventNames';
import { useProgressSubscriptions } from '../../hooks/useProgressSubscriptions';
import { BellIcon, NotificationBadge, NotificationCenter } from '../shared/NotificationCenter';
import { MobileHamburgerMenu, MobileOverflowMenu } from './TitleBar.mobile';
import { NavbarMenus } from './TitleBar.navbar';
import type { CollapseState, CollapseTarget } from './usePanelCollapse';

// ── Icons ─────────────────────────────────────────────────────────────────────

function SettingsGearIcon(): React.ReactElement<any> {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.93 2.93l1.06 1.06M11.99 11.99l1.07 1.07M13.07 2.93l-1.06 1.06M4.01 11.99l-1.07 1.07" />
    </svg>
  );
}

function UsageBarIcon(): React.ReactElement<any> {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="8" width="3" height="7" rx="0.5" />
      <rect x="6.5" y="3" width="3" height="12" rx="0.5" />
      <rect x="12" y="1" width="3" height="14" rx="0.5" />
    </svg>
  );
}

function ExtensionStoreIcon(): React.ReactElement<any> {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2H6v4H2v4h4v4h4v-4h4V6h-4V2z" />
    </svg>
  );
}

function McpStoreIcon(): React.ReactElement<any> {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="1" width="10" height="5" rx="1" />
      <rect x="3" y="10" width="10" height="5" rx="1" />
      <line x1="8" y1="6" x2="8" y2="10" />
      <circle cx="5.5" cy="3.5" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="3.5" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="5.5" cy="12.5" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="12.5" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── Panel toggle icons ────────────────────────────────────────────────────────

function PanelLeftIcon(): React.ReactElement<any> {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><line x1="5.5" y1="2.5" x2="5.5" y2="13.5" /></svg>;
}

function PanelCentreIcon(): React.ReactElement<any> {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="5,4 3,8 5,12" /><polyline points="11,4 13,8 11,12" /><line x1="9" y1="3" x2="7" y2="13" /></svg>;
}

function PanelBottomIcon(): React.ReactElement<any> {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><line x1="1.5" y1="10" x2="14.5" y2="10" /></svg>;
}

function PanelRightIcon(): React.ReactElement<any> {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><line x1="10.5" y1="2.5" x2="10.5" y2="13.5" /></svg>;
}

// ── Shared styles ─────────────────────────────────────────────────────────────

export const hoverStyle = {
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.color = 'var(--text-primary)';
    e.currentTarget.style.backgroundColor = 'rgba(128,128,128,0.15)';
  },
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.color = '';
    e.currentTarget.style.backgroundColor = 'transparent';
  },
};

export const titleButtonStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '28px', height: '100%', background: 'none', border: 'none',
  cursor: 'pointer', transition: 'color 150ms, background-color 150ms', flexShrink: 0,
};

// ── Action button config ──────────────────────────────────────────────────────

export interface TitleBarAction {
  eventName: string;
  title: string;
  Icon: () => React.ReactElement<any>;
}

export const TITLE_BAR_ACTIONS: TitleBarAction[] = [
  { eventName: OPEN_EXTENSION_STORE_EVENT, title: 'Extension Store', Icon: ExtensionStoreIcon },
  { eventName: OPEN_MCP_STORE_EVENT, title: 'MCP Servers', Icon: McpStoreIcon },
  { eventName: OPEN_SETTINGS_PANEL_EVENT, title: 'Settings (Ctrl+,)', Icon: SettingsGearIcon },
  { eventName: 'agent-ide:open-usage-panel', title: 'Usage (Ctrl+U)', Icon: UsageBarIcon },
];

// ── WindowControls ────────────────────────────────────────────────────────────

function WindowControls(): React.ReactElement<any> | null {
  const [platform, setPlatform] = useState<string>('');
  useEffect(() => { window.electronAPI?.app?.getPlatform?.().then(setPlatform).catch(() => {}); }, []);
  if (platform !== 'win32') return null;
  const api = window.electronAPI?.app;
  const base = 'titlebar-no-drag flex items-center justify-center w-[46px] h-full transition-colors duration-100';
  return (
    <div className="web-mobile-hide flex items-stretch h-full ml-auto" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button className={`${base} hover:bg-[rgba(255,255,255,0.08)] text-text-semantic-muted`} onClick={() => api?.minimizeWindow()} title="Minimize" aria-label="Minimize">
        <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor" /></svg>
      </button>
      <button className={`${base} hover:bg-[rgba(255,255,255,0.08)] text-text-semantic-muted`} onClick={() => api?.toggleMaximizeWindow()} title="Maximize" aria-label="Maximize">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9" /></svg>
      </button>
      <button className={`${base} hover:bg-[#e81123] hover:text-white text-text-semantic-muted`} onClick={() => api?.closeWindow()} title="Close" aria-label="Close">
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2"><line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" /></svg>
      </button>
    </div>
  );
}

// ── Panel toggle bar ──────────────────────────────────────────────────────────

const PANEL_TOGGLES: Array<{ panel: CollapseTarget; title: string; shortcut?: string; Icon: () => React.ReactElement<any> }> = [
  { panel: 'leftSidebar', title: 'File Tree', shortcut: 'Ctrl+B', Icon: PanelLeftIcon },
  { panel: 'editor', title: 'Editor', Icon: PanelCentreIcon },
  { panel: 'terminal', title: 'Terminal', shortcut: 'Ctrl+J', Icon: PanelBottomIcon },
  { panel: 'rightSidebar', title: 'Chat', shortcut: 'Ctrl+\\', Icon: PanelRightIcon },
];

function PanelToggleButton({ config, isActive, onClick }: { config: typeof PANEL_TOGGLES[number]; isActive: boolean; onClick: () => void }): React.ReactElement<any> {
  const label = `${isActive ? 'Hide' : 'Show'} ${config.title}${config.shortcut ? ` (${config.shortcut})` : ''}`;
  return (
    <button className="titlebar-no-drag" title={label} aria-label={label} onClick={onClick}
      style={{ ...titleButtonStyle, color: isActive ? 'var(--text-secondary)' : 'var(--text-faint, var(--text-semantic-faint))', opacity: isActive ? 1 : 0.5 }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.backgroundColor = 'rgba(128,128,128,0.15)'; e.currentTarget.style.opacity = '1'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = isActive ? 'var(--text-secondary)' : 'var(--text-faint, var(--text-semantic-faint))'; e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.opacity = isActive ? '1' : '0.5'; }}>
      <config.Icon />
    </button>
  );
}

function PanelToggleBar({ collapsed, onToggle }: { collapsed?: CollapseState; onToggle?: (panel: CollapseTarget) => void }): React.ReactElement<any> | null {
  if (!collapsed || !onToggle) return null;
  return (
    <>{PANEL_TOGGLES.map((config) => (
      <PanelToggleButton key={config.panel} config={config} isActive={!collapsed[config.panel]} onClick={() => onToggle(config.panel)} />
    ))}</>
  );
}

// ── Notification bell ─────────────────────────────────────────────────────────

function NotificationBell(): React.ReactElement<any> {
  const { notifications, unreadCount, markAllRead, removeNotification, clearAllNotifications } = useToastContext();
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => { setOpen((prev) => !prev); }, []);
  useEffect(() => { if (open && unreadCount > 0) markAllRead(); }, [open, unreadCount, markAllRead]);
  const handleClose = useCallback(() => { setOpen(false); }, []);
  return (
    <div className="titlebar-no-drag" style={{ position: 'relative', height: '100%' }}>
      <button className="titlebar-no-drag text-text-semantic-muted" title="Notifications"
        onMouseDown={(e) => { e.stopPropagation(); toggle(); }} style={titleButtonStyle} {...hoverStyle}>
        <BellIcon /><NotificationBadge count={unreadCount} />
      </button>
      {open && <NotificationCenter notifications={notifications} onRemove={removeNotification} onClearAll={clearAllNotifications} onClose={handleClose} />}
    </div>
  );
}

// ── TitleBar ──────────────────────────────────────────────────────────────────

export interface TitleBarProps {
  collapsed?: CollapseState;
  onTogglePanel?: (panel: CollapseTarget) => void;
}

export function TitleBar({ collapsed, onTogglePanel }: TitleBarProps = {}): React.ReactElement<any> {
  useProgressSubscriptions();
  return (
    <div data-layout="title-bar" className="titlebar-drag flex-shrink-0 flex items-center bg-surface-panel"
      style={{ height: 'var(--titlebar-height, 36px)', borderBottom: '1px solid color-mix(in srgb, var(--border-semantic) 50%, transparent)' }}>
      <MobileHamburgerMenu titleButtonStyle={titleButtonStyle} hoverStyle={hoverStyle} />
      <img className="titlebar-no-drag select-none" src={ouroborosLogo} alt="Ouroboros"
        style={{ height: '20px', width: '20px', marginLeft: '8px', marginRight: '6px', flexShrink: 0, objectFit: 'contain', opacity: 0.9 }}
        draggable={false} />
      <div className="web-mobile-hide" style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
        <NavbarMenus />
      </div>
      <div className="flex-1" />
      <div className="web-mobile-hide" style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        <PanelToggleBar collapsed={collapsed} onToggle={onTogglePanel} />
        <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-semantic)', margin: '0 6px', opacity: 0.5 }} />
        {TITLE_BAR_ACTIONS.map((action) => (
          <button key={action.eventName} className="titlebar-no-drag text-text-semantic-muted" title={action.title}
            onClick={() => window.dispatchEvent(new CustomEvent(action.eventName))} style={titleButtonStyle} {...hoverStyle}>
            <action.Icon />
          </button>
        ))}
        <NotificationBell />
      </div>
      <MobileOverflowMenu titleBarActions={TITLE_BAR_ACTIONS} titleButtonStyle={titleButtonStyle} hoverStyle={hoverStyle} />
      <WindowControls />
    </div>
  );
}
