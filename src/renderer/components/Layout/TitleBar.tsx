/**
 * TitleBar.tsx — Draggable window title bar with branding, dropdown menus, and action buttons.
 *
 * Sub-modules:
 *   TitleBar.menus.ts    — menu data definitions
 *   TitleBar.navbar.tsx  — NavbarMenus with keyboard navigation
 *   TitleBar.mobile.tsx  — MobileHamburgerMenu, MobileOverflowMenu
 *   TitleBar.controls.tsx — WindowControls, NotificationBell, PanelToggleBar
 */

import React from 'react';

import ouroborosLogo from '../../../../public/OUROBOROS.png';
import {
  OPEN_EXTENSION_STORE_EVENT,
  OPEN_MCP_STORE_EVENT,
  OPEN_SETTINGS_PANEL_EVENT,
} from '../../hooks/appEventNames';
import { useProgressSubscriptions } from '../../hooks/useProgressSubscriptions';
import { ProductIcon } from '../shared/ProductIcon';
import { NotificationBell, PanelToggleBar, WindowControls } from './TitleBar.controls';
import { MobileFileTreeButton, MobileHamburgerMenu, MobileOverflowMenu } from './TitleBar.mobile';
import { NavbarMenus } from './TitleBar.navbar';
import { UsageActions } from './TitleBar.usage';
import type { CollapseState, CollapseTarget } from './usePanelCollapse';

// ── Icons ─────────────────────────────────────────────────────────────────────

function SettingsGearIcon(): React.ReactElement {
  return (
    <ProductIcon iconId="settings-gear" fallback={
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="2.5" />
        <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.93 2.93l1.06 1.06M11.99 11.99l1.07 1.07M13.07 2.93l-1.06 1.06M4.01 11.99l-1.07 1.07" />
      </svg>
    } />
  );
}

function UsageBarIcon(): React.ReactElement {
  return (
    <ProductIcon iconId="graph-left" fallback={
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="8" width="3" height="7" rx="0.5" />
        <rect x="6.5" y="3" width="3" height="12" rx="0.5" />
        <rect x="12" y="1" width="3" height="14" rx="0.5" />
      </svg>
    } />
  );
}

function ExtensionStoreIcon(): React.ReactElement {
  return (
    <ProductIcon iconId="extensions" fallback={
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2H6v4H2v4h4v4h4v-4h4V6h-4V2z" />
      </svg>
    } />
  );
}

function McpStoreIcon(): React.ReactElement {
  return (
    <ProductIcon iconId="server" fallback={
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="1" width="10" height="5" rx="1" />
        <rect x="3" y="10" width="10" height="5" rx="1" />
        <line x1="8" y1="6" x2="8" y2="10" />
        <circle cx="5.5" cy="3.5" r="0.7" fill="currentColor" stroke="none" />
        <circle cx="10.5" cy="3.5" r="0.7" fill="currentColor" stroke="none" />
        <circle cx="5.5" cy="12.5" r="0.7" fill="currentColor" stroke="none" />
        <circle cx="10.5" cy="12.5" r="0.7" fill="currentColor" stroke="none" />
      </svg>
    } />
  );
}

// ── Panel toggle icons ────────────────────────────────────────────────────────

function PanelLeftIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <line x1="5.5" y1="2.5" x2="5.5" y2="13.5" />
    </svg>
  );
}

function PanelCentreIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="5,4 3,8 5,12" />
      <polyline points="11,4 13,8 11,12" />
      <line x1="9" y1="3" x2="7" y2="13" />
    </svg>
  );
}

function PanelBottomIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <line x1="1.5" y1="10" x2="14.5" y2="10" />
    </svg>
  );
}

function PanelRightIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <line x1="10.5" y1="2.5" x2="10.5" y2="13.5" />
    </svg>
  );
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
  Icon: () => React.ReactElement;
}

const OPEN_USAGE_PANEL_EVENT = 'agent-ide:open-usage-panel';

export const TITLE_BAR_ACTIONS: TitleBarAction[] = [
  { eventName: OPEN_EXTENSION_STORE_EVENT, title: 'Extension Store', Icon: ExtensionStoreIcon },
  { eventName: OPEN_MCP_STORE_EVENT, title: 'MCP Servers', Icon: McpStoreIcon },
  { eventName: OPEN_SETTINGS_PANEL_EVENT, title: 'Settings (Ctrl+,)', Icon: SettingsGearIcon },
  { eventName: OPEN_USAGE_PANEL_EVENT, title: 'Usage (Ctrl+U)', Icon: UsageBarIcon },
];

const PANEL_TOGGLES = [
  { panel: 'leftSidebar' as CollapseTarget, title: 'File Tree', shortcut: 'Ctrl+B', Icon: PanelLeftIcon },
  { panel: 'editor' as CollapseTarget, title: 'Editor', Icon: PanelCentreIcon },
  { panel: 'terminal' as CollapseTarget, title: 'Terminal', shortcut: 'Ctrl+J', Icon: PanelBottomIcon },
  { panel: 'rightSidebar' as CollapseTarget, title: 'Chat', shortcut: 'Ctrl+\\', Icon: PanelRightIcon },
];

// ── TitleBarActionButtons ─────────────────────────────────────────────────────

function TitleBarActionButtons({ actions }: { actions: TitleBarAction[] }): React.ReactElement {
  return (
    <>
      {actions.map((action) => (
        <button key={action.eventName} className="titlebar-no-drag text-text-semantic-muted" title={action.title}
          onClick={() => window.dispatchEvent(new CustomEvent(action.eventName))} style={titleButtonStyle}
          {...(action.eventName === OPEN_SETTINGS_PANEL_EVENT ? { 'data-tour-anchor': 'settings-trigger' } : {})}
          {...hoverStyle}
        >
          <action.Icon />
        </button>
      ))}
    </>
  );
}

// ── Logo ──────────────────────────────────────────────────────────────────────

function TitleBarLogo(): React.ReactElement {
  return (
    <img className="titlebar-no-drag select-none" src={ouroborosLogo} alt="Ouroboros"
      style={{ height: '20px', width: '20px', marginLeft: '8px', marginRight: '6px', flexShrink: 0, objectFit: 'contain', opacity: 0.9 }}
      draggable={false}
    />
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

const DIVIDER_STYLE: React.CSSProperties = {
  width: '1px', height: '14px', backgroundColor: 'var(--border-semantic)', margin: '0 6px', opacity: 0.5,
};

// ── TitleBar ──────────────────────────────────────────────────────────────────

export interface TitleBarProps {
  collapsed?: CollapseState;
  onTogglePanel?: (panel: CollapseTarget) => void;
}

const TITLEBAR_STYLE: React.CSSProperties = {
  height: 'var(--titlebar-height, 36px)',
  background: 'var(--titlebar-bg)',
  backdropFilter: 'blur(var(--material-blur))',
  WebkitBackdropFilter: 'blur(var(--material-blur))',
  boxShadow: 'var(--shadow-inset)',
  borderBottom: '1px solid var(--stroke-inner)',
};

export function TitleBar({ collapsed, onTogglePanel }: TitleBarProps = {}): React.ReactElement {
  useProgressSubscriptions();
  const titleBarActions = TITLE_BAR_ACTIONS.filter((a) => a.eventName !== OPEN_USAGE_PANEL_EVENT);
  return (
    <div data-layout="title-bar" className="titlebar-drag flex-shrink-0 flex items-center" style={TITLEBAR_STYLE}>
      <MobileHamburgerMenu titleButtonStyle={titleButtonStyle} hoverStyle={hoverStyle} />
      <MobileFileTreeButton titleButtonStyle={titleButtonStyle} hoverStyle={hoverStyle} />
      <TitleBarLogo />
      <div className="web-mobile-hide" style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
        <NavbarMenus />
      </div>
      <div className="flex-1" />
      <div className="web-mobile-hide" style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        <PanelToggleBar panelToggles={PANEL_TOGGLES} collapsed={collapsed} onToggle={onTogglePanel} />
        <div style={DIVIDER_STYLE} />
        <TitleBarActionButtons actions={titleBarActions} />
        <UsageActions UsageIcon={UsageBarIcon} onOpenPanel={() => window.dispatchEvent(new CustomEvent(OPEN_USAGE_PANEL_EVENT))}
          titleButtonStyle={titleButtonStyle} hoverStyle={hoverStyle}
        />
        <NotificationBell />
      </div>
      <MobileOverflowMenu titleBarActions={TITLE_BAR_ACTIONS} titleButtonStyle={titleButtonStyle} hoverStyle={hoverStyle} />
      <WindowControls />
    </div>
  );
}
