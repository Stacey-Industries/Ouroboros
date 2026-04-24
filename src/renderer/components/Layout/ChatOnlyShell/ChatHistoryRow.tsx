/**
 * ChatHistoryRow — single thread row in the chat history sidebar.
 *
 * Renders: status dot + title + subtitle (time-ago + message count).
 * Right-click context menu: Pin/Unpin, Rename, Delete.
 *  - Pin: wired to window.electronAPI.agentChat.pinThread (backend at
 *    src/main/agentChat/threadStoreSqlite.ts:247).
 *  - Rename: calls onRename — opens BranchRenameDialog upstream.
 *  - Delete: wired to window.electronAPI.agentChat.deleteThread.
 *
 * Menu renders via createPortal to document.body so it escapes any
 * overflow-hidden / transformed sidebar ancestor — the earlier inline
 * `position: fixed` version got clipped when rendered inside the sidebar's
 * overflow-y-auto scroll container in some layouts.
 */

import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { AgentChatThreadRecord } from '../../../types/electron';
import { ChatHistoryStatusDot } from './ChatHistoryStatusDot';

// ── Time formatting ───────────────────────────────────────────────────────────

function timeAgo(ms: number): string {
  const diffSec = Math.floor((Date.now() - ms) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function isThreadWorking(status: AgentChatThreadRecord['status']): boolean {
  return status === 'submitting' || status === 'running' || status === 'verifying';
}

type CompletionIndicatorState = 'none' | 'unseen' | 'seen';

function UnseenIndicator(): React.ReactElement {
  return (
    <span title="Finished and not viewed yet" aria-label="Finished and not viewed yet" data-testid="chat-history-completion-unseen"
      className="h-2.5 w-2.5 rounded-full shrink-0"
      style={{ backgroundColor: 'var(--interactive-accent)', boxShadow: '0 0 0 1px var(--surface-panel)' }}
    />
  );
}

function SeenIndicator(): React.ReactElement {
  return (
    <span title="Finished and viewed" aria-label="Finished and viewed" data-testid="chat-history-completion-seen"
      className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: 'var(--interactive-accent-subtle, rgba(59,130,246,0.18))', color: 'var(--interactive-accent)' }}
    >
      <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 5.5L4 7.5L8 3" />
      </svg>
    </span>
  );
}

function CompletionIndicator({ state }: { state: CompletionIndicatorState }): React.ReactElement | null {
  if (state === 'none') return null;
  if (state === 'unseen') return <UnseenIndicator />;
  return <SeenIndicator />;
}

// ── Context menu ──────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
}

interface ContextMenuProps {
  thread: AgentChatThreadRecord;
  position: ContextMenuState;
  onClose: () => void;
  onDelete: () => void;
  onPin: () => void;
  onRename: () => void;
}

const MENU_ITEM_CLS = 'px-3 py-1.5 text-sm text-text-semantic-primary hover:bg-surface-hover cursor-pointer select-none';

function ContextMenuBody({ thread, position, onClose, onDelete, onPin, onRename }: ContextMenuProps): React.ReactElement {
  const close = (fn: () => void) => () => { fn(); onClose(); };
  return (
    <>
      <div className="fixed inset-0 z-[9000]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="fixed z-[9001] min-w-[160px] rounded border border-border-subtle bg-surface-overlay shadow-lg py-1" style={{ top: position.y, left: position.x }} data-testid="context-menu">
        <div className={MENU_ITEM_CLS} onClick={close(onPin)}>{thread.pinned ? 'Unpin' : 'Pin'}</div>
        <div className={MENU_ITEM_CLS} onClick={close(onRename)}>Rename</div>
        <div className="my-1 border-t border-border-subtle" />
        <div className={`${MENU_ITEM_CLS} hover:text-status-error`} onClick={close(onDelete)}>Delete</div>
      </div>
    </>
  );
}

function ContextMenu(props: ContextMenuProps): React.ReactElement {
  return createPortal(<ContextMenuBody {...props} />, document.body);
}

// ── RowContent ────────────────────────────────────────────────────────────────

interface RowContentProps {
  title: string;
  subtitle: string;
  status: AgentChatThreadRecord['status'];
  completionIndicator: CompletionIndicatorState;
  isActive: boolean;
  threadId: string;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  rowRef: React.RefObject<HTMLDivElement | null>;
}

function RowSubtitleArea({ subtitle, showSpinner, completionIndicator }: { subtitle: string; showSpinner: boolean; completionIndicator: CompletionIndicatorState }): React.ReactElement {
  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-text-semantic-muted leading-snug">
      <span className="truncate">{subtitle}</span>
      {showSpinner && (
        <span className="inline-flex shrink-0 items-center" title="Agent still working" aria-label="Agent still working" data-testid="chat-history-working-spinner">
          <span className="h-2.5 w-2.5 animate-spin rounded-full border border-interactive-accent/35 border-t-interactive-accent" />
        </span>
      )}
      {!showSpinner && <CompletionIndicator state={completionIndicator} />}
    </div>
  );
}

function RowContent({ title, subtitle, status, completionIndicator, isActive, threadId, onClick, onContextMenu, rowRef }: RowContentProps): React.ReactElement {
  const activeClass = isActive ? 'bg-interactive-selection' : 'hover:bg-surface-hover';
  return (
    <div ref={rowRef} role="row" tabIndex={0} data-testid="chat-history-row" data-thread-id={threadId}
      className={`flex cursor-pointer items-start gap-1.5 px-2.5 py-2 transition-colors duration-100 ${activeClass}`}
      onClick={onClick} onContextMenu={onContextMenu} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      <div className="mt-1.5 shrink-0"><ChatHistoryStatusDot status={status} /></div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="truncate text-[13px] text-text-semantic-primary leading-snug">{title}</span>
        <RowSubtitleArea subtitle={subtitle} showSpinner={isThreadWorking(status)} completionIndicator={completionIndicator} />
      </div>
    </div>
  );
}

// ── ChatHistoryRow ────────────────────────────────────────────────────────────

export interface ChatHistoryRowProps {
  thread: AgentChatThreadRecord;
  completionIndicator?: CompletionIndicatorState;
  isActive: boolean;
  onClick: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onPin: (threadId: string, pinned: boolean) => Promise<void>;
  onRename: (thread: AgentChatThreadRecord) => void;
}

function deriveThreadDisplay(thread: AgentChatThreadRecord): { title: string; subtitle: string } {
  const userMessages = thread.messages.filter((m) => m.role === 'user');
  const title = thread.branchName ?? thread.title ?? userMessages[0]?.content?.slice(0, 60) ?? 'New chat';
  const count = userMessages.length;
  return { title, subtitle: `${timeAgo(thread.updatedAt)} · ${count} msg${count !== 1 ? 's' : ''}` };
}

export function ChatHistoryRow({ thread, completionIndicator = 'none', isActive, onClick, onDelete, onPin, onRename }: ChatHistoryRowProps): React.ReactElement {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const { title, subtitle } = deriveThreadDisplay(thread);
  const handleClick = useCallback(() => onClick(thread.id), [onClick, thread.id]);
  const handleContextMenu = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }, []);
  const handleDelete = useCallback(async (): Promise<void> => { await onDelete(thread.id); }, [onDelete, thread.id]);
  const handlePin = useCallback(async (): Promise<void> => { await onPin(thread.id, !thread.pinned); }, [onPin, thread.id, thread.pinned]);
  const handleRename = useCallback((): void => { onRename(thread); }, [onRename, thread]);
  return (
    <>
      <RowContent title={title} subtitle={subtitle} status={thread.status} completionIndicator={completionIndicator}
        isActive={isActive} threadId={thread.id} onClick={handleClick} onContextMenu={handleContextMenu} rowRef={rowRef}
      />
      {menu && (
        <ContextMenu thread={thread} position={menu} onClose={() => setMenu(null)}
          onDelete={handleDelete} onPin={() => { void handlePin(); }} onRename={handleRename}
        />
      )}
    </>
  );
}
