import { useContext, useMemo } from 'react';
import { useStore } from 'zustand';

import { AgentChatStoreContext, createAgentChatStore } from '../../AgentChat/agentChatStore';
import { useSessions } from '../../SessionSidebar/useSessions';
import type { TerminalSession } from '../../Terminal/TerminalTabs';
import type { SessionRecord, AgentChatThreadRecord } from '../../../types/electron';

const FALLBACK_CHAT_STORE = createAgentChatStore();

function projectBasename(root: string): string {
  return root.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? root;
}

function relativeTime(iso: string, now: number): string {
  const diffMs = Math.max(0, now - new Date(iso).getTime());
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function sessionStatus(session: SessionRecord): 'active' | 'archived' | 'deleted' {
  if (session.deletedAt) return 'deleted';
  if (session.archivedAt) return 'archived';
  return 'active';
}

function sortSessions(left: SessionRecord, right: SessionRecord, activeSessionId: string | null): number {
  if (left.id === activeSessionId && right.id !== activeSessionId) return -1;
  if (right.id === activeSessionId && left.id !== activeSessionId) return 1;
  if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1;
  const leftDeleted = Boolean(left.deletedAt);
  const rightDeleted = Boolean(right.deletedAt);
  if (leftDeleted !== rightDeleted) return leftDeleted ? 1 : -1;
  const leftArchived = Boolean(left.archivedAt);
  const rightArchived = Boolean(right.archivedAt);
  if (leftArchived !== rightArchived) return leftArchived ? 1 : -1;
  return new Date(right.lastUsedAt).getTime() - new Date(left.lastUsedAt).getTime();
}

export interface WorkbenchSessionItem {
  id: string;
  projectLabel: string;
  projectRoot: string;
  shortId: string;
  lastUsedLabel: string;
  status: 'active' | 'archived' | 'deleted';
  isActive: boolean;
  isPinned: boolean;
  isWorktree: boolean;
  terminalCount: number;
  chatCount: number;
  hasConversation: boolean;
  hasActiveThread: boolean;
  rawSession: SessionRecord;
}

export interface UseWorkbenchSessionsOptions {
  sessions?: SessionRecord[];
  activeSessionId?: string | null;
  isLoading?: boolean;
  refresh?: () => void;
  threads?: AgentChatThreadRecord[];
  activeThreadId?: string | null;
  terminalSessions?: TerminalSession[];
  now?: number;
}

export interface UseWorkbenchSessionsResult {
  items: WorkbenchSessionItem[];
  activeSessionId: string | null;
  isLoading: boolean;
  refresh: () => void;
}

export function useWorkbenchSessions(
  options: UseWorkbenchSessionsOptions = {},
): UseWorkbenchSessionsResult {
  const sessionsState = useSessions();
  const chatStore = useContext(AgentChatStoreContext) ?? FALLBACK_CHAT_STORE;
  const storeThreads = useStore(chatStore, (state) => state.threads);
  const storeActiveThread = useStore(chatStore, (state) => state.activeThread);

  const sessions = options.sessions ?? sessionsState.sessions;
  const activeSessionId = options.activeSessionId ?? sessionsState.activeSessionId;
  const isLoading = options.isLoading ?? sessionsState.isLoading;
  const refresh = options.refresh ?? sessionsState.refresh;
  const threads = options.threads ?? storeThreads;
  const activeThreadId = options.activeThreadId ?? storeActiveThread?.id ?? null;
  const terminalSessions = options.terminalSessions ?? [];
  const now = options.now ?? Date.now();

  const items = useMemo(() => {
    const threadCounts = new Map<string, number>();
    for (const thread of threads) {
      threadCounts.set(thread.workspaceRoot, (threadCounts.get(thread.workspaceRoot) ?? 0) + 1);
    }

    return [...sessions]
      .sort((left, right) => sortSessions(left, right, activeSessionId))
      .map((session) => {
        const activeTerminalIds = new Set(session.activeTerminalIds);
        const syncedTerminalCount = terminalSessions.filter((terminal) => activeTerminalIds.has(terminal.id)).length;
        const terminalCount = Math.max(activeTerminalIds.size, syncedTerminalCount);
        const chatCount = threadCounts.get(session.projectRoot) ?? 0;
        const hasActiveThread = Boolean(
          activeThreadId &&
          (
            session.conversationThreadId === activeThreadId ||
            threads.some((thread) => thread.id === activeThreadId && thread.workspaceRoot === session.projectRoot)
          ),
        );

        return {
          id: session.id,
          projectLabel: projectBasename(session.projectRoot),
          projectRoot: session.projectRoot,
          shortId: session.id.slice(0, 8),
          lastUsedLabel: relativeTime(session.lastUsedAt, now),
          status: sessionStatus(session),
          isActive: session.id === activeSessionId,
          isPinned: Boolean(session.pinned),
          isWorktree: session.worktree,
          terminalCount,
          chatCount,
          hasConversation: Boolean(session.conversationThreadId) || chatCount > 0,
          hasActiveThread,
          rawSession: session,
        } satisfies WorkbenchSessionItem;
      });
  }, [activeSessionId, activeThreadId, now, sessions, terminalSessions, threads]);

  return { items, activeSessionId, isLoading, refresh };
}
