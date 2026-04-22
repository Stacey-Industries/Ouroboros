/**
 * ChatOnlyTitleBar — Minimal title bar for chat-only shell.
 *
 * Drag surface: the <header> itself carries `titlebar-drag`; interactive
 * elements (sidebar-cycle, exit, window controls) override with
 * `WebkitAppRegion: 'no-drag'`. This matches the IDE TitleBar pattern and
 * gives the user a full-width drag strip. Phase D moved the model +
 * permission chips out of this bar, so there are no portaled popovers left
 * here that would need a dedicated no-drag zone.
 *
 * Sidebar-mode cycle button: pinned → collapsed → hidden → pinned. Tooltip
 * reflects current mode. onToggleDrawer kept for hidden-mode overlay compat.
 */

import React, { useCallback, useEffect, useState } from 'react';

import { useApprovalContext } from '../../../contexts/ApprovalContext';
import { useProject } from '../../../contexts/ProjectContext';
import { TOGGLE_IMMERSIVE_CHAT_EVENT } from '../../../hooks/appEventNames';
import type { ChatSidebarMode } from './useChatSidebarMode';

// ── Window controls (win32 only) ──────────────────────────────────────────────

function WindowControls(): React.ReactElement | null {
  const [platform, setPlatform] = useState('');
  useEffect(() => {
    window.electronAPI?.app?.getPlatform?.().then(setPlatform).catch(() => {});
  }, []);

  if (platform !== 'win32') return null;

  const api = window.electronAPI?.app;
  const base = 'flex items-center justify-center w-[46px] h-full bg-transparent transition-colors duration-100';
  return (
    <div className="flex items-stretch h-full ml-auto bg-transparent" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button className={`${base} text-text-semantic-muted hover:bg-[rgba(255,255,255,0.08)]`}
        onClick={() => api?.minimizeWindow()} title="Minimize" aria-label="Minimize">
        <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor" /></svg>
      </button>
      <button className={`${base} text-text-semantic-muted hover:bg-[rgba(255,255,255,0.08)]`}
        onClick={() => api?.toggleMaximizeWindow()} title="Maximize" aria-label="Maximize">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9" /></svg>
      </button>
      <button className={`${base} text-text-semantic-muted hover:bg-[#e81123] hover:text-white`} // hardcoded: Windows close-button canonical red — non-themeable platform color
        onClick={() => api?.closeWindow()} title="Close" aria-label="Close">
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2"><line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" /></svg>
      </button>
    </div>
  );
}

// ── SidebarToggleIcon ─────────────────────────────────────────────────────────

function SidebarPinnedIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <line x1="5.5" y1="2.5" x2="5.5" y2="13.5" />
    </svg>
  );
}

function SidebarCollapsedIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <line x1="5.5" y1="2.5" x2="5.5" y2="13.5" />
      <polyline points="3,7 4.5,8.5 3,10" />
    </svg>
  );
}

function SidebarHiddenIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
    </svg>
  );
}

function sidebarModeLabel(mode: ChatSidebarMode): string {
  if (mode === 'pinned') return 'Sidebar pinned — click to collapse';
  if (mode === 'collapsed') return 'Sidebar collapsed — click to hide';
  return 'Sidebar hidden — click to pin';
}

// ── TitleBarLeft ──────────────────────────────────────────────────────────────

interface TitleBarLeftProps {
  projectName: string;
  sidebarMode: ChatSidebarMode;
  onCycleSidebarMode: () => void;
}

function TitleBarLeft({ projectName, sidebarMode, onCycleSidebarMode }: TitleBarLeftProps): React.ReactElement {
  const icon =
    sidebarMode === 'pinned' ? <SidebarPinnedIcon /> :
    sidebarMode === 'collapsed' ? <SidebarCollapsedIcon /> :
    <SidebarHiddenIcon />;

  return (
    <>
      <button
        className="flex items-center justify-center w-8 h-8 rounded text-text-semantic-muted hover:text-text-semantic-primary hover:bg-surface-hover transition-colors shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onClick={onCycleSidebarMode}
        title={sidebarModeLabel(sidebarMode)}
        aria-label={sidebarModeLabel(sidebarMode)}
        data-testid="sidebar-cycle-button"
      >
        {icon}
      </button>
      {projectName && (
        <span className="text-sm font-medium text-text-semantic-primary truncate max-w-[160px]">
          {projectName}
        </span>
      )}
    </>
  );
}

// ── ExitChatButton ────────────────────────────────────────────────────────────

function ExitChatIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <line x1="10.5" y1="2.5" x2="10.5" y2="13.5" />
      <polyline points="13,6.5 14.5,8 13,9.5" />
    </svg>
  );
}

function ExitChatButton(): React.ReactElement {
  const handleClick = useCallback((): void => {
    window.dispatchEvent(new CustomEvent(TOGGLE_IMMERSIVE_CHAT_EVENT));
  }, []);
  return (
    <button
      type="button"
      className="flex items-center justify-center w-8 h-8 rounded text-text-semantic-muted hover:text-text-semantic-primary hover:bg-surface-hover transition-colors shrink-0"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onClick={handleClick}
      title="Exit chat mode"
      aria-label="Exit chat mode"
    >
      <ExitChatIcon />
    </button>
  );
}

// ── TitleBarRight ─────────────────────────────────────────────────────────────

function TitleBarRight(): React.ReactElement {
  const { pendingCount } = useApprovalContext();
  return (
    <>
      {pendingCount > 0 && (
        <div
          className="rounded-full border border-status-warning bg-status-warning-subtle px-2 py-0.5 text-[11px] font-medium text-status-warning"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title={`${pendingCount} approval${pendingCount === 1 ? '' : 's'} waiting`}
          aria-label={`${pendingCount} approval${pendingCount === 1 ? '' : 's'} waiting`}
          data-testid="chat-approval-pill"
        >
          {pendingCount} approval{pendingCount === 1 ? '' : 's'}
        </div>
      )}
      <ExitChatButton />
      <WindowControls />
    </>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ChatOnlyTitleBarProps {
  /** Legacy: used only when sidebarMode='hidden' to toggle the overlay drawer. */
  onToggleDrawer: () => void;
  /** Cycles sidebar mode: pinned → collapsed → hidden → pinned. */
  onCycleSidebarMode: () => void;
  /** Current sidebar mode — controls icon and tooltip on the cycle button. */
  sidebarMode: ChatSidebarMode;
}

// ── ChatOnlyTitleBar ──────────────────────────────────────────────────────────

export function ChatOnlyTitleBar({ onCycleSidebarMode, sidebarMode }: ChatOnlyTitleBarProps): React.ReactElement {
  const { projectName } = useProject();
  return (
    <header
      className="titlebar-drag flex items-center px-2 gap-2 text-text-semantic-primary select-none shrink-0"
      style={{
        height: 'var(--titlebar-height, 36px)',
        background: 'var(--titlebar-bg)',
        backdropFilter: 'blur(var(--material-blur))',
        WebkitBackdropFilter: 'blur(var(--material-blur))',
        boxShadow: 'var(--shadow-inset)',
        borderBottom: '1px solid var(--stroke-inner)',
      }}
      data-testid="chat-only-title-bar"
    >
      <TitleBarLeft
        projectName={projectName}
        sidebarMode={sidebarMode}
        onCycleSidebarMode={onCycleSidebarMode}
      />
      <div className="flex-1" />
      <TitleBarRight />
    </header>
  );
}
