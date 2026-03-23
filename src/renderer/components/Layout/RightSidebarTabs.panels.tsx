/**
 * RightSidebarTabs panel sub-components — ViewSwitcherDropdown, SecondaryViewHeader, RecentThreadTabs.
 * Extracted to keep RightSidebarTabs.tsx under 300 lines.
 */

import React, { useEffect, useRef } from 'react';

import type { AgentChatThreadRecord } from '../../types/electron';
import type { RightSidebarView } from './RightSidebarTabs';
import {
  AnalyticsIcon, BackArrowIcon, GitIcon, MemoryIcon, MonitorIcon,
} from './RightSidebarTabs.icons';

// ── ViewSwitcherDropdown ──────────────────────────────────────────────────────

const SECONDARY_VIEWS: Array<{ id: RightSidebarView; label: string; Icon: () => React.ReactElement }> = [
  { id: 'monitor', label: 'Monitor', Icon: MonitorIcon },
  { id: 'git', label: 'Git Status', Icon: GitIcon },
  { id: 'analytics', label: 'Analytics', Icon: AnalyticsIcon },
  { id: 'memory', label: 'Memory', Icon: MemoryIcon },
];

function ViewSwitcherItem({ id, label, Icon, isActive, onSwitchView, onClose }: {
  id: RightSidebarView; label: string; Icon: () => React.ReactElement;
  isActive: boolean; onSwitchView: (view: RightSidebarView) => void; onClose: () => void;
}): React.ReactElement {
  return (
    <button key={id} onClick={() => { onSwitchView(id); onClose(); }}
      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors duration-75 text-text-semantic-primary"
      style={{
        color: isActive ? 'var(--interactive-accent)' : undefined,
        backgroundColor: isActive ? 'color-mix(in srgb, var(--interactive-accent) 8%, transparent)' : 'transparent',
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--surface-raised)'; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <Icon /><span>{label}</span>
    </button>
  );
}

export function ViewSwitcherDropdown({ activeView, onSwitchView, onClose }: {
  activeView: RightSidebarView; onSwitchView: (view: RightSidebarView) => void; onClose: () => void;
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleEscape(e: KeyboardEvent): void { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="absolute right-1 z-50 bg-surface-overlay border border-border-semantic backdrop-blur-xl"
      style={{ top: '100%', marginTop: 2, borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', minWidth: 150, padding: '4px 0' }}>
      {SECONDARY_VIEWS.map(({ id, label, Icon }) => (
        <ViewSwitcherItem key={id} id={id} label={label} Icon={Icon}
          isActive={activeView === id} onSwitchView={onSwitchView} onClose={onClose} />
      ))}
      <div className="my-1 border-t border-border-semantic" />
      {activeView !== 'chat' && (
        <button onClick={() => { onSwitchView('chat'); onClose(); }}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors duration-75 text-interactive-accent"
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-raised)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
          <BackArrowIcon /><span>Back to Chat</span>
        </button>
      )}
    </div>
  );
}

// ── SecondaryViewHeader ───────────────────────────────────────────────────────

export function SecondaryViewHeader({ label, onBackToChat }: { label: string; onBackToChat: () => void }): React.ReactElement {
  return (
    <div className="flex-shrink-0 flex items-center h-8 border-b bg-surface-panel pl-2"
      style={{ borderColor: 'var(--border-muted, var(--border))' }}>
      <button onClick={onBackToChat} className="flex items-center gap-1 px-1.5 text-xs transition-colors duration-100 text-text-semantic-muted"
        title="Back to Chat"
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--interactive-accent)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}>
        <BackArrowIcon /><span>Chat</span>
      </button>
      <span className="mx-1 text-[10px] text-border-semantic">|</span>
      <span className="text-xs font-semibold uppercase tracking-wider select-none text-text-semantic-muted"
        style={{ letterSpacing: '0.06em' }}>{label}</span>
      <div className="flex-1" />
    </div>
  );
}

// ── ThreadStatusIcon ──────────────────────────────────────────────────────────

export function ThreadStatusIcon({ status }: { status: string }): React.ReactElement {
  if (status === 'running' || status === 'submitting' || status === 'verifying') {
    return (
      <svg className="h-2.5 w-2.5 animate-spin shrink-0 text-interactive-accent" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === 'complete') {
    return (
      <svg className="h-2.5 w-2.5 shrink-0 text-status-success" viewBox="0 0 16 16" fill="none">
        <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === 'failed') {
    return (
      <svg className="h-2.5 w-2.5 shrink-0 text-status-error" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  return <span className="block h-1.5 w-1.5 rounded-full shrink-0 bg-text-semantic-muted" />;
}

// ── RecentThreadTabs ──────────────────────────────────────────────────────────

const MAX_RECENT_TABS = 5;

function TabCloseButton({ onClick }: { onClick: (e: React.MouseEvent) => void }): React.ReactElement {
  return (
    <span role="button" tabIndex={-1} aria-label="Close tab" onClick={onClick}
      className="shrink-0 rounded opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity duration-100"
      style={{ padding: '0 1px', lineHeight: 1 }}>
      <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M2 2l6 6M8 2l-6 6" />
      </svg>
    </span>
  );
}

function DraftTab({ draftId, isActive, onSelect, onClose }: {
  draftId: string; isActive: boolean;
  onSelect: (id: string) => void; onClose: (id: string) => void;
}): React.ReactElement {
  return (
    <button onClick={() => onSelect(draftId)}
      className={`group flex items-center gap-1 shrink-0 px-2 py-1 text-[10px] transition-colors duration-100 relative ${isActive ? 'text-interactive-accent' : 'text-text-semantic-muted'}`}
      style={{ backgroundColor: isActive ? 'color-mix(in srgb, var(--interactive-accent) 10%, transparent)' : 'transparent', borderRadius: '4px 4px 0 0' }}
      title="New Chat"
      onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.backgroundColor = 'var(--surface-raised)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
      onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = ''; } }}
    >
      <span className="truncate max-w-[90px]">New Chat</span>
      <TabCloseButton onClick={(e) => { e.stopPropagation(); onClose(draftId); }} />
      {isActive && <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full bg-interactive-accent" />}
    </button>
  );
}

function ThreadTab({ thread, isActive, onSelect, onClose }: {
  thread: AgentChatThreadRecord; isActive: boolean;
  onSelect: (id: string) => void; onClose: (id: string) => void;
}): React.ReactElement {
  return (
    <button onClick={() => onSelect(thread.id)}
      className="group flex items-center gap-1 shrink-0 px-2 py-1 text-[10px] transition-colors duration-100 relative text-text-semantic-muted"
      style={{ color: isActive ? 'var(--interactive-accent)' : undefined, backgroundColor: isActive ? 'color-mix(in srgb, var(--interactive-accent) 10%, transparent)' : 'transparent', borderRadius: '4px 4px 0 0' }}
      title={thread.title || 'Chat'}
      onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.backgroundColor = 'var(--surface-raised)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
      onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = ''; } }}
    >
      <ThreadStatusIcon status={thread.status} />
      <span className="truncate max-w-[90px]">{thread.title || 'Chat'}</span>
      <TabCloseButton onClick={(e) => { e.stopPropagation(); onClose(thread.id); }} />
      {isActive && <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full bg-interactive-accent" />}
    </button>
  );
}

export function RecentThreadTabs({ threads, activeThreadId, onSelect, onClose, draftTabs }: {
  threads: AgentChatThreadRecord[]; activeThreadId: string | null;
  onSelect: (id: string | null) => void; onClose: (id: string) => void; draftTabs?: string[];
}): React.ReactElement | null {
  const recentThreads = [...threads].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_RECENT_TABS);
  const drafts = draftTabs ?? [];
  if (recentThreads.length === 0 && drafts.length === 0) return null;
  return (
    <div className="flex-shrink-0 flex items-center gap-0.5 px-1 overflow-x-auto border-b bg-surface-panel"
      style={{ borderColor: 'var(--border-muted, var(--border))', scrollbarWidth: 'none' }}>
      {drafts.map((draftId) => (
        <DraftTab key={draftId} draftId={draftId} isActive={activeThreadId === draftId}
          onSelect={onSelect} onClose={onClose} />
      ))}
      {recentThreads.map((thread) => (
        <ThreadTab key={thread.id} thread={thread} isActive={thread.id === activeThreadId}
          onSelect={onSelect} onClose={onClose} />
      ))}
    </div>
  );
}
