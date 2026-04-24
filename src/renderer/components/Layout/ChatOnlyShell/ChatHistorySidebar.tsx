/**
 * ChatHistorySidebar — left-rail chat history sidebar (Wave 44 Phase B).
 *
 * Supports three modes (passed in as prop, managed by useChatSidebarMode):
 *   pinned   — 280px column, full list visible
 *   collapsed — 48px icon rail (new-chat icon only)
 *   hidden   — render nothing (caller shows overlay instead)
 *
 * Data: reads threads from AgentChatStoreContext.
 * Thread selection: dispatches onSelectThread action from the store.
 * Thread deletion: calls window.electronAPI.agentChat.deleteThread.
 * Thread rename: renders BranchRenameDialog inline.
 *
 * Footer slot: placeholder div for Phase C ChatOnlyUserMenu.
 */

import React, { useCallback, useContext, useEffect, useState } from 'react';

import type { AgentChatThreadRecord } from '../../../types/electron';
import type { AgentChatStoreInstance } from '../../AgentChat/agentChatStore';
import { AgentChatStoreContext, useAgentChatStoreContext } from '../../AgentChat/agentChatStore';
import type { AgentChatStore } from '../../AgentChat/agentChatStore.types';
import { BranchRenameDialog } from '../../AgentChat/BranchRenameDialog';
import { ChatHistoryList } from './ChatHistoryList';
import { ChatOnlyUserMenu } from './ChatOnlyUserMenu';
import type { ChatSidebarMode } from './useChatSidebarMode';

// ── Icons ─────────────────────────────────────────────────────────────────────

function PlusIcon(): React.ReactElement {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M7 2v10M2 7h10" /></svg>;
}

function SearchIcon(): React.ReactElement {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="6" cy="6" r="4" /><line x1="9.5" y1="9.5" x2="12.5" y2="12.5" /></svg>;
}

// ── Collapsed rail (48px icon strip) ─────────────────────────────────────────

interface CollapsedRailProps {
  onNewChat: () => void;
}

function CollapsedRail({ onNewChat }: CollapsedRailProps): React.ReactElement {
  return (
    <div
      className="flex flex-col items-center gap-2 py-3 w-12 h-full bg-surface-panel shrink-0"
      data-testid="sidebar-collapsed-rail"
    >
      <button
        className="flex items-center justify-center w-8 h-8 rounded text-text-semantic-muted hover:text-interactive-accent hover:bg-surface-hover transition-colors"
        onClick={onNewChat}
        title="New chat"
        aria-label="New chat"
      >
        <PlusIcon />
      </button>
    </div>
  );
}

// ── Sidebar header ────────────────────────────────────────────────────────────

interface SidebarHeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onNewChat: () => void;
}

function SidebarHeader({
  searchQuery,
  onSearchChange,
  onNewChat,
}: SidebarHeaderProps): React.ReactElement {
  return (
    <div className="flex shrink-0 flex-col gap-1.5 px-2 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text-semantic-muted uppercase tracking-wide select-none pl-1">
          Chats
        </span>
        <button
          /* touch-target-ok */ className="flex items-center justify-center w-7 h-7 rounded text-text-semantic-muted hover:text-interactive-accent hover:bg-surface-hover transition-colors"
          onClick={onNewChat}
          title="New chat"
          aria-label="New chat"
          data-testid="new-chat-button"
        >
          <PlusIcon />
        </button>
      </div>
      <div className="flex items-center gap-1.5 rounded bg-surface-inset/70 px-2 py-1">
        <SearchIcon />
        <input
          type="text"
          className="flex-1 text-xs bg-transparent text-text-semantic-primary placeholder:text-text-semantic-faint outline-none"
          placeholder="Search chats…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search chats"
          data-testid="search-input"
        />
      </div>
    </div>
  );
}

// ── Pinned body ───────────────────────────────────────────────────────────────

interface PinnedBodyProps {
  threads: AgentChatThreadRecord[];
  activeThreadId: string | null;
  completionIndicators: Record<string, 'none' | 'unseen' | 'seen'>;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onNewChat: () => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => Promise<void>;
  onPinThread: (id: string, pinned: boolean) => Promise<void>;
  onRenameThread: (t: AgentChatThreadRecord) => void;
}

function PinnedBody(props: PinnedBodyProps): React.ReactElement {
  return (
    <div
      className="flex h-full w-[clamp(220px,18vw,260px)] shrink-0 flex-col bg-surface-panel"
      data-testid="chat-history-sidebar"
    >
      <SidebarHeader
        searchQuery={props.searchQuery}
        onSearchChange={props.onSearchChange}
        onNewChat={props.onNewChat}
      />
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
        <ChatHistoryList
          threads={props.threads}
          completionIndicators={props.completionIndicators}
          activeThreadId={props.activeThreadId}
          onSelectThread={props.onSelectThread}
          onDeleteThread={props.onDeleteThread}
          onPinThread={props.onPinThread}
          onRenameThread={props.onRenameThread}
        />
      </div>
      {/* Wave 44 Phase C: user menu in sidebar footer */}
      <ChatOnlyUserMenu />
    </div>
  );
}

// ── Hook: sidebar state ───────────────────────────────────────────────────────

const THREAD_COMPLETION_SEEN_KEY = 'agent-chat:thread-completion-seen';

const COMPLETED_STATUSES = new Set(['complete', 'cancelled', 'failed', 'needs_review']);
function isCompletedThread(status: AgentChatThreadRecord['status']): boolean {
  return COMPLETED_STATUSES.has(status);
}

function loadSeenCompletions(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(THREAD_COMPLETION_SEEN_KEY) ?? 'null') ?? {}; }
  catch { return {}; }
}

function persistSeenCompletions(value: Record<string, number>): void {
  try { localStorage.setItem(THREAD_COMPLETION_SEEN_KEY, JSON.stringify(value)); }
  catch { /* ignore */ }
}

function useCompletionIndicators(
  threads: AgentChatThreadRecord[],
  activeThreadId: string | null,
): Record<string, CompletionState> {
  const [seenCompletions, setSeenCompletions] = useState<Record<string, number>>(() =>
    loadSeenCompletions(),
  );

  useEffect(() => {
    persistSeenCompletions(seenCompletions);
  }, [seenCompletions]);

  useEffect(() => {
    if (!activeThreadId) return;
    const activeThread = threads.find((thread) => thread.id === activeThreadId);
    if (!activeThread || !isCompletedThread(activeThread.status)) return;
    setSeenCompletions((prev) => {
      if ((prev[activeThread.id] ?? 0) >= activeThread.updatedAt) return prev;
      return { ...prev, [activeThread.id]: activeThread.updatedAt };
    });
  }, [activeThreadId, threads]);

  return threads.reduce<Record<string, CompletionState>>((acc, thread) => {
    if (!isCompletedThread(thread.status)) {
      acc[thread.id] = 'none';
      return acc;
    }
    acc[thread.id] = (seenCompletions[thread.id] ?? 0) >= thread.updatedAt ? 'seen' : 'unseen';
    return acc;
  }, {});
}

type CompletionState = 'none' | 'unseen' | 'seen';
interface SidebarState {
  threads: AgentChatThreadRecord[];
  activeThreadId: string | null;
  completionIndicators: Record<string, CompletionState>;
  onSelectThread: (id: string) => void;
  searchQuery: string;
  renameTarget: AgentChatThreadRecord | null;
  handleNewChat: () => void;
  handleDelete: (id: string) => Promise<void>;
  handlePin: (id: string, pinned: boolean) => Promise<void>;
  handleRename: (t: AgentChatThreadRecord) => void;
  handleRenamed: (threadId: string, newName: string) => void;
  setSearchQuery: (q: string) => void;
  setRenameTarget: (t: AgentChatThreadRecord | null) => void;
}

async function listThreadsForWorkspace(workspaceRoot: string): Promise<AgentChatThreadRecord[]> {
  const result = await window.electronAPI?.agentChat?.listThreads?.(workspaceRoot);
  if (!result?.success || !result.threads) {
    throw new Error(result?.error ?? 'Unable to load chat threads.');
  }
  return result.threads;
}

interface ThreadMutations {
  syncThreads: () => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  handlePin: (id: string, pinned: boolean) => Promise<void>;
  handleRenamed: () => Promise<void>;
}

function applyDeleteToStore(store: AgentChatStoreInstance, id: string): void {
  store.setState((state: AgentChatStore) => ({
    ...state,
    threads: state.threads.filter((t: AgentChatThreadRecord) => t.id !== id),
    activeThread: state.activeThread?.id === id ? null : state.activeThread,
  }));
}

function useThreadMutations(
  store: AgentChatStoreInstance | null,
  activeThread: AgentChatThreadRecord | null | undefined,
  threads: AgentChatThreadRecord[],
  setRenameTarget: (t: AgentChatThreadRecord | null) => void,
): ThreadMutations {
  const syncThreads = useCallback(async (): Promise<void> => {
    if (!store) return;
    const workspaceRoot = activeThread?.workspaceRoot ?? threads[0]?.workspaceRoot;
    if (!workspaceRoot) return;
    const nextThreads = await listThreadsForWorkspace(workspaceRoot);
    store.setState((state: AgentChatStore) => ({
      ...state,
      threads: nextThreads,
      activeThread: nextThreads.find((t) => t.id === state.activeThread?.id) ?? null,
    }));
  }, [activeThread?.workspaceRoot, store, threads]);
  const handleDelete = useCallback(
    async (id: string): Promise<void> => {
      await window.electronAPI?.agentChat?.deleteThread?.(id);
      if (store) applyDeleteToStore(store, id);
    },
    [store],
  );
  const handlePin = useCallback(
    async (id: string, pinned: boolean): Promise<void> => {
      await window.electronAPI?.agentChat?.pinThread?.(id, pinned);
      await syncThreads();
    },
    [syncThreads],
  );
  const handleRenamed = useCallback(async (): Promise<void> => {
    setRenameTarget(null);
    await syncThreads();
  }, [setRenameTarget, syncThreads]);
  return { syncThreads, handleDelete, handlePin, handleRenamed };
}

function useSidebarState(): SidebarState {
  const store = useContext(AgentChatStoreContext);
  const threads = useAgentChatStoreContext((s) => s.threads);
  const activeThread = useAgentChatStoreContext((s) => s.activeThread);
  const onSelectThread = useAgentChatStoreContext((s) => s.onSelectThread);
  const [searchQuery, setSearchQuery] = useState('');
  const [renameTarget, setRenameTarget] = useState<AgentChatThreadRecord | null>(null);
  const completionIndicators = useCompletionIndicators(threads, activeThread?.id ?? null);

  // Selecting `null` signals the workspace to open a fresh draft thread.
  const handleNewChat = useCallback((): void => {
    onSelectThread(null);
  }, [onSelectThread]);
  const handleRename = useCallback((t: AgentChatThreadRecord): void => {
    setRenameTarget(t);
  }, []);
  const mutations = useThreadMutations(store, activeThread, threads, setRenameTarget);

  return {
    threads,
    activeThreadId: activeThread?.id ?? null,
    completionIndicators,
    onSelectThread,
    searchQuery,
    renameTarget,
    handleNewChat,
    handleDelete: mutations.handleDelete,
    handlePin: mutations.handlePin,
    handleRename,
    handleRenamed: mutations.handleRenamed,
    setSearchQuery,
    setRenameTarget,
  };
}

// ── ChatHistorySidebar ────────────────────────────────────────────────────────

export interface ChatHistorySidebarProps {
  mode: ChatSidebarMode;
}

export function ChatHistorySidebar({ mode }: ChatHistorySidebarProps): React.ReactElement | null {
  const s = useSidebarState();

  if (mode === 'hidden') return null;
  if (mode === 'collapsed') return <CollapsedRail onNewChat={s.handleNewChat} />;

  const filtered = s.searchQuery.trim()
    ? s.threads.filter((t) =>
        (t.branchName ?? t.title).toLowerCase().includes(s.searchQuery.toLowerCase()),
      )
    : s.threads;

  return (
    <>
      <PinnedBody
        threads={filtered}
        activeThreadId={s.activeThreadId}
        completionIndicators={s.completionIndicators}
        searchQuery={s.searchQuery}
        onSearchChange={s.setSearchQuery}
        onNewChat={s.handleNewChat}
        onSelectThread={s.onSelectThread}
        onDeleteThread={s.handleDelete}
        onPinThread={s.handlePin}
        onRenameThread={s.handleRename}
      />
      {s.renameTarget && (
        <BranchRenameDialog
          threadId={s.renameTarget.id}
          currentName={s.renameTarget.branchName ?? s.renameTarget.title}
          onClose={() => s.setRenameTarget(null)}
          onRenamed={s.handleRenamed}
        />
      )}
    </>
  );
}
