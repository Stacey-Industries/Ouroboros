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

// ── Context menu ──────────────────────────────────────────────────────────────

interface ContextMenuState { x: number; y: number }

interface ContextMenuProps {
  thread: AgentChatThreadRecord;
  position: ContextMenuState;
  onClose: () => void;
  onDelete: () => void;
  onPin: () => void;
  onRename: () => void;
}

function ContextMenu({ thread, position, onClose, onDelete, onPin, onRename }: ContextMenuProps): React.ReactElement {
  const handlePin = useCallback((): void => {
    onPin();
    onClose();
  }, [onClose, onPin]);
  const handleDelete = useCallback((): void => { onDelete(); onClose(); }, [onDelete, onClose]);
  const handleRename = useCallback((): void => { onRename(); onClose(); }, [onRename, onClose]);
  const item = 'px-3 py-1.5 text-sm text-text-semantic-primary hover:bg-surface-hover cursor-pointer select-none';

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9000]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed z-[9001] min-w-[160px] rounded border border-border-subtle bg-surface-overlay shadow-lg py-1"
        style={{ top: position.y, left: position.x }}
        data-testid="context-menu"
      >
        <div className={item} onClick={handlePin}>{thread.pinned ? 'Unpin' : 'Pin'}</div>
        <div className={item} onClick={handleRename}>Rename</div>
        <div className="my-1 border-t border-border-subtle" />
        <div className={`${item} hover:text-status-error`} onClick={handleDelete}>Delete</div>
      </div>
    </>,
    document.body,
  );
}

// ── RowContent ────────────────────────────────────────────────────────────────

interface RowContentProps {
  title: string;
  subtitle: string;
  status: AgentChatThreadRecord['status'];
  isActive: boolean;
  threadId: string;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  rowRef: React.RefObject<HTMLDivElement | null>;
}

function RowContent({ title, subtitle, status, isActive, threadId, onClick, onContextMenu, rowRef }: RowContentProps): React.ReactElement {
  const activeClass = isActive ? 'bg-interactive-selection' : 'hover:bg-surface-hover';
  return (
    <div ref={rowRef} role="row" tabIndex={0} data-testid="chat-history-row" data-thread-id={threadId}
      className={`flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors duration-100 ${activeClass}`}
      onClick={onClick} onContextMenu={onContextMenu}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}>
      <div className="mt-1.5 shrink-0"><ChatHistoryStatusDot status={status} /></div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-sm text-text-semantic-primary truncate leading-snug">{title}</span>
        <span className="text-xs text-text-semantic-muted truncate leading-snug mt-0.5">{subtitle}</span>
      </div>
    </div>
  );
}

// ── ChatHistoryRow ────────────────────────────────────────────────────────────

export interface ChatHistoryRowProps {
  thread: AgentChatThreadRecord;
  isActive: boolean;
  onClick: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onPin: (threadId: string, pinned: boolean) => Promise<void>;
  onRename: (thread: AgentChatThreadRecord) => void;
}

export function ChatHistoryRow({ thread, isActive, onClick, onDelete, onPin, onRename }: ChatHistoryRowProps): React.ReactElement {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const userMessages = thread.messages.filter((m) => m.role === 'user');
  const title = thread.branchName ?? thread.title ?? userMessages[0]?.content?.slice(0, 60) ?? 'New chat';
  const subtitle = `${timeAgo(thread.updatedAt)} · ${userMessages.length} msg${userMessages.length !== 1 ? 's' : ''}`;

  const handleClick = useCallback(() => { onClick(thread.id); }, [onClick, thread.id]);
  const handleContextMenu = useCallback((e: React.MouseEvent): void => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }, []);
  const handleDelete = useCallback(async (): Promise<void> => { await onDelete(thread.id); }, [onDelete, thread.id]);
  const handlePin = useCallback(async (): Promise<void> => { await onPin(thread.id, !thread.pinned); }, [onPin, thread.id, thread.pinned]);
  const handleRename = useCallback((): void => { onRename(thread); }, [onRename, thread]);

  return (
    <>
      <RowContent title={title} subtitle={subtitle} status={thread.status} isActive={isActive}
        threadId={thread.id} onClick={handleClick} onContextMenu={handleContextMenu} rowRef={rowRef} />
      {menu && (
        <ContextMenu thread={thread} position={menu} onClose={() => setMenu(null)}
          onDelete={handleDelete} onPin={() => { void handlePin(); }} onRename={handleRename} />
      )}
    </>
  );
}
