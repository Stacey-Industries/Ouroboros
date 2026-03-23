/**
 * ChatPanelHeader — the header bar for the Chat view in RightSidebarTabs.
 * Extracted to keep RightSidebarTabs.tsx under 300 lines.
 */

import React from 'react';

import type { AgentChatThreadRecord } from '../../types/electron';
import type { RightSidebarView } from './RightSidebarTabs';
import { GearIcon, HistoryIcon, PlusIcon } from './RightSidebarTabs.icons';
import { ViewSwitcherDropdown } from './RightSidebarTabs.panels';

// ── Thread status badge ───────────────────────────────────────────────────────

function ThreadStatusBadge({ status }: { status: string }): React.ReactElement | null {
  if (status === 'running' || status === 'submitting') {
    return (
      <svg className="h-3 w-3 animate-spin shrink-0 text-interactive-accent" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === 'complete') {
    return (
      <svg className="h-3 w-3 shrink-0 text-status-success" viewBox="0 0 16 16" fill="none">
        <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === 'failed') {
    return (
      <svg className="h-3 w-3 shrink-0 text-status-error" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

// ── History toggle button ─────────────────────────────────────────────────────

function HistoryToggleButton({ historyOpen, threadCount, onToggle }: {
  historyOpen: boolean; threadCount: number; onToggle: () => void;
}): React.ReactElement {
  return (
    <button data-history-toggle onClick={onToggle}
      className="flex items-center gap-1 px-1.5 py-1 rounded transition-colors duration-100 text-text-semantic-muted"
      style={{ color: historyOpen ? 'var(--interactive-accent)' : undefined, backgroundColor: historyOpen ? 'color-mix(in srgb, var(--interactive-accent) 10%, transparent)' : 'transparent' }}
      title={`Chat History (${threadCount} conversations)`}
      onMouseEnter={(e) => { if (!historyOpen) { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.backgroundColor = 'var(--surface-raised)'; } }}
      onMouseLeave={(e) => { if (!historyOpen) { e.currentTarget.style.color = ''; e.currentTarget.style.backgroundColor = 'transparent'; } }}
    >
      <HistoryIcon />
      {threadCount > 0 && <span className="text-[10px]">{threadCount}</span>}
    </button>
  );
}

// ── Thread title display ──────────────────────────────────────────────────────

function ThreadTitle({ activeThread }: { activeThread: AgentChatThreadRecord | null }): React.ReactElement {
  return (
    <span className="flex-1 flex items-center justify-center gap-1.5 truncate text-[11px] px-1.5 select-none text-text-semantic-muted"
      title={activeThread?.title ?? 'New Chat'}>
      {activeThread && <ThreadStatusBadge status={activeThread.status} />}
      <span className="truncate">{activeThread?.title ?? 'New Chat'}</span>
    </span>
  );
}

// ── View switcher button ──────────────────────────────────────────────────────

function ViewSwitcherButton({ viewDropdownOpen, onToggle }: { viewDropdownOpen: boolean; onToggle: () => void }): React.ReactElement {
  return (
    <button onClick={onToggle}
      className="flex-shrink-0 flex items-center justify-center w-7 h-full transition-colors duration-100 text-text-semantic-muted"
      style={{ color: viewDropdownOpen ? 'var(--interactive-accent)' : undefined }}
      title="Switch view"
      onMouseEnter={(e) => { if (!viewDropdownOpen) e.currentTarget.style.color = 'var(--text-primary)'; }}
      onMouseLeave={(e) => { if (!viewDropdownOpen) e.currentTarget.style.color = ''; }}
    >
      <GearIcon />
    </button>
  );
}

// ── ChatPanelHeader ───────────────────────────────────────────────────────────

export function ChatPanelHeader({ activeThread, threadCount, historyOpen, onToggleHistory, onNewChat, viewDropdownOpen, onToggleViewDropdown, activeView, onSwitchView }: {
  activeThread: AgentChatThreadRecord | null; threadCount: number;
  historyOpen: boolean; onToggleHistory: () => void; onNewChat: () => void;
  viewDropdownOpen: boolean; onToggleViewDropdown: () => void;
  activeView: RightSidebarView; onSwitchView: (view: RightSidebarView) => void;
}): React.ReactElement {
  return (
    <div className="flex-shrink-0 flex items-center h-8 border-b relative bg-surface-panel pl-2"
      style={{ borderColor: 'var(--border-muted, var(--border))' }}>
      <HistoryToggleButton historyOpen={historyOpen} threadCount={threadCount} onToggle={onToggleHistory} />
      <ThreadTitle activeThread={activeThread} />
      <button onClick={onNewChat}
        className="flex items-center gap-1 px-1.5 py-1 mr-0.5 rounded text-[11px] transition-colors duration-100 text-interactive-accent"
        style={{ backgroundColor: 'color-mix(in srgb, var(--interactive-accent) 8%, transparent)' }}
        title="New Chat (Ctrl+L)"
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--interactive-accent) 18%, transparent)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--interactive-accent) 8%, transparent)'; }}>
        <PlusIcon />
      </button>
      <ViewSwitcherButton viewDropdownOpen={viewDropdownOpen} onToggle={onToggleViewDropdown} />
      {viewDropdownOpen && <ViewSwitcherDropdown activeView={activeView} onSwitchView={onSwitchView} onClose={onToggleViewDropdown} />}
    </div>
  );
}
