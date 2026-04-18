/**
 * ChatHistoryPanelParts.tsx — Sub-components for ChatHistoryPanel.
 * Extracted to keep ChatHistoryPanel.tsx under the 300-line limit.
 */
import React from 'react';

import type { AgentChatThreadRecord } from '../../types/electron';

/* ---------- Status utilities ---------- */

export function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return weeks < 5 ? `${weeks}w ago` : `${Math.floor(days / 30)}mo ago`;
}

export type StatusDisplay = {
  color: string;
  pulse: boolean;
  label: string;
  icon: 'spinner' | 'check' | 'warning' | 'error' | 'idle';
};

export function getStatusDisplay(status: string): StatusDisplay {
  switch (status) {
    case 'running':
      return { color: 'var(--interactive-accent)', pulse: true, label: 'Running', icon: 'spinner' };
    case 'submitting':
      return {
        color: 'var(--interactive-accent)',
        pulse: true,
        label: 'Starting',
        icon: 'spinner',
      };
    case 'verifying':
      return { color: 'var(--status-warning)', pulse: true, label: 'Verifying', icon: 'spinner' };
    case 'needs_review':
      return {
        color: 'var(--status-warning)',
        pulse: false,
        label: 'Needs review',
        icon: 'warning',
      };
    case 'complete':
      return { color: 'var(--status-success)', pulse: false, label: 'Complete', icon: 'check' };
    case 'failed':
      return { color: 'var(--status-error)', pulse: false, label: 'Failed', icon: 'error' };
    case 'cancelled':
      return { color: 'var(--text-muted)', pulse: false, label: 'Cancelled', icon: 'idle' };
    default:
      return { color: 'var(--text-muted)', pulse: false, label: '', icon: 'idle' };
  }
}

function SpinnerSvg({ color }: { color: string }): React.ReactElement {
  return (
    <svg
      className="h-3 w-3 animate-spin shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      style={{ color }}
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

function CheckSvg({ color }: { color: string }): React.ReactElement {
  return (
    <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" style={{ color }}>
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

function WarningSvg({ color }: { color: string }): React.ReactElement {
  return (
    <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" style={{ color }}>
      <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 6v3M8 11h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function ErrorSvg({ color }: { color: string }): React.ReactElement {
  return (
    <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" style={{ color }}>
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

export function StatusIcon({ display }: { display: StatusDisplay }): React.ReactElement {
  if (display.icon === 'spinner') return <SpinnerSvg color={display.color} />;
  if (display.icon === 'check') return <CheckSvg color={display.color} />;
  if (display.icon === 'warning') return <WarningSvg color={display.color} />;
  if (display.icon === 'error') return <ErrorSvg color={display.color} />;
  return (
    <span
      className="flex-shrink-0 h-2 w-2 rounded-full"
      style={{ backgroundColor: display.color }}
    />
  );
}

export function classifyThread(thread: AgentChatThreadRecord): 'active' | 'recent' | 'older' {
  if (
    thread.status === 'running' ||
    thread.status === 'submitting' ||
    thread.status === 'verifying' ||
    thread.status === 'needs_review'
  )
    return 'active';
  return (Date.now() - thread.updatedAt) / (1000 * 60 * 60) < 24 ? 'recent' : 'older';
}

export const SECTION_LABELS: Record<'active' | 'recent' | 'older', string> = {
  active: 'Active',
  recent: 'Today',
  older: 'Earlier',
};

/* ---------- Icons ---------- */

export function BranchIcon(): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

/* ---------- ThreadItem ---------- */

type ThreadItemBodyProps = {
  thread: AgentChatThreadRecord;
  isActive: boolean;
  display: StatusDisplay;
};

function ThreadItemBody({ thread, isActive, display }: ThreadItemBodyProps): React.ReactElement {
  const msgCount = thread.messages?.length ?? 0;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        {thread.branchInfo && (
          <span
            className="flex-shrink-0"
            style={{ color: 'var(--interactive-accent)', opacity: 0.7 }}
          >
            <BranchIcon />
          </span>
        )}
        <span
          className={`truncate text-xs font-medium ${isActive ? 'text-interactive-accent' : 'text-text-semantic-primary'}`}
        >
          {thread.title || 'New Chat'}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        {display.label && (
          <span className="text-[10px] font-medium" style={{ color: display.color }}>
            {display.label}
          </span>
        )}
        <span className="text-[10px] text-text-semantic-muted">
          {relativeTime(thread.updatedAt)}
        </span>
        <span className="text-[10px] text-text-semantic-muted">
          {msgCount} {msgCount === 1 ? 'msg' : 'msgs'}
        </span>
      </div>
    </div>
  );
}

function ThreadDeleteButton({ onDelete }: { onDelete: () => void }): React.ReactElement {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[10px] text-text-semantic-muted opacity-0 transition-opacity duration-75 group-hover:opacity-70 hover:!opacity-100" // touch-target-ok — hover-revealed; Phase E (useTapToReveal) will handle mobile tap pattern
      title="Delete conversation"
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <path d="M2 2l6 6M8 2l-6 6" />
      </svg>
    </button>
  );
}

export function ThreadItem({
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
  return (
    <div
      className={`group flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors duration-75 ${!isActive ? 'hover:bg-surface-raised' : ''}`}
      style={{
        backgroundColor: isActive
          ? 'color-mix(in srgb, var(--interactive-accent) 10%, transparent)'
          : undefined,
        minHeight: 40,
      }}
      onClick={onSelect}
    >
      <StatusIcon display={display} />
      <ThreadItemBody thread={thread} isActive={isActive} display={display} />
      <ThreadDeleteButton onDelete={onDelete} />
    </div>
  );
}

/* ---------- ThreadSectionView ---------- */

export function ThreadSectionView({
  section,
  items,
  filteredCount,
  activeThreadId,
  onSelect,
  onDelete,
}: {
  section: 'active' | 'recent' | 'older';
  items: AgentChatThreadRecord[];
  filteredCount: number;
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
  onDelete: (threadId: string) => void;
}): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <div>
      {filteredCount > items.length && (
        <div
          className={`px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide ${section === 'active' ? 'text-interactive-accent' : 'text-text-semantic-muted'}`}
        >
          {SECTION_LABELS[section]}
          {section === 'active' && (
            <span className="ml-1 font-normal normal-case">({items.length})</span>
          )}
        </div>
      )}
      {items.map((thread) => (
        <ThreadItem
          key={thread.id}
          thread={thread}
          isActive={thread.id === activeThreadId}
          onSelect={() => onSelect(thread.id)}
          onDelete={() => onDelete(thread.id)}
        />
      ))}
    </div>
  );
}
