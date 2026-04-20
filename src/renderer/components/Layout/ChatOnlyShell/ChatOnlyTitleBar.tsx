/**
 * ChatOnlyTitleBar — Minimal title bar for chat-only shell (Wave 43/44).
 *
 * Wave 43 Phase C: removed ChatModeBadge, removed "Exit chat mode" button
 * (moved to View menu only), removed border-b divider. Model + permission
 * chips mounted inline via ChatOnlyHeaderControls.
 *
 * Wave 44 Phase A: restored "Exit chat mode" icon button (right of header
 * controls, left of WindowControls). Moved WebkitAppRegion: 'drag' off the
 * <header> element onto a dedicated flex-1 spacer div so dropdown popovers
 * rendered in portals outside the no-drag zones receive pointer events.
 *
 * Wave 44 Phase B: drawer-toggle button replaced by sidebar-mode cycle button.
 * Three-state cycle: pinned → collapsed → hidden → pinned. Tooltip reflects
 * current mode. onToggleDrawer kept for hidden-mode legacy overlay compat.
 *
 * No File/Edit/View dropdowns — immersive chat shell is minimal by design.
 * Window controls are inline to avoid duplicating TitleBar.tsx's logic.
 */

import React, { useCallback, useEffect, useState } from 'react';

import { useProject } from '../../../contexts/ProjectContext';
import { TOGGLE_IMMERSIVE_CHAT_EVENT } from '../../../hooks/appEventNames';
import { ChatOnlyHeaderControls } from './ChatOnlyHeaderControls';
import type { ChatSidebarMode } from './useChatSidebarMode';

// ── Window controls (win32 only) ──────────────────────────────────────────────

function WindowControls(): React.ReactElement | null {
  const [platform, setPlatform] = useState('');
  useEffect(() => {
    window.electronAPI?.app?.getPlatform?.().then(setPlatform).catch(() => {});
  }, []);

  if (platform !== 'win32') return null;

  const api = window.electronAPI?.app;
  const base = 'flex items-center justify-center w-[46px] h-full transition-colors duration-100';
  return (
    <div className="flex items-stretch h-full ml-auto" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button className={`${base} text-text-semantic-muted hover:bg-surface-hover`}
        onClick={() => api?.minimizeWindow()} title="Minimize" aria-label="Minimize">
        <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor" /></svg>
      </button>
      <button className={`${base} text-text-semantic-muted hover:bg-surface-hover`}
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
  return (
    <>
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
      className="flex items-center h-9 px-2 gap-2 bg-surface-chat text-text-semantic-primary select-none shrink-0"
      data-testid="chat-only-title-bar"
    >
      <TitleBarLeft
        projectName={projectName}
        sidebarMode={sidebarMode}
        onCycleSidebarMode={onCycleSidebarMode}
      />
      <ChatOnlyHeaderControls />
      {/* Drag spacer: carries the window-drag region between the chips and the
          right-side cluster. Using a dedicated div keeps pointer events on the
          buttons fully functional — portaled popovers are never inside this div. */}
      <div className="flex-1" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      <TitleBarRight />
    </header>
  );
}
