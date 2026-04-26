import type { AgentChatThreadRecord, ApprovalRequest } from '../../../types/electron';
import type { WorkbenchAttentionKind, WorkbenchAttentionState } from './useWorkbenchAttention';

export interface SessionThreadIndex {
  activeThread: AgentChatThreadRecord | null;
  byConversationId: Map<string, AgentChatThreadRecord>;
  bySessionId: Map<string, AgentChatThreadRecord[]>;
  sessionIds: Set<string>;
}

export interface AttentionTarget {
  cacheKey: string;
  isActive: boolean;
  approvalCount: number;
  thread: AgentChatThreadRecord | null;
}

export interface AttentionCacheEntry {
  status: AgentChatThreadRecord['status'] | null;
  threadKey: string | null;
  unseenThreadKey: string | null;
}

export interface AttentionCaches {
  sessionCache: Map<string, AttentionCacheEntry>;
  chatCache: Map<string, AttentionCacheEntry>;
  snoozeMap: Map<string, number>;
}

export const NONE_ATTENTION: WorkbenchAttentionState = {
  kind: 'none',
  rank: 0,
  label: null,
  tone: 'neutral',
  isSticky: false,
};

/** Kinds that snooze suppresses. Sticky terminal states (failed, needs_review) are immune. */
export const SNOOZEABLE_KINDS = new Set<WorkbenchAttentionKind>(['approval', 'completed-unseen']);

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

export function buildSessionThreadIndex(
  threads: AgentChatThreadRecord[],
  activeThreadId: string | null,
): SessionThreadIndex {
  const byConversationId = new Map<string, AgentChatThreadRecord>();
  const bySessionId = new Map<string, AgentChatThreadRecord[]>();
  const activeThread = activeThreadId
    ? (threads.find((t) => t.id === activeThreadId) ?? null)
    : null;
  for (const thread of threads) {
    byConversationId.set(thread.id, thread);
    const sid = thread.latestOrchestration?.sessionId;
    if (!sid) continue;
    const list = bySessionId.get(sid) ?? [];
    list.push(thread);
    bySessionId.set(sid, list);
  }
  for (const list of bySessionId.values()) {
    list.sort((a, b) => threadUpdatedAt(b) - threadUpdatedAt(a));
  }
  return { activeThread, byConversationId, bySessionId, sessionIds: new Set(bySessionId.keys()) };
}

export function buildApprovalCounts(approvals: ApprovalRequest[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const req of approvals) counts.set(req.sessionId, (counts.get(req.sessionId) ?? 0) + 1);
  return counts;
}

export function isBusyStatus(status: AgentChatThreadRecord['status'] | null | undefined): boolean {
  return status === 'submitting' || status === 'running' || status === 'verifying';
}

function isCompletedStatus(status: AgentChatThreadRecord['status'] | null | undefined): boolean {
  return status === 'complete' || status === 'cancelled';
}

function isTerminalStatus(status: AgentChatThreadRecord['status'] | null): boolean {
  return status === 'failed' || status === 'needs_review';
}

function toThreadKey(thread: AgentChatThreadRecord | null): string | null {
  return thread ? `${thread.id}:${thread.updatedAt}` : null;
}

function deriveAttentionKind(
  status: AgentChatThreadRecord['status'] | null,
  approvalCount: number,
  hasUnseenCompletion: boolean,
): WorkbenchAttentionKind {
  if (approvalCount > 0) return 'approval';
  if (status === 'failed') return 'failed';
  if (status === 'needs_review') return 'review';
  if (hasUnseenCompletion) return 'completed-unseen';
  if (isBusyStatus(status)) return 'live';
  return 'none';
}

export function deriveAttention(
  target: AttentionTarget,
  hasUnseenCompletion: boolean,
): WorkbenchAttentionState {
  const status = target.thread?.status ?? null;
  const kind = deriveAttentionKind(status, target.approvalCount, hasUnseenCompletion);
  if (kind === 'approval') {
    const label = target.approvalCount === 1 ? 'Approval' : `${target.approvalCount} approvals`;
    return attentionState({ kind, tone: 'warning', label, rank: 5, isSticky: true });
  }
  if (kind === 'failed')
    return attentionState({ kind, tone: 'error', label: 'Failure', rank: 4, isSticky: true });
  if (kind === 'review')
    return attentionState({ kind, tone: 'warning', label: 'Review', rank: 3, isSticky: true });
  if (kind === 'completed-unseen')
    return attentionState({ kind, tone: 'success', label: 'Completed', rank: 2, isSticky: true });
  if (kind === 'live')
    return attentionState({ kind, tone: 'accent', label: 'Live', rank: 1, isSticky: false });
  return NONE_ATTENTION;
}

function didTransitionToComplete(
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
  if (didTransitionToComplete(previous, currentStatus)) return currentThreadKey;
  return previous?.unseenThreadKey === currentThreadKey ? previous.unseenThreadKey : null;
}

export function updateCacheEntry(
  previous: AttentionCacheEntry | undefined,
  target: AttentionTarget,
): AttentionCacheEntry {
  const currentStatus = target.thread?.status ?? null;
  const currentThreadKey = toThreadKey(target.thread);
  const unseenThreadKey = resolveUnseenThreadKey(previous, target, currentStatus, currentThreadKey);
  return { status: currentStatus, threadKey: currentThreadKey, unseenThreadKey };
}

export function applySnooze(
  state: WorkbenchAttentionState,
  snoozeUntil: number | undefined,
  now: number,
): WorkbenchAttentionState {
  if (snoozeUntil === undefined || now >= snoozeUntil) return state;
  if (!SNOOZEABLE_KINDS.has(state.kind)) return state;
  return NONE_ATTENTION;
}

export function buildTargetMap(
  targets: AttentionTarget[],
  cache: Map<string, AttentionCacheEntry>,
  snoozeMap: Map<string, number>,
  now: number,
): Record<string, WorkbenchAttentionState> {
  const result: Record<string, WorkbenchAttentionState> = {};
  for (const target of targets) {
    const nextEntry = updateCacheEntry(cache.get(target.cacheKey), target);
    cache.set(target.cacheKey, nextEntry);
    const raw = deriveAttention(target, nextEntry.unseenThreadKey === nextEntry.threadKey);
    result[target.cacheKey] = applySnooze(raw, snoozeMap.get(target.cacheKey), now);
  }
  return result;
}

export function pruneCacheKeys(cache: Map<string, AttentionCacheEntry>, keys: string[]): void {
  const allowed = new Set(keys);
  for (const key of [...cache.keys()]) {
    if (!allowed.has(key)) cache.delete(key);
  }
}
