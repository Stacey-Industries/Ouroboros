/**
 * RightSidebarTabs thread-tab sub-components — ThreadStatusIcon, DraftTab, ThreadTab, RecentThreadTabs.
 * Extracted from RightSidebarTabs.panels.tsx to keep both files under 300 lines.
 */

import React from 'react';

import type { AgentChatThreadRecord } from '../../types/electron';

// ── ThreadStatusIcon ──────────────────────────────────────────────────────────

function SpinningIcon(): React.ReactElement {
  return (
    <svg
      className="h-2.5 w-2.5 animate-spin shrink-0 text-interactive-accent"
      viewBox="0 0 16 16"
      fill="none"
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="32"
        strokeDashoffset="8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckmarkIcon(): React.ReactElement {
  return (
    <svg className="h-2.5 w-2.5 shrink-0 text-status-success" viewBox="0 0 16 16" fill="none">
      <path
        d="M3.5 8.5L6.5 11.5L12.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ErrorXIcon(): React.ReactElement {
  return (
    <svg className="h-2.5 w-2.5 shrink-0 text-status-error" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M5.5 5.5l5 5M10.5 5.5l-5 5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ThreadStatusIcon({ status }: { status: string }): React.ReactElement {
  if (status === 'running' || status === 'submitting' || status === 'verifying')
    return <SpinningIcon />;
  if (status === 'complete') return <CheckmarkIcon />;
  if (status === 'failed') return <ErrorXIcon />;
  return <span className="block h-1.5 w-1.5 rounded-full shrink-0 bg-text-semantic-muted" />;
}

// ── RecentThreadTabs ──────────────────────────────────────────────────────────

const MAX_RECENT_TABS = 5;

function TabCloseButton({
  onClick,
}: {
  onClick: (e: React.MouseEvent) => void;
}): React.ReactElement {
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label="Close tab"
      onClick={onClick}
      className="shrink-0 rounded opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity duration-100"
      style={{ padding: '0 1px', lineHeight: 1 }}
    >
      <svg
        className="h-2.5 w-2.5"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <path d="M2 2l6 6M8 2l-6 6" />
      </svg>
    </span>
  );
}

function tabButtonStyle(isActive: boolean): React.CSSProperties {
  return {
    color: isActive ? 'var(--interactive-accent)' : undefined,
    backgroundColor: isActive
      ? 'color-mix(in srgb, var(--interactive-accent) 10%, transparent)'
      : 'transparent',
    borderRadius: '4px 4px 0 0',
  };
}

function useTabHover(isActive: boolean) {
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!isActive) {
        e.currentTarget.style.backgroundColor = 'var(--surface-raised)';
        e.currentTarget.style.color = 'var(--text-primary)';
      }
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!isActive) {
        e.currentTarget.style.backgroundColor = 'transparent';
        e.currentTarget.style.color = '';
      }
    },
  };
}

function ActiveTabIndicator(): React.ReactElement {
  return (
    <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full bg-interactive-accent" />
  );
}

function DraftTab({
  draftId,
  isActive,
  onSelect,
  onClose,
}: {
  draftId: string;
  isActive: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}): React.ReactElement {
  const hoverHandlers = useTabHover(isActive);
  return (
    <button
      onClick={() => onSelect(draftId)}
      className={`group flex items-center gap-1 shrink-0 px-2 py-1 text-[10px] transition-colors duration-100 relative ${isActive ? 'text-interactive-accent' : 'text-text-semantic-muted'}`}
      style={tabButtonStyle(isActive)}
      title="New Chat"
      {...hoverHandlers}
    >
      <span className="truncate max-w-[90px]">New Chat</span>
      <TabCloseButton
        onClick={(e) => {
          e.stopPropagation();
          onClose(draftId);
        }}
      />
      {isActive && <ActiveTabIndicator />}
    </button>
  );
}

function ThreadTab({
  thread,
  isActive,
  onSelect,
  onClose,
}: {
  thread: AgentChatThreadRecord;
  isActive: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}): React.ReactElement {
  const hoverHandlers = useTabHover(isActive);
  return (
    <button
      onClick={() => onSelect(thread.id)}
      className="group flex items-center gap-1 shrink-0 px-2 py-1 text-[10px] transition-colors duration-100 relative text-text-semantic-muted"
      style={tabButtonStyle(isActive)}
      title={thread.title || 'Chat'}
      {...hoverHandlers}
    >
      <ThreadStatusIcon status={thread.status} />
      <span className="truncate max-w-[90px]">{thread.title || 'Chat'}</span>
      <TabCloseButton
        onClick={(e) => {
          e.stopPropagation();
          onClose(thread.id);
        }}
      />
      {isActive && <ActiveTabIndicator />}
    </button>
  );
}

function sortRecentThreads(threads: AgentChatThreadRecord[]): AgentChatThreadRecord[] {
  return [...threads].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_RECENT_TABS);
}

export function RecentThreadTabs({
  threads,
  activeThreadId,
  onSelect,
  onClose,
  draftTabs,
}: {
  threads: AgentChatThreadRecord[];
  activeThreadId: string | null;
  onSelect: (id: string | null) => void;
  onClose: (id: string) => void;
  draftTabs?: string[];
}): React.ReactElement | null {
  const recentThreads = sortRecentThreads(threads);
  const drafts = draftTabs ?? [];
  if (recentThreads.length === 0 && drafts.length === 0) return null;
  return (
    <div
      className="flex-shrink-0 flex items-center gap-0.5 px-1 overflow-x-auto border-b bg-surface-panel"
      style={{ borderColor: 'var(--border-subtle, var(--border-default))', scrollbarWidth: 'none' }}
    >
      {drafts.map((draftId) => (
        <DraftTab
          key={draftId}
          draftId={draftId}
          isActive={activeThreadId === draftId}
          onSelect={onSelect}
          onClose={onClose}
        />
      ))}
      {recentThreads.map((thread) => (
        <ThreadTab
          key={thread.id}
          thread={thread}
          isActive={thread.id === activeThreadId}
          onSelect={onSelect}
          onClose={onClose}
        />
      ))}
    </div>
  );
}
