/**
 * Pure helpers extracted from useWorkbenchSessions.ts to keep that file
 * under the 300-line limit. No React; no hooks. Pure data transforms.
 */

import type { AgentChatThreadRecord, SessionRecord } from '../../../types/electron';
import type { resolveSessionThread } from './useWorkbenchAttention';

export function projectBasename(root: string): string {
  return root.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? root;
}

export function relativeTime(iso: string, now: number): string {
  const diffMs = Math.max(0, now - new Date(iso).getTime());
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export function sessionStatus(session: SessionRecord): 'active' | 'archived' | 'deleted' {
  if (session.deletedAt) return 'deleted';
  if (session.archivedAt) return 'archived';
  return 'active';
}

export function compareSessionPriority(left: SessionRecord, right: SessionRecord): number {
  if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1;
  if (Boolean(left.deletedAt) !== Boolean(right.deletedAt)) return left.deletedAt ? 1 : -1;
  if (Boolean(left.archivedAt) !== Boolean(right.archivedAt)) return left.archivedAt ? 1 : -1;
  const lastUsedDiff = new Date(right.lastUsedAt).getTime() - new Date(left.lastUsedAt).getTime();
  if (lastUsedDiff !== 0) return lastUsedDiff;
  return left.id.localeCompare(right.id);
}

export function dedupeSessionsByProjectRoot(sessions: SessionRecord[]): SessionRecord[] {
  const byRoot = new Map<string, SessionRecord>();
  for (const session of sessions) {
    const current = byRoot.get(session.projectRoot);
    if (!current || compareSessionPriority(session, current) < 0) {
      byRoot.set(session.projectRoot, session);
    }
  }
  return [...byRoot.values()];
}

export function buildCanonicalSessionIndex(sessions: SessionRecord[]): {
  canonicalSessions: SessionRecord[];
  byId: Map<string, SessionRecord>;
  canonicalByRoot: Map<string, SessionRecord>;
} {
  const canonicalSessions = dedupeSessionsByProjectRoot(sessions);
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const canonicalByRoot = new Map(
    canonicalSessions.map((session) => [session.projectRoot, session]),
  );
  return { canonicalSessions, byId, canonicalByRoot };
}

function resolveCanonicalSessionId(
  thread: AgentChatThreadRecord,
  byId: Map<string, SessionRecord>,
  canonicalByRoot: Map<string, SessionRecord>,
): string | null {
  const linkedSessionId = thread.latestOrchestration?.sessionId;
  const ownerSession = linkedSessionId ? (byId.get(linkedSessionId) ?? null) : null;
  return (
    (ownerSession && canonicalByRoot.get(ownerSession.projectRoot)?.id) ??
    canonicalByRoot.get(thread.workspaceRoot)?.id ??
    linkedSessionId ??
    null
  );
}

export function buildThreadCounts(
  threads: AgentChatThreadRecord[],
  sessions: SessionRecord[],
): Map<string, number> {
  const { byId, canonicalByRoot } = buildCanonicalSessionIndex(sessions);
  const counts = new Map<string, number>();
  for (const thread of threads) {
    if (thread.deletedAt) continue;
    const canonicalSessionId = resolveCanonicalSessionId(thread, byId, canonicalByRoot);
    if (!canonicalSessionId) continue;
    counts.set(canonicalSessionId, (counts.get(canonicalSessionId) ?? 0) + 1);
  }
  return counts;
}

export function buildThreadIndex(
  threads: AgentChatThreadRecord[],
  activeThreadId: string | null,
): Parameters<typeof resolveSessionThread>[1] {
  const activeThread = activeThreadId
    ? (threads.find((thread) => thread.id === activeThreadId) ?? null)
    : null;
  const byConversationId = new Map<string, AgentChatThreadRecord>();
  const bySessionId = new Map<string, AgentChatThreadRecord[]>();
  const byWorkspaceRoot = new Map<string, AgentChatThreadRecord[]>();
  for (const thread of threads) {
    byConversationId.set(thread.id, thread);
    const sessionId = thread.latestOrchestration?.sessionId;
    if (!sessionId) continue;
    const list = bySessionId.get(sessionId) ?? [];
    list.push(thread);
    bySessionId.set(sessionId, list);
    const rooted = byWorkspaceRoot.get(thread.workspaceRoot) ?? [];
    rooted.push(thread);
    byWorkspaceRoot.set(thread.workspaceRoot, rooted);
  }
  for (const list of bySessionId.values()) list.sort((a, b) => b.updatedAt - a.updatedAt);
  for (const list of byWorkspaceRoot.values()) list.sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    activeThread,
    byConversationId,
    bySessionId,
    byWorkspaceRoot,
    sessionIds: new Set(bySessionId.keys()),
  };
}
