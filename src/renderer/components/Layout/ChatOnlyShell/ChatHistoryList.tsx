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
    <div className="px-3 py-1 text-xs font-semibold text-text-semantic-muted uppercase tracking-wide select-none">
      {label}
    </div>
  );
}

// ── Pinned section ────────────────────────────────────────────────────────────

interface PinnedSectionProps {
  threads: AgentChatThreadRecord[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onRename: (thread: AgentChatThreadRecord) => void;
}

function PinnedSection({ threads, activeThreadId, onSelect, onDelete, onRename }: PinnedSectionProps): React.ReactElement | null {
  if (threads.length === 0) return null;
  return (
    <div data-testid="pinned-section">
      <GroupHeader label="Pinned" />
      {threads.map((t) => (
        <ChatHistoryRow
          key={t.id}
          thread={t}
          isActive={t.id === activeThreadId}
          onClick={onSelect}
          onDelete={onDelete}
          onRename={onRename}
        />
      ))}
    </div>
  );
}

// ── GroupList ─────────────────────────────────────────────────────────────────

interface GroupListProps {
  groups: ThreadGroup[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onRename: (t: AgentChatThreadRecord) => void;
}

function GroupList({ groups, activeThreadId, onSelect, onDelete, onRename }: GroupListProps): React.ReactElement {
  return (
    <>
      {groups.map((group) => (
        <div key={group.label} data-testid="thread-group">
          {groups.length > 1 && <GroupHeader label={group.label} />}
          {group.threads.map((t) => (
            <ChatHistoryRow key={t.id} thread={t} isActive={t.id === activeThreadId}
              onClick={onSelect} onDelete={onDelete} onRename={onRename} />
          ))}
        </div>
      ))}
    </>
  );
}

// ── ChatHistoryList ───────────────────────────────────────────────────────────

export interface ChatHistoryListProps {
  threads: AgentChatThreadRecord[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => Promise<void>;
  onRenameThread: (thread: AgentChatThreadRecord) => void;
}

export function ChatHistoryList({
  threads, activeThreadId, onSelectThread, onDeleteThread, onRenameThread,
}: ChatHistoryListProps): React.ReactElement {
  const handleDelete = useCallback((id: string): Promise<void> => onDeleteThread(id), [onDeleteThread]);

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

  return (
    <div className="flex flex-col" data-testid="chat-history-list">
      <PinnedSection threads={pinned} activeThreadId={activeThreadId}
        onSelect={onSelectThread} onDelete={handleDelete} onRename={onRenameThread} />
      <GroupList groups={groups} activeThreadId={activeThreadId}
        onSelect={onSelectThread} onDelete={handleDelete} onRename={onRenameThread} />
    </div>
  );
}
