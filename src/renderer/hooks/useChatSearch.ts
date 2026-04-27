/**
 * useChatSearch — local search over the chat-store thread list.
 *
 * Filters by title, message content, model name, and workspaceRoot.
 * No IPC round-trip: all data comes from the Zustand store already
 * loaded in the renderer.
 */
import { useCallback, useMemo, useState } from 'react';

import { useAgentChatStoreContext } from '../components/AgentChat/agentChatStore';
import type { AgentChatThreadRecord } from '../types/electron';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChatSearchScope = 'project' | 'all';

export interface ChatSearchMatch {
  threadId: string;
  title: string;
  snippet: string;
  workspaceRoot: string;
  model: string;
}

export interface UseChatSearchReturn {
  query: string;
  scope: ChatSearchScope;
  matches: ChatSearchMatch[];
  setQuery: (q: string) => void;
  setScope: (s: ChatSearchScope) => void;
  selectThread: (threadId: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractModel(thread: AgentChatThreadRecord): string {
  return thread.latestOrchestration?.model ?? '';
}

function buildSnippet(thread: AgentChatThreadRecord, needle: string): string {
  const lower = needle.toLowerCase();
  for (const msg of thread.messages) {
    const idx = msg.content.toLowerCase().indexOf(lower);
    if (idx === -1) continue;
    const start = Math.max(0, idx - 30);
    const end = Math.min(msg.content.length, idx + needle.length + 30);
    return (
      (start > 0 ? '…' : '') + msg.content.slice(start, end) + (end < msg.content.length ? '…' : '')
    );
  }
  return '';
}

function threadMatches(thread: AgentChatThreadRecord, lower: string): boolean {
  if (thread.title.toLowerCase().includes(lower)) return true;
  if (thread.workspaceRoot.toLowerCase().includes(lower)) return true;
  const model = extractModel(thread);
  if (model.toLowerCase().includes(lower)) return true;
  return thread.messages.some((m) => m.content.toLowerCase().includes(lower));
}

function toMatch(thread: AgentChatThreadRecord, query: string): ChatSearchMatch {
  return {
    threadId: thread.id,
    title: thread.title,
    snippet: buildSnippet(thread, query),
    workspaceRoot: thread.workspaceRoot,
    model: extractModel(thread),
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChatSearch(projectRoot: string | null): UseChatSearchReturn {
  const threads = useAgentChatStoreContext((s) => s.threads);
  const onSelectThread = useAgentChatStoreContext((s) => s.onSelectThread);

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<ChatSearchScope>('project');

  const matches = useMemo<ChatSearchMatch[]>(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const lower = trimmed.toLowerCase();

    const source =
      scope === 'project' && projectRoot
        ? threads.filter((t) => t.workspaceRoot === projectRoot)
        : threads;

    return source.filter((t) => threadMatches(t, lower)).map((t) => toMatch(t, trimmed));
  }, [query, scope, threads, projectRoot]);

  const selectThread = useCallback(
    (threadId: string) => {
      onSelectThread(threadId);
    },
    [onSelectThread],
  );

  return { query, scope, matches, setQuery, setScope, selectThread };
}
