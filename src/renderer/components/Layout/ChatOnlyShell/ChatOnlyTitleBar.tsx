/**
 * ChatOnlyTitleBar — Minimal title bar for chat-only shell (Wave 43).
 *
 * Phase C changes: removed ChatModeBadge, removed "Exit chat mode" button
 * (moved to View menu only), removed border-b divider. Model + permission
 * chips are now mounted inline via ChatOnlyHeaderControls.
 *
 * No File/Edit/View dropdowns — immersive chat shell is minimal by design.
 * Window controls are inline to avoid duplicating TitleBar.tsx's logic.
 */

import React, { useEffect, useState } from 'react';

import { useProject } from '../../../contexts/ProjectContext';
import { ChatOnlyHeaderControls } from './ChatOnlyHeaderControls';

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

// ── TitleBarLeft ──────────────────────────────────────────────────────────────

function TitleBarLeft({ projectName, onToggleDrawer }: { projectName: string; onToggleDrawer: () => void }): React.ReactElement {
  return (
    <>
      <button
        className="flex items-center justify-center w-8 h-8 rounded text-text-semantic-muted hover:text-text-semantic-primary hover:bg-surface-hover transition-colors shrink-0"
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
    </>
  );
}

// ── TitleBarRight ─────────────────────────────────────────────────────────────

function TitleBarRight(): React.ReactElement {
  return <WindowControls />;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ChatOnlyTitleBarProps {
  onToggleDrawer: () => void;
}

// ── ChatOnlyTitleBar ──────────────────────────────────────────────────────────

export function ChatOnlyTitleBar({ onToggleDrawer }: ChatOnlyTitleBarProps): React.ReactElement {
  const { projectName } = useProject();
  return (
    <header
      className="flex items-center h-9 px-2 gap-2 bg-surface-chat text-text-semantic-primary select-none shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      data-testid="chat-only-title-bar"
    >
      <TitleBarLeft projectName={projectName} onToggleDrawer={onToggleDrawer} />
      <ChatOnlyHeaderControls />
      <div className="flex-1" />
      <TitleBarRight />
    </header>
  );
}
