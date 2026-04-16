/**
 * AgentChatTabBarParts.tsx — Sub-components for AgentChatTabBar.
 * Extracted to keep AgentChatTabBar.tsx under the 300-line limit.
 * Overflow exports live in AgentChatTabBarParts.extra.tsx.
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import type { AgentChatThreadRecord } from '../../types/electron';
import type { LinkedSession } from './AgentChatTabBarHooks';
export { resolveLinkedProvider, useLinkedSessionId } from './AgentChatTabBarHooks';
export type { LinkedSession };
export { BranchTreeButton } from './AgentChatBranchTreeButton';
export { OpenInTerminalButton, resolveRootThread } from './AgentChatTabBarParts.extra';

// ── Tab sub-components (used by AgentChatTabBar) ──────────────────────────────

export function TabCloseButton({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <span
      role="button"
      tabIndex={-1}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[9px] leading-none opacity-0 text-text-semantic-muted transition-opacity duration-75 group-hover:opacity-60 hover:!opacity-100"
    >
      &times;
    </span>
  );
}

export type TabProps = {
  branchMessageIndex?: number;
  branchParentTitle?: string;
  isActive: boolean;
  isBranch: boolean;
  onClose: () => void;
  onRename?: () => void;
  onSelect: () => void;
  title: string;
};

function BranchMenuButton({ onRename }: { onRename: () => void }): React.ReactElement {
  return (
    <span
      role="button"
      tabIndex={-1}
      onClick={(e) => { e.stopPropagation(); onRename(); }}
      className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[9px] leading-none opacity-0 text-text-semantic-muted transition-opacity duration-75 group-hover:opacity-60 hover:!opacity-100"
      title="Rename branch"
    >
      &hellip;
    </span>
  );
}

export function Tab(props: TabProps): React.ReactElement {
  return (
    <button
      onClick={props.onSelect}
      className={`group relative flex shrink-0 items-center gap-1 rounded-t px-2.5 py-1 text-[11px] transition-colors duration-100 ${props.isActive ? 'bg-surface-base text-text-semantic-primary' : 'text-text-semantic-muted'}`}
      style={{ borderBottom: props.isActive ? '2px solid var(--interactive-accent)' : '2px solid transparent' }}
    >
      {props.isBranch && (
        <BranchTabIcon parentTitle={props.branchParentTitle ?? ''} messageIndex={props.branchMessageIndex ?? 0} />
      )}
      <span className="max-w-[120px] truncate">{props.title}</span>
      {props.isBranch && props.onRename && <BranchMenuButton onRename={props.onRename} />}
      <TabCloseButton onClose={props.onClose} />
    </button>
  );
}

export function useScrollActiveThreadIntoView(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  activeThreadId: string | null,
): void {
  useEffect(() => {
    if (!scrollRef.current || !activeThreadId) return;
    const activeTab = scrollRef.current.querySelector(`[data-thread-id="${activeThreadId}"]`);
    if (activeTab) activeTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeThreadId, scrollRef]);
}

export const THREAD_DROPDOWN_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: 0,
  maxHeight: 300,
  overflowX: 'hidden',
  overflowY: 'auto',
  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
  zIndex: 9999,
  padding: '4px 0',
  backgroundColor: 'var(--surface-base)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 10,
};

export function BranchTabIcon({
  parentTitle,
  messageIndex,
}: {
  parentTitle: string;
  messageIndex: number;
}): React.ReactElement {
  return (
    <span
      className="shrink-0 text-interactive-accent"
      title={`Branched from "${parentTitle}" at message ${messageIndex}`}
      style={{ opacity: 0.7 }}
    >
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
    </span>
  );
}

function useThreadDropdownDismiss(
  dropdownRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) onClose();
    };
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [dropdownRef, onClose]);
}

function DropdownItemDeleteButton({
  threadId,
  onDeleteThread,
}: {
  threadId: string;
  onDeleteThread: (id: string) => void;
}): React.ReactElement {
  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onDeleteThread(threadId);
      }}
      className="rounded px-1 text-[10px] text-text-semantic-muted opacity-0 transition-opacity duration-75 group-hover:opacity-70 hover:!opacity-100"
      title="Delete conversation"
    >
      &times;
    </button>
  );
}

type ThreadDropdownItemProps = {
  activeThreadId: string | null;
  onClose: () => void;
  onDeleteThread: (id: string) => void;
  onSelectThread: (id: string) => void;
  thread: AgentChatThreadRecord;
};

function ThreadDropdownItem(p: ThreadDropdownItemProps): React.ReactElement {
  const isActive = p.thread.id === p.activeThreadId;
  return (
    <div
      className="group flex cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors duration-75 hover:bg-surface-raised"
      style={{
        backgroundColor: isActive
          ? 'color-mix(in srgb, var(--interactive-accent) 8%, transparent)'
          : undefined,
      }}
      onClick={() => {
        p.onSelectThread(p.thread.id);
        p.onClose();
      }}
    >
      {p.thread.branchInfo && (
        <BranchTabIcon
          parentTitle={p.thread.branchInfo.parentTitle ?? ''}
          messageIndex={p.thread.branchInfo.fromMessageIndex ?? 0}
        />
      )}
      <span
        className={`flex-1 truncate text-xs ${isActive ? 'text-interactive-accent' : 'text-text-semantic-primary'}`}
      >
        {p.thread.title}
      </span>
      <span className="text-[10px] text-text-semantic-muted">
        {p.thread.messages?.length ?? 0} msgs
      </span>
      <DropdownItemDeleteButton threadId={p.thread.id} onDeleteThread={p.onDeleteThread} />
    </div>
  );
}

type ThreadDropdownContentProps = {
  activeThreadId: string | null;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onDeleteThread: (id: string) => void;
  onSelectThread: (id: string) => void;
  threads: AgentChatThreadRecord[];
  triggerRect: DOMRect;
};

function ThreadDropdownContent(p: ThreadDropdownContentProps): React.ReactElement {
  return (
    <div
      ref={p.dropdownRef}
      style={{
        ...THREAD_DROPDOWN_STYLE,
        top: p.triggerRect.bottom + 2,
        left: p.triggerRect.left,
        width: p.triggerRect.width,
      }}
    >
      {p.threads.length === 0 && (
        <div className="px-3 py-2 text-xs text-text-semantic-muted">No conversations</div>
      )}
      {p.threads.map((thread) => (
        <ThreadDropdownItem
          key={thread.id}
          activeThreadId={p.activeThreadId}
          onClose={p.onClose}
          onDeleteThread={p.onDeleteThread}
          onSelectThread={p.onSelectThread}
          thread={thread}
        />
      ))}
    </div>
  );
}

export function ThreadDropdown({
  activeThreadId,
  onClose,
  onDeleteThread,
  onSelectThread,
  threads,
  triggerRect,
}: {
  activeThreadId: string | null;
  onClose: () => void;
  onDeleteThread: (id: string) => void;
  onSelectThread: (id: string) => void;
  threads: AgentChatThreadRecord[];
  triggerRect: DOMRect;
}): React.ReactElement {
  const dropdownRef = useRef<HTMLDivElement>(null);
  useThreadDropdownDismiss(dropdownRef, onClose);
  return createPortal(
    <ThreadDropdownContent
      activeThreadId={activeThreadId}
      dropdownRef={dropdownRef}
      onClose={onClose}
      onDeleteThread={onDeleteThread}
      onSelectThread={onSelectThread}
      threads={threads}
      triggerRect={triggerRect}
    />,
    document.body,
  );
}

