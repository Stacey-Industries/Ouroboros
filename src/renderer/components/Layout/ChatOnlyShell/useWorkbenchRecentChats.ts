import { useContext, useMemo } from 'react';
import { useStore } from 'zustand';

import type { AgentChatThreadRecord, SessionRecord } from '../../../types/electron';
import { AgentChatStoreContext, createAgentChatStore } from '../../AgentChat/agentChatStore';
import { useSessions } from '../../SessionSidebar/useSessions';
import type { WorkbenchAttentionState } from './useWorkbenchAttention';
import { resolveThreadSessionId } from './useWorkbenchAttention';

const FALLBACK_CHAT_STORE = createAgentChatStore();
const NONE_ATTENTION: WorkbenchAttentionState = {
  kind: 'none',
  rank: 0,
  label: null,
  tone: 'neutral',
  isSticky: false,
};

function projectBasename(root: string): string {
  return root.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? root;
}

function relativeTime(timestamp: number, now: number): string {
  const diffMs = Math.max(0, now - timestamp);
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function chatTitle(thread: AgentChatThreadRecord): string {
  const firstUserMessage = thread.messages.find((message) => message.role === 'user');
  return thread.branchName ?? thread.title ?? firstUserMessage?.content?.slice(0, 60) ?? 'New chat';
}

function dedupeThreads(threads: AgentChatThreadRecord[]): AgentChatThreadRecord[] {
  const byId = new Map<string, AgentChatThreadRecord>();
  for (const thread of threads) {
    const current = byId.get(thread.id);
    if (!current || thread.updatedAt > current.updatedAt) byId.set(thread.id, thread);
  }
  return [...byId.values()];
}

function compareRecentChats(left: WorkbenchRecentChatItem, right: WorkbenchRecentChatItem): number {
  if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
  if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
  if (left.attention.rank !== right.attention.rank) {
    return right.attention.rank - left.attention.rank;
  }
  return right.rawThread.updatedAt - left.rawThread.updatedAt;
}

export interface WorkbenchRecentChatItem {
  kind: 'recent-chat';
  id: string;
  threadId: string;
  projectLabel: string;
  projectRoot: string;
  title: string;
  shortId: string;
  lastUpdatedLabel: string;
  messageCount: number;
  isActive: boolean;
  isPinned: boolean;
  linkedSessionId: string | null;
  attention: WorkbenchAttentionState;
  rawThread: AgentChatThreadRecord;
}

export interface UseWorkbenchRecentChatsOptions {
  sessions?: SessionRecord[];
  threads?: AgentChatThreadRecord[];
  activeThreadId?: string | null;
  attentionByThreadId?: Record<string, WorkbenchAttentionState>;
  now?: number;
}

export interface UseWorkbenchRecentChatsResult {
  items: WorkbenchRecentChatItem[];
}

export function useWorkbenchRecentChats(
  options: UseWorkbenchRecentChatsOptions = {},
): UseWorkbenchRecentChatsResult {
  const sessionsState = useSessions();
  const chatStore = useContext(AgentChatStoreContext) ?? FALLBACK_CHAT_STORE;
  const storeThreads = useStore(chatStore, (state) => state.threads);
  const storeActiveThread = useStore(chatStore, (state) => state.activeThread);

  const sessions = options.sessions ?? sessionsState.sessions;
  const threads = options.threads ?? storeThreads;
  const activeThreadId = options.activeThreadId ?? storeActiveThread?.id ?? null;
  const attentionByThreadId = options.attentionByThreadId ?? {};
  const now = options.now ?? Date.now();

  const items = useMemo(() => {
    const visibleThreads = dedupeThreads(threads).filter((thread) => !thread.deletedAt);

    return visibleThreads
      .map((thread) => {
        const linkedSessionId = resolveThreadSessionId(thread, sessions);
        return {
          kind: 'recent-chat',
          id: thread.id,
          threadId: thread.id,
          projectLabel: projectBasename(thread.workspaceRoot),
          projectRoot: thread.workspaceRoot,
          title: chatTitle(thread),
          shortId: thread.id.slice(0, 8),
          lastUpdatedLabel: relativeTime(thread.updatedAt, now),
          messageCount: thread.messages.filter((message) => message.role === 'user').length,
          isActive: thread.id === activeThreadId,
          isPinned: Boolean(thread.pinned),
          linkedSessionId,
          attention: attentionByThreadId[thread.id] ?? NONE_ATTENTION,
          rawThread: thread,
        } satisfies WorkbenchRecentChatItem;
      })
      .filter((item) => item.linkedSessionId === null)
      .sort(compareRecentChats);
  }, [activeThreadId, attentionByThreadId, now, sessions, threads]);

  return { items };
}
