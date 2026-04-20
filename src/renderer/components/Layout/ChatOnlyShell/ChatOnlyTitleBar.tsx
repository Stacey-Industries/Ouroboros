/**
 * ChatOnlyTitleBar — Minimal title bar for chat-only shell (Wave 42).
 *
 * Provides: drag region, project name, "Chat Mode" badge, session-drawer
 * toggle, "Exit chat mode" button, and platform-specific window controls.
 *
 * No File/Edit/View dropdowns — immersive chat shell is minimal by design.
 * Window controls are inline to avoid duplicating TitleBar.tsx's logic.
 */

import React, { useEffect, useState } from 'react';

import { useProject } from '../../../contexts/ProjectContext';
import { TOGGLE_IMMERSIVE_CHAT_EVENT } from '../../../hooks/appEventNames';

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

// ── DrawerToggleIcon ──────────────────────────────────────────────────────────

function DrawerToggleIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <line x1="5.5" y1="2.5" x2="5.5" y2="13.5" />
    </svg>
  );
}

// ── ChatModeBadge ─────────────────────────────────────────────────────────────

function ChatModeBadge(): React.ReactElement {
  return (
    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-interactive-accent-subtle text-text-semantic-primary border border-border-accent select-none">
      Chat Mode
    </span>
  );
}

// ── TitleBarLeft ──────────────────────────────────────────────────────────────

function TitleBarLeft({ projectName, onToggleDrawer }: { projectName: string; onToggleDrawer: () => void }): React.ReactElement {
  return (
    <>
      <button
        className="flex items-center justify-center w-7 h-7 rounded text-text-semantic-muted hover:text-text-semantic-primary hover:bg-surface-hover transition-colors shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onClick={onToggleDrawer}
        title="Toggle session drawer"
        aria-label="Toggle session drawer"
      >
        <DrawerToggleIcon />
      </button>
      {projectName && (
        <span className="text-sm font-medium text-text-semantic-primary truncate max-w-[160px]">
          {projectName}
        </span>
      )}
      <ChatModeBadge />
    </>
  );
}

// ── TitleBarRight ─────────────────────────────────────────────────────────────

function TitleBarRight({ onExitChatMode }: { onExitChatMode: () => void }): React.ReactElement {
  return (
    <>
      <button
        className="flex items-center gap-1 px-2 py-1 text-xs rounded text-text-semantic-muted hover:text-text-semantic-primary hover:bg-surface-hover transition-colors shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onClick={onExitChatMode}
        title="Exit chat mode (Ctrl+Alt+I)"
        aria-label="Exit chat mode"
      >
        Exit chat mode
      </button>
      <WindowControls />
    </>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ChatOnlyTitleBarProps {
  onToggleDrawer: () => void;
}

// ── ChatOnlyTitleBar ──────────────────────────────────────────────────────────

export function ChatOnlyTitleBar({ onToggleDrawer }: ChatOnlyTitleBarProps): React.ReactElement {
  const { projectName } = useProject();
  const handleExitChatMode = (): void => {
    window.dispatchEvent(new CustomEvent(TOGGLE_IMMERSIVE_CHAT_EVENT));
  };
  return (
    <header
      className="flex items-center h-9 px-2 gap-2 border-b border-border-semantic bg-surface-panel text-text-semantic-primary select-none shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      data-testid="chat-only-title-bar"
    >
      <TitleBarLeft projectName={projectName} onToggleDrawer={onToggleDrawer} />
      <div className="flex-1" />
      <TitleBarRight onExitChatMode={handleExitChatMode} />
    </header>
  );
}
