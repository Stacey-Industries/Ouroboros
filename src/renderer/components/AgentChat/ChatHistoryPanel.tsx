/**
 * ChatHistoryPanel — slide-down overlay listing all chat threads.
 *
 * Appears when the user clicks "History" in the chat panel header.
 * Shows threads sorted by updatedAt DESC with search filtering,
 * relative timestamps, message counts, and status indicators.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentChatThreadRecord } from '../../types/electron';

export interface ChatHistoryPanelProps {
  threads: AgentChatThreadRecord[];
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onClose: () => void;
}

/* ── Helpers ── */

function relativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

interface StatusDisplay {
  color: string;
  pulse: boolean;
  label: string;
  icon: 'spinner' | 'check' | 'warning' | 'error' | 'idle';
}

function getStatusDisplay(status: string): StatusDisplay {
  switch (status) {
    case 'running':
      return { color: 'var(--accent)', pulse: true, label: 'Running', icon: 'spinner' };
    case 'submitting':
      return { color: 'var(--accent)', pulse: true, label: 'Starting', icon: 'spinner' };
    case 'verifying':
      return { color: '#f59e0b', pulse: true, label: 'Verifying', icon: 'spinner' };
    case 'needs_review':
      return { color: '#f59e0b', pulse: false, label: 'Needs review', icon: 'warning' };
    case 'complete':
      return { color: 'var(--success, #3fb950)', pulse: false, label: 'Complete', icon: 'check' };
    case 'failed':
      return { color: 'var(--error, #f85149)', pulse: false, label: 'Failed', icon: 'error' };
    case 'cancelled':
      return { color: 'var(--text-muted)', pulse: false, label: 'Cancelled', icon: 'idle' };
    default:
      return { color: 'var(--text-muted)', pulse: false, label: '', icon: 'idle' };
  }
}

function StatusIcon({ display }: { display: StatusDisplay }): React.ReactElement {
  switch (display.icon) {
    case 'spinner':
      return (
        <svg className="h-3 w-3 animate-spin shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: display.color }}>
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
        </svg>
      );
    case 'check':
      return (
        <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: display.color }}>
          <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'warning':
      return (
        <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: display.color }}>
          <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M8 6v3M8 11h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'error':
      return (
        <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: display.color }}>
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <span
          className="flex-shrink-0 w-2 h-2 rounded-full"
          style={{ backgroundColor: display.color }}
        />
      );
  }
}

type ThreadSection = 'active' | 'recent' | 'older';

function classifyThread(thread: AgentChatThreadRecord): ThreadSection {
  const isActive = thread.status === 'running' || thread.status === 'submitting' || thread.status === 'verifying' || thread.status === 'needs_review';
  if (isActive) return 'active';
  const hoursSinceUpdate = (Date.now() - thread.updatedAt) / (1000 * 60 * 60);
  if (hoursSinceUpdate < 24) return 'recent';
  return 'older';
}

const SECTION_LABELS: Record<ThreadSection, string> = {
  active: 'Active',
  recent: 'Today',
  older: 'Earlier',
};

/* ── Icons ── */

function SearchIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

function BranchIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

/* ── Thread Item ── */

function ThreadItem({
  thread,
  isActive,
  onSelect,
  onDelete,
}: {
  thread: AgentChatThreadRecord;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}): React.ReactElement {
  const display = getStatusDisplay(thread.status);
  const msgCount = thread.messages?.length ?? 0;

  return (
    <div
      className="group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors duration-75"
      style={{
        backgroundColor: isActive ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined,
        minHeight: 40,
      }}
      onClick={onSelect}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = '';
      }}
    >
      <StatusIcon display={display} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {thread.branchInfo && (
            <span className="flex-shrink-0" style={{ color: 'var(--accent)', opacity: 0.7 }}>
              <BranchIcon />
            </span>
          )}
          <span
            className="truncate text-xs font-medium"
            style={{ color: isActive ? 'var(--accent)' : 'var(--text)' }}
          >
            {thread.title || 'New Chat'}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {display.label && (
            <span className="text-[10px] font-medium" style={{ color: display.color }}>
              {display.label}
            </span>
          )}
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {relativeTime(thread.updatedAt)}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {msgCount} {msgCount === 1 ? 'msg' : 'msgs'}
          </span>
        </div>
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-70 hover:!opacity-100 flex-shrink-0 flex items-center justify-center w-5 h-5 rounded transition-opacity duration-75"
        style={{ color: 'var(--text-muted)' }}
        title="Delete conversation"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 2l6 6M8 2l-6 6" />
        </svg>
      </button>
    </div>
  );
}

/* ── Main Panel ── */

export function ChatHistoryPanel({
  threads,
  activeThreadId,
  onSelect,
  onDelete,
  onClose,
}: ChatHistoryPanelProps): React.ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Auto-focus search on open
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close on Escape or click-outside
  useEffect(() => {
    function handleEscape(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    function handleClickOutside(e: MouseEvent): void {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads;
    const q = searchQuery.toLowerCase();
    return threads.filter((t) => t.title.toLowerCase().includes(q));
  }, [threads, searchQuery]);

  // Group threads by section (active / recent / older)
  const sections = useMemo(() => {
    const groups: Record<ThreadSection, AgentChatThreadRecord[]> = { active: [], recent: [], older: [] };
    for (const thread of filteredThreads) {
      groups[classifyThread(thread)].push(thread);
    }
    // Sort each section by updatedAt DESC
    for (const key of Object.keys(groups) as ThreadSection[]) {
      groups[key].sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return groups;
  }, [filteredThreads]);

  const handleSelect = useCallback((threadId: string) => {
    onSelect(threadId);
    onClose();
  }, [onSelect, onClose]);

  return (
    <div
      ref={panelRef}
      className="absolute left-0 right-0 z-50 flex flex-col overflow-hidden"
      style={{
        top: 0,
        maxHeight: '60%',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border-muted, var(--border))' }}
      >
        <span style={{ color: 'var(--text-muted)' }}>
          <SearchIcon />
        </span>
        <input
          ref={searchRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search conversations..."
          className="flex-1 bg-transparent text-xs outline-none"
          style={{ color: 'var(--text)' }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="text-[10px] px-1 rounded"
            style={{ color: 'var(--text-muted)' }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Thread list grouped by section */}
      <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: 'thin' }}>
        {filteredThreads.length === 0 && (
          <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
            {searchQuery ? 'No matching conversations' : 'No conversations yet'}
          </div>
        )}
        {(['active', 'recent', 'older'] as ThreadSection[]).map((section) => {
          const items = sections[section];
          if (items.length === 0) return null;
          return (
            <div key={section}>
              {/* Only show section headers when there are multiple sections with content */}
              {filteredThreads.length > items.length && (
                <div
                  className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide"
                  style={{ color: section === 'active' ? 'var(--accent)' : 'var(--text-muted)' }}
                >
                  {SECTION_LABELS[section]}
                  {section === 'active' && (
                    <span className="ml-1 normal-case font-normal">({items.length})</span>
                  )}
                </div>
              )}
              {items.map((thread) => (
                <ThreadItem
                  key={thread.id}
                  thread={thread}
                  isActive={thread.id === activeThreadId}
                  onSelect={() => handleSelect(thread.id)}
                  onDelete={() => onDelete(thread.id)}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {threads.length > 0 && (
        <div
          className="flex items-center justify-between px-3 py-1.5 border-t flex-shrink-0"
          style={{ borderColor: 'var(--border-muted, var(--border))' }}
        >
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {threads.length} conversation{threads.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
