import { useMemo, useRef } from 'react';

import type {
  AgentChatThreadRecord,
  ApprovalRequest,
  SessionRecord,
} from '../../../types/electron';

export type WorkbenchAttentionKind =
  | 'none'
  | 'live'
  | 'review'
  | 'approval'
  | 'completed-unseen'
  | 'failed';

export interface WorkbenchAttentionState {
  kind: WorkbenchAttentionKind;
  rank: number;
  label: string | null;
  tone: 'neutral' | 'accent' | 'warning' | 'error' | 'success';
  isSticky: boolean;
}

interface SessionThreadIndex {
  activeThread: AgentChatThreadRecord | null;
  byConversationId: Map<string, AgentChatThreadRecord>;
  bySessionId: Map<string, AgentChatThreadRecord[]>;
  sessionIds: Set<string>;
}

interface AttentionTarget {
  cacheKey: string;
  isActive: boolean;
  approvalCount: number;
  thread: AgentChatThreadRecord | null;
}

interface AttentionCacheEntry {
  status: AgentChatThreadRecord['status'] | null;
  threadKey: string | null;
  unseenThreadKey: string | null;
}

export interface UseWorkbenchAttentionOptions {
  sessions?: SessionRecord[];
  threads?: AgentChatThreadRecord[];
  activeSessionId?: string | null;
  activeThreadId?: string | null;
  approvalRequests?: ApprovalRequest[];
}

export interface UseWorkbenchAttentionResult {
  sessionAttentionById: Record<string, WorkbenchAttentionState>;
  chatAttentionById: Record<string, WorkbenchAttentionState>;
}

const NONE_ATTENTION: WorkbenchAttentionState = {
  kind: 'none',
  rank: 0,
  label: null,
  tone: 'neutral',
  isSticky: false,
};

interface AttentionStateArgs {
  kind: WorkbenchAttentionKind;
  tone: WorkbenchAttentionState['tone'];
  label: string | null;
  rank: number;
  isSticky: boolean;
}

function attentionState(args: AttentionStateArgs): WorkbenchAttentionState {
  return {
    kind: args.kind,
    tone: args.tone,
    label: args.label,
    rank: args.rank,
    isSticky: args.isSticky,
  };
}

function threadUpdatedAt(thread: AgentChatThreadRecord | null): number {
  return thread?.updatedAt ?? 0;
}

function buildSessionThreadIndex(
  threads: AgentChatThreadRecord[],
  activeThreadId: string | null,
): SessionThreadIndex {
  const byConversationId = new Map<string, AgentChatThreadRecord>();
  const bySessionId = new Map<string, AgentChatThreadRecord[]>();
  const activeThread = activeThreadId
    ? (threads.find((thread) => thread.id === activeThreadId) ?? null)
    : null;

  for (const thread of threads) {
    byConversationId.set(thread.id, thread);
    const sessionId = thread.latestOrchestration?.sessionId;
    if (!sessionId) continue;
    const list = bySessionId.get(sessionId) ?? [];
    list.push(thread);
    bySessionId.set(sessionId, list);
  }

  for (const list of bySessionId.values()) {
    list.sort((left, right) => threadUpdatedAt(right) - threadUpdatedAt(left));
  }

  return {
    activeThread,
    byConversationId,
    bySessionId,
    sessionIds: new Set(bySessionId.keys()),
  };
}

export function resolveSessionThread(
  session: SessionRecord,
  index: SessionThreadIndex,
  activeSessionId: string | null,
): AgentChatThreadRecord | null {
  if (session.conversationThreadId) {
    return index.byConversationId.get(session.conversationThreadId) ?? null;
  }
  const linked = index.bySessionId.get(session.id)?.[0];
  if (linked) return linked;
  if (
    session.id === activeSessionId &&
    index.activeThread &&
    index.activeThread.workspaceRoot === session.projectRoot
  ) {
    return index.activeThread;
  }
  return null;
}

export function resolveThreadSessionId(
  thread: AgentChatThreadRecord,
  sessions: SessionRecord[],
): string | null {
  const conversationOwner = sessions.find((session) => session.conversationThreadId === thread.id);
  if (conversationOwner) return conversationOwner.id;
  const sessionId = thread.latestOrchestration?.sessionId;
  return sessions.some((session) => session.id === sessionId) ? (sessionId ?? null) : null;
}

function buildApprovalCounts(approvals: ApprovalRequest[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const request of approvals) {
    counts.set(request.sessionId, (counts.get(request.sessionId) ?? 0) + 1);
  }
  return counts;
}

function isBusyStatus(status: AgentChatThreadRecord['status'] | null | undefined): boolean {
  return status === 'submitting' || status === 'running' || status === 'verifying';
}

function isCompletedStatus(status: AgentChatThreadRecord['status'] | null | undefined): boolean {
  return status === 'complete' || status === 'cancelled';
}

function toThreadKey(thread: AgentChatThreadRecord | null): string | null {
  return thread ? `${thread.id}:${thread.updatedAt}` : null;
}

function deriveAttention(target: AttentionTarget, hasUnseenCompletion: boolean): WorkbenchAttentionState {
  const status = target.thread?.status ?? null;
  if (target.approvalCount > 0) {
    const label = target.approvalCount === 1 ? 'Approval' : `${target.approvalCount} approvals`;
    return attentionState({ kind: 'approval', tone: 'warning', label, rank: 5, isSticky: true });
  }
  if (status === 'failed')
    return attentionState({ kind: 'failed', tone: 'error', label: 'Failure', rank: 4, isSticky: true });
  if (status === 'needs_review')
    return attentionState({ kind: 'review', tone: 'warning', label: 'Review', rank: 3, isSticky: true });
  if (hasUnseenCompletion)
    return attentionState({ kind: 'completed-unseen', tone: 'success', label: 'Completed', rank: 2, isSticky: true });
  if (isBusyStatus(status))
    return attentionState({ kind: 'live', tone: 'accent', label: 'Live', rank: 1, isSticky: false });
  return NONE_ATTENTION;
}

function isTerminalStatus(status: AgentChatThreadRecord['status'] | null): boolean {
  return status === 'failed' || status === 'needs_review';
}

function didJustComplete(
  previous: AttentionCacheEntry | undefined,
  currentStatus: AgentChatThreadRecord['status'] | null,
): boolean {
  return isBusyStatus(previous?.status) && isCompletedStatus(currentStatus);
}

function resolveUnseenThreadKey(
  previous: AttentionCacheEntry | undefined,
  target: AttentionTarget,
  currentStatus: AgentChatThreadRecord['status'] | null,
  currentThreadKey: string | null,
): string | null {
  if (!currentThreadKey || target.isActive || isBusyStatus(currentStatus)) return null;
  if (isTerminalStatus(currentStatus)) return null;
  if (!target.isActive && didJustComplete(previous, currentStatus)) return currentThreadKey;
  return previous?.unseenThreadKey === currentThreadKey ? previous.unseenThreadKey : null;
}

function updateCacheEntry(
  previous: AttentionCacheEntry | undefined,
  target: AttentionTarget,
): AttentionCacheEntry {
  const currentStatus = target.thread?.status ?? null;
  const currentThreadKey = toThreadKey(target.thread);
  const unseenThreadKey = resolveUnseenThreadKey(previous, target, currentStatus, currentThreadKey);
  return { status: currentStatus, threadKey: currentThreadKey, unseenThreadKey };
}

function buildTargetMap(
  targets: AttentionTarget[],
  cache: Map<string, AttentionCacheEntry>,
): Record<string, WorkbenchAttentionState> {
  const result: Record<string, WorkbenchAttentionState> = {};
  for (const target of targets) {
    const nextEntry = updateCacheEntry(cache.get(target.cacheKey), target);
    cache.set(target.cacheKey, nextEntry);
    result[target.cacheKey] = deriveAttention(
      target,
      nextEntry.unseenThreadKey === nextEntry.threadKey,
    );
  }
  return result;
}

function pruneCacheKeys(cache: Map<string, AttentionCacheEntry>, keys: string[]): void {
  const allowed = new Set(keys);
  for (const key of [...cache.keys()]) {
    if (!allowed.has(key)) cache.delete(key);
  }
}

export function useWorkbenchAttention(options: UseWorkbenchAttentionOptions = {}): UseWorkbenchAttentionResult {
  const sessions = options.sessions ?? [];
  const threads = options.threads ?? [];
  const activeSessionId = options.activeSessionId ?? null;
  const activeThreadId = options.activeThreadId ?? null;
  const approvalRequests = options.approvalRequests ?? [];
  const sessionCacheRef = useRef(new Map<string, AttentionCacheEntry>());
  const chatCacheRef = useRef(new Map<string, AttentionCacheEntry>());

  return useMemo(() => {
    const approvalCounts = buildApprovalCounts(approvalRequests);
    const index = buildSessionThreadIndex(threads, activeThreadId);
    const sessionTargets = sessions.map((session) => ({
      cacheKey: session.id,
      isActive: session.id === activeSessionId,
      approvalCount: approvalCounts.get(session.id) ?? 0,
      thread: resolveSessionThread(session, index, activeSessionId),
    }));
    const chatTargets = threads.filter((thread) => !thread.deletedAt).map((thread) => ({
      cacheKey: thread.id,
      isActive: thread.id === activeThreadId,
      approvalCount: approvalCounts.get(resolveThreadSessionId(thread, sessions) ?? '') ?? 0,
      thread,
    }));
    pruneCacheKeys(sessionCacheRef.current, sessionTargets.map((target) => target.cacheKey));
    pruneCacheKeys(chatCacheRef.current, chatTargets.map((target) => target.cacheKey));
    return {
      sessionAttentionById: buildTargetMap(sessionTargets, sessionCacheRef.current),
      chatAttentionById: buildTargetMap(chatTargets, chatCacheRef.current),
    };
  }, [activeSessionId, activeThreadId, approvalRequests, sessions, threads]);
}
