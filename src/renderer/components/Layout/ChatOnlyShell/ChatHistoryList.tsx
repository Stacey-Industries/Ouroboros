/**
 * ChatHistoryList — grouped thread list for the chat history sidebar (Wave 44 Phase B).
 *
 * Groups threads by projectRoot basename. Pinned threads float to the top
 * in their own section. Within each group, threads are sorted by updatedAt desc.
 *
 * Does NOT virtualise — thread counts in practice are <100 per workspace.
 * If counts exceed 200 in future, swap the render loop for a virtual list.
 */

import React, { useCallback } from 'react';

import type { AgentChatThreadRecord } from '../../../types/electron';
import { ChatHistoryRow } from './ChatHistoryRow';

// ── Grouping helpers (mirrors SessionSidebar.tsx:29) ─────────────────────────

function projectBasename(root: string): string {
  return root.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? root;
}

interface ThreadGroup {
  label: string;
  threads: AgentChatThreadRecord[];
}

function buildGroups(threads: AgentChatThreadRecord[]): ThreadGroup[] {
  const map = new Map<string, AgentChatThreadRecord[]>();
  for (const t of threads) {
    const key = t.workspaceRoot;
    const group = map.get(key) ?? [];
    group.push(t);
    map.set(key, group);
  }
  return [...map.entries()].map(([root, list]) => ({
    label: projectBasename(root),
    threads: [...list].sort((a, b) => b.updatedAt - a.updatedAt),
  }));
}

// ── Group header ──────────────────────────────────────────────────────────────

function GroupHeader({ label }: { label: string }): React.ReactElement {
  return (
    <div className="px-2.5 py-1 text-[11px] font-semibold text-text-semantic-muted uppercase tracking-wide select-none">
      {label}
    </div>
  );
}

// ── Pinned section ────────────────────────────────────────────────────────────

interface PinnedSectionProps {
  threads: AgentChatThreadRecord[];
  completionIndicators: Record<string, 'none' | 'unseen' | 'seen'>;
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onPin: (id: string, pinned: boolean) => Promise<void>;
  onRename: (thread: AgentChatThreadRecord) => void;
}

function PinnedSection({
  threads,
  completionIndicators,
  activeThreadId,
  onSelect,
  onDelete,
  onPin,
  onRename,
}: PinnedSectionProps): React.ReactElement | null {
  if (threads.length === 0) return null;
  return (
    <div data-testid="pinned-section">
      <GroupHeader label="Pinned" />
      {threads.map((t) => (
        <ChatHistoryRow
          key={t.id}
          thread={t}
          completionIndicator={completionIndicators[t.id] ?? 'none'}
          isActive={t.id === activeThreadId}
          onClick={onSelect}
          onDelete={onDelete}
          onPin={onPin}
          onRename={onRename}
        />
      ))}
    </div>
  );
}

// ── GroupList ─────────────────────────────────────────────────────────────────

interface GroupListProps {
  groups: ThreadGroup[];
  completionIndicators: Record<string, 'none' | 'unseen' | 'seen'>;
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onPin: (id: string, pinned: boolean) => Promise<void>;
  onRename: (t: AgentChatThreadRecord) => void;
}

function GroupList({
  groups,
  completionIndicators,
  activeThreadId,
  onSelect,
  onDelete,
  onPin,
  onRename,
}: GroupListProps): React.ReactElement {
  return (
    <>
      {groups.map((group) => (
        <div key={group.label} data-testid="thread-group">
          {groups.length > 1 && <GroupHeader label={group.label} />}
          {group.threads.map((t) => (
            <ChatHistoryRow
              key={t.id}
              thread={t}
              isActive={t.id === activeThreadId}
              completionIndicator={completionIndicators[t.id] ?? 'none'}
              onClick={onSelect}
              onDelete={onDelete}
              onPin={onPin}
              onRename={onRename}
            />
          ))}
        </div>
      ))}
    </>
  );
}

// ── ChatHistoryList ───────────────────────────────────────────────────────────

export interface ChatHistoryListProps {
  threads: AgentChatThreadRecord[];
  completionIndicators?: Record<string, 'none' | 'unseen' | 'seen'>;
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => Promise<void>;
  onPinThread: (id: string, pinned: boolean) => Promise<void>;
  onRenameThread: (thread: AgentChatThreadRecord) => void;
}

function useChatListHandlers(
  onDeleteThread: (id: string) => Promise<void>,
  onPinThread: (id: string, pinned: boolean) => Promise<void>,
) {
  const handleDelete = useCallback((id: string): Promise<void> => onDeleteThread(id), [onDeleteThread]);
  const handlePin = useCallback((id: string, pinned: boolean): Promise<void> => onPinThread(id, pinned), [onPinThread]);
  return { handleDelete, handlePin };
}

export function ChatHistoryList({
  threads,
  completionIndicators = {},
  activeThreadId,
  onSelectThread,
  onDeleteThread,
  onPinThread,
  onRenameThread,
}: ChatHistoryListProps): React.ReactElement {
  const { handleDelete, handlePin } = useChatListHandlers(onDeleteThread, onPinThread);
  const visible = threads.filter((t) => !t.deletedAt);
  const pinned = visible.filter((t) => t.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
  const groups = buildGroups(visible.filter((t) => !t.pinned));
  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-4 py-8 text-center">
        <p className="text-sm text-text-semantic-muted">No chats yet.</p>
        <p className="text-xs text-text-semantic-faint mt-1">Start a new chat to get going.</p>
      </div>
    );
  }
  const sharedProps = { completionIndicators, activeThreadId, onDelete: handleDelete, onPin: handlePin, onRename: onRenameThread, onSelect: onSelectThread };
  return (
    <div className="flex flex-col" data-testid="chat-history-list">
      <PinnedSection threads={pinned} {...sharedProps} />
      <GroupList groups={groups} {...sharedProps} />
    </div>
  );
}
