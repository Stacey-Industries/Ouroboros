import { useContext, useMemo } from 'react';
import { useStore } from 'zustand';

import type { AgentChatThreadRecord, SessionRecord } from '../../../types/electron';
import { AgentChatStoreContext, createAgentChatStore } from '../../AgentChat/agentChatStore';
import { useSessions } from '../../SessionSidebar/useSessions';
import type { TerminalSession } from '../../Terminal/TerminalTabs';
import type { WorkbenchAttentionState } from './useWorkbenchAttention';
import { resolveSessionThread } from './useWorkbenchAttention';
import {
  buildThreadCounts,
  buildThreadIndex,
  dedupeSessionsByProjectRoot,
  projectBasename,
  relativeTime,
  sessionStatus,
} from './useWorkbenchSessions.helpers';

const FALLBACK_CHAT_STORE = createAgentChatStore();
const EMPTY_TERMINAL_SESSIONS: TerminalSession[] = [];
const NONE_ATTENTION: WorkbenchAttentionState = {
  kind: 'none',
  rank: 0,
  label: null,
  tone: 'neutral',
  isSticky: false,
};

function compareBackgroundSessions(
  left: WorkbenchSessionItem,
  right: WorkbenchSessionItem,
): number {
  if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
  if (left.attention.rank !== right.attention.rank) {
    return right.attention.rank - left.attention.rank;
  }
  if (left.status !== right.status) {
    if (left.status === 'active') return -1;
    if (right.status === 'active') return 1;
    if (left.status === 'archived') return -1;
    if (right.status === 'archived') return 1;
  }
  return (
    new Date(right.rawSession.lastUsedAt).getTime() - new Date(left.rawSession.lastUsedAt).getTime()
  );
}

interface SessionItemArgs {
  session: SessionRecord;
  activeSessionId: string | null;
  activeThreadId: string | null;
  now: number;
  threads: AgentChatThreadRecord[];
  terminalSessions: TerminalSession[];
  threadCounts: Map<string, number>;
  attentionBySessionId: Record<string, WorkbenchAttentionState>;
  threadIndex: Parameters<typeof resolveSessionThread>[1];
}

function resolveTerminalCount(session: SessionRecord, terminalSessions: TerminalSession[]): number {
  const activeTerminalIds = new Set(session.activeTerminalIds);
  const syncedCount = terminalSessions.filter((terminal) =>
    activeTerminalIds.has(terminal.id),
  ).length;
  return Math.max(activeTerminalIds.size, syncedCount);
}

function hasMatchingActiveThread(
  session: SessionRecord,
  activeThreadId: string | null,
  threads: AgentChatThreadRecord[],
): boolean {
  if (!activeThreadId) return false;
  if (session.conversationThreadId === activeThreadId) return true;
  return threads.some(
    (thread) => thread.id === activeThreadId && thread.workspaceRoot === session.projectRoot,
  );
}

function toSessionItem(args: SessionItemArgs): WorkbenchSessionItem {
  const {
    session,
    activeSessionId,
    activeThreadId,
    now,
    threads,
    terminalSessions,
    threadCounts,
    attentionBySessionId,
    threadIndex,
  } = args;
  const linkedThread = resolveSessionThread(session, threadIndex, activeSessionId);
  const terminalCount = resolveTerminalCount(session, terminalSessions);
  const chatCount = threadCounts.get(session.id) ?? 0;
  const hasActiveThread = hasMatchingActiveThread(session, activeThreadId, threads);

  return {
    kind: 'session',
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
    attention: attentionBySessionId[session.id] ?? NONE_ATTENTION,
    threadStatus: linkedThread?.status ?? null,
    linkedThreadId: linkedThread?.id ?? null,
    rawSession: session,
  };
}

export interface WorkbenchSessionItem {
  kind: 'session';
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
  attention: WorkbenchAttentionState;
  threadStatus: AgentChatThreadRecord['status'] | null;
  linkedThreadId: string | null;
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
  attentionBySessionId?: Record<string, WorkbenchAttentionState>;
  now?: number;
}

export interface UseWorkbenchSessionsResult {
  items: WorkbenchSessionItem[];
  activeItems: WorkbenchSessionItem[];
  backgroundItems: WorkbenchSessionItem[];
  activeSessionId: string | null;
  isLoading: boolean;
  refresh: () => void;
}

interface ResolvedSessionOptions {
  sessions: SessionRecord[];
  activeSessionId: string | null;
  isLoading: boolean;
  refresh: () => void;
  threads: AgentChatThreadRecord[];
  activeThreadId: string | null;
  terminalSessions: TerminalSession[];
  attentionBySessionId: Record<string, WorkbenchAttentionState>;
  now: number;
}

function useSessionsBase(
  options: UseWorkbenchSessionsOptions,
): Pick<ResolvedSessionOptions, 'sessions' | 'activeSessionId' | 'isLoading' | 'refresh'> {
  const sessionsState = useSessions();
  return {
    sessions: options.sessions ?? sessionsState.sessions,
    activeSessionId: options.activeSessionId ?? sessionsState.activeSessionId,
    isLoading: options.isLoading ?? sessionsState.isLoading,
    refresh: options.refresh ?? sessionsState.refresh,
  };
}

function useChatStoreBase(
  options: UseWorkbenchSessionsOptions,
): Pick<ResolvedSessionOptions, 'threads' | 'activeThreadId'> {
  const chatStore = useContext(AgentChatStoreContext) ?? FALLBACK_CHAT_STORE;
  const storeThreads = useStore(chatStore, (state) => state.threads);
  const storeActiveThread = useStore(chatStore, (state) => state.activeThread);
  return {
    threads: options.threads ?? storeThreads,
    activeThreadId: options.activeThreadId ?? storeActiveThread?.id ?? null,
  };
}

function useResolvedSessionOptions(options: UseWorkbenchSessionsOptions): ResolvedSessionOptions {
  const base = useSessionsBase(options);
  const chatBase = useChatStoreBase(options);
  return {
    ...base,
    ...chatBase,
    terminalSessions: options.terminalSessions ?? EMPTY_TERMINAL_SESSIONS,
    attentionBySessionId: options.attentionBySessionId ?? {},
    now: options.now ?? Date.now(),
  };
}

function useSessionItems(resolved: ResolvedSessionOptions): WorkbenchSessionItem[] {
  const {
    sessions,
    activeSessionId,
    activeThreadId,
    now,
    threads,
    terminalSessions,
    attentionBySessionId,
  } = resolved;
  return useMemo(() => {
    const canonicalSessions = dedupeSessionsByProjectRoot(sessions);
    const threadCounts = buildThreadCounts(threads, sessions);
    const threadIndex = buildThreadIndex(threads, activeThreadId);
    return canonicalSessions.map((session) =>
      toSessionItem({
        session,
        activeSessionId,
        activeThreadId,
        now,
        threads,
        terminalSessions,
        threadCounts,
        attentionBySessionId,
        threadIndex,
      }),
    );
  }, [
    activeSessionId,
    activeThreadId,
    attentionBySessionId,
    now,
    sessions,
    terminalSessions,
    threads,
  ]);
}

export function useWorkbenchSessions(
  options: UseWorkbenchSessionsOptions = {},
): UseWorkbenchSessionsResult {
  const resolved = useResolvedSessionOptions(options);
  const items = useSessionItems(resolved);

  const activeItems = useMemo(() => items.filter((item) => item.isActive), [items]);
  const backgroundItems = useMemo(
    () => items.filter((item) => !item.isActive).sort(compareBackgroundSessions),
    [items],
  );

  return {
    items: [...activeItems, ...backgroundItems],
    activeItems,
    backgroundItems,
    activeSessionId: resolved.activeSessionId,
    isLoading: resolved.isLoading,
    refresh: resolved.refresh,
  };
}
