/**
 * TitleBar.controls.tsx — WindowControls (Win32 chrome), NotificationBell,
 * PanelToggleBar. Extracted from TitleBar.tsx to stay under the 300-line limit.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import { BellIcon, NotificationBadge, NotificationCenter } from '../shared/NotificationCenter';
import { hoverStyle, titleButtonStyle } from './TitleBar';
import type { CollapseState, CollapseTarget } from './usePanelCollapse';

// ── WindowControls ────────────────────────────────────────────────────────────

function MinimizeBtn({ base, api }: { base: string; api: ReturnType<typeof window.electronAPI>['app'] | undefined }): React.ReactElement {
  return (
    <button className={`${base} hover:bg-[rgba(255,255,255,0.08)] text-text-semantic-muted`}
      onClick={() => api?.minimizeWindow()} title="Minimize" aria-label="Minimize"
    >
      <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor" /></svg>
    </button>
  );
}

function MaximizeBtn({ base, api }: { base: string; api: ReturnType<typeof window.electronAPI>['app'] | undefined }): React.ReactElement {
  return (
    <button className={`${base} hover:bg-[rgba(255,255,255,0.08)] text-text-semantic-muted`}
      onClick={() => api?.toggleMaximizeWindow()} title="Maximize" aria-label="Maximize"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
        <rect x="0.5" y="0.5" width="9" height="9" />
      </svg>
    </button>
  );
}

function CloseBtn({ base, api }: { base: string; api: ReturnType<typeof window.electronAPI>['app'] | undefined }): React.ReactElement {
  return (
    <button className={`${base} hover:bg-[#e81123] hover:text-white text-text-semantic-muted`}
      onClick={() => api?.closeWindow()} title="Close" aria-label="Close"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2">
        <line x1="1" y1="1" x2="9" y2="9" />
        <line x1="9" y1="1" x2="1" y2="9" />
      </svg>
    </button>
  );
}

export function WindowControls(): React.ReactElement | null {
  const [platform, setPlatform] = useState<string>('');
  useEffect(() => {
    window.electronAPI?.app?.getPlatform?.().then(setPlatform).catch(() => {});
  }, []);
  if (platform !== 'win32') return null;
  const api = window.electronAPI?.app;
  const base = 'titlebar-no-drag flex items-center justify-center w-[46px] h-full transition-colors duration-100';
  return (
    <div className="web-mobile-hide flex items-stretch h-full ml-auto" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <MinimizeBtn base={base} api={api} />
      <MaximizeBtn base={base} api={api} />
      <CloseBtn base={base} api={api} />
    </div>
  );
}

// ── NotificationBell ──────────────────────────────────────────────────────────

function useNotificationBellState(): {
  open: boolean; anchorRect: DOMRect | null; toggle: () => void;
  handleClose: () => void; buttonRef: React.RefObject<HTMLButtonElement | null>;
} {
  const { unreadCount, markAllRead } = useToastContext();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const updateAnchorRect = useCallback(() => { setAnchorRect(buttonRef.current?.getBoundingClientRect() ?? null); }, []);
  const toggle = useCallback(() => { setOpen((prev) => !prev); }, []);
  const handleClose = useCallback(() => { setOpen(false); }, []);
  useEffect(() => { if (open && unreadCount > 0) markAllRead(); }, [open, unreadCount, markAllRead]);
  useEffect(() => {
    if (!open) return;
    updateAnchorRect();
    window.addEventListener('resize', updateAnchorRect);
    window.addEventListener('scroll', updateAnchorRect, true);
    return () => { window.removeEventListener('resize', updateAnchorRect); window.removeEventListener('scroll', updateAnchorRect, true); };
  }, [open, updateAnchorRect]);
  return { open, anchorRect, toggle, handleClose, buttonRef };
}

export function NotificationBell(): React.ReactElement {
  const { notifications, unreadCount, removeNotification, clearAllNotifications } = useToastContext();
  const { open, anchorRect, toggle, handleClose, buttonRef } = useNotificationBellState();
  return (
    <div className="titlebar-no-drag" style={{ position: 'relative', height: '100%' }}>
      <button ref={buttonRef} className="titlebar-no-drag text-text-semantic-muted" title="Notifications"
        onMouseDown={(e) => { e.stopPropagation(); toggle(); }} style={titleButtonStyle} {...hoverStyle}
      >
        <BellIcon />
        <NotificationBadge count={unreadCount} />
      </button>
      {open && <NotificationCenter anchorRect={anchorRect} notifications={notifications}
        onRemove={removeNotification} onClearAll={clearAllNotifications} onClose={handleClose}
      />}
    </div>
  );
}

// ── PanelToggleBar ────────────────────────────────────────────────────────────

type PanelToggleConfig = { panel: CollapseTarget; title: string; shortcut?: string; Icon: () => React.ReactElement };

function PanelToggleButton({ config, isActive, onClick }: { config: PanelToggleConfig; isActive: boolean; onClick: () => void }): React.ReactElement {
  const label = `${isActive ? 'Hide' : 'Show'} ${config.title}${config.shortcut ? ` (${config.shortcut})` : ''}`;
  const restColor = isActive ? 'var(--text-secondary)' : 'var(--text-faint, var(--text-semantic-faint))';
  return (
    <button className="titlebar-no-drag" title={label} aria-label={label} onClick={onClick}
      style={{ ...titleButtonStyle, color: restColor, opacity: isActive ? 1 : 0.5 }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.backgroundColor = 'rgba(128,128,128,0.15)'; e.currentTarget.style.opacity = '1'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = restColor; e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.opacity = isActive ? '1' : '0.5'; }}
    >
      <config.Icon />
    </button>
  );
}

export function PanelToggleBar({ panelToggles, collapsed, onToggle }: {
  panelToggles: PanelToggleConfig[];
  collapsed?: CollapseState;
  onToggle?: (panel: CollapseTarget) => void;
}): React.ReactElement | null {
  if (!collapsed || !onToggle) return null;
  return (
    <>
      {panelToggles.map((config) => (
        <PanelToggleButton key={config.panel} config={config} isActive={!collapsed[config.panel]} onClick={() => onToggle(config.panel)} />
      ))}
    </>
  );
}
