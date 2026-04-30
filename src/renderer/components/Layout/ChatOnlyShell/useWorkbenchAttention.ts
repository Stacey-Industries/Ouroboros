import { useCallback, useMemo, useRef } from 'react';

import type {
  AgentChatThreadRecord,
  ApprovalRequest,
  SessionRecord,
} from '../../../types/electron';
import {
  type AttentionCacheEntry,
  type AttentionCaches,
  buildApprovalCounts,
  buildSessionThreadIndex,
  buildTargetMap,
  pruneCacheKeys,
} from './useWorkbenchAttention.helpers';

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
  snoozeSession: (sessionId: string, durationMs: number) => void;
}

export function resolveSessionThread(
  session: SessionRecord,
  index: ReturnType<typeof buildSessionThreadIndex>,
  activeSessionId: string | null,
): AgentChatThreadRecord | null {
  if (session.conversationThreadId) {
    return index.byConversationId.get(session.conversationThreadId) ?? null;
  }
  const linked = index.bySessionId.get(session.id)?.[0];
  if (linked) return linked;
  const rooted = index.byWorkspaceRoot.get(session.projectRoot)?.[0];
  if (rooted) return rooted;
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
  const owner = sessions.find((s) => s.conversationThreadId === thread.id);
  if (owner) return owner.id;
  const sessionId = thread.latestOrchestration?.sessionId;
  return sessions.some((s) => s.id === sessionId) ? (sessionId ?? null) : null;
}

interface SessionTargetsArgs {
  sessions: SessionRecord[];
  activeSessionId: string | null;
  approvalCounts: Map<string, number>;
  threads: AgentChatThreadRecord[];
  activeThreadId: string | null;
}

function buildSessionTargets(args: SessionTargetsArgs) {
  const index = buildSessionThreadIndex(args.threads, args.activeThreadId);
  return {
    index,
    sessionTargets: args.sessions.map((session) => ({
      cacheKey: session.id,
      isActive: session.id === args.activeSessionId,
      approvalCount: args.approvalCounts.get(session.id) ?? 0,
      thread: resolveSessionThread(session, index, args.activeSessionId),
    })),
  };
}

function buildChatTargets(
  threads: AgentChatThreadRecord[],
  sessions: SessionRecord[],
  activeThreadId: string | null,
  approvalCounts: Map<string, number>,
) {
  return threads
    .filter((t) => !t.deletedAt)
    .map((thread) => ({
      cacheKey: thread.id,
      isActive: thread.id === activeThreadId,
      approvalCount: approvalCounts.get(resolveThreadSessionId(thread, sessions) ?? '') ?? 0,
      thread,
    }));
}

interface ComputeMapsArgs {
  sessions: SessionRecord[];
  threads: AgentChatThreadRecord[];
  activeSessionId: string | null;
  activeThreadId: string | null;
  approvalRequests: ApprovalRequest[];
  caches: AttentionCaches;
}

function buildAttentionMaps(
  sessionTargets: ReturnType<typeof buildSessionTargets>['sessionTargets'],
  chatTargets: ReturnType<typeof buildChatTargets>,
  caches: AttentionCaches,
  now: number,
): Pick<UseWorkbenchAttentionResult, 'sessionAttentionById' | 'chatAttentionById'> {
  pruneCacheKeys(
    caches.sessionCache,
    sessionTargets.map((t) => t.cacheKey),
  );
  pruneCacheKeys(
    caches.chatCache,
    chatTargets.map((t) => t.cacheKey),
  );
  return {
    sessionAttentionById: buildTargetMap(
      sessionTargets,
      caches.sessionCache,
      caches.snoozeMap,
      now,
    ),
    chatAttentionById: buildTargetMap(chatTargets, caches.chatCache, caches.snoozeMap, now),
  };
}

function computeMaps(
  args: ComputeMapsArgs,
): Pick<UseWorkbenchAttentionResult, 'sessionAttentionById' | 'chatAttentionById'> {
  const approvalCounts = buildApprovalCounts(args.approvalRequests);
  const { sessionTargets } = buildSessionTargets({
    sessions: args.sessions,
    activeSessionId: args.activeSessionId,
    approvalCounts,
    threads: args.threads,
    activeThreadId: args.activeThreadId,
  });
  const chatTargets = buildChatTargets(
    args.threads,
    args.sessions,
    args.activeThreadId,
    approvalCounts,
  );
  return buildAttentionMaps(sessionTargets, chatTargets, args.caches, Date.now());
}

export function useWorkbenchAttention(
  options: UseWorkbenchAttentionOptions = {},
): UseWorkbenchAttentionResult {
  const cachesRef = useRef<AttentionCaches>({
    sessionCache: new Map<string, AttentionCacheEntry>(),
    chatCache: new Map<string, AttentionCacheEntry>(),
    snoozeMap: new Map<string, number>(),
  });

  const snoozeSession = useCallback((sessionId: string, durationMs: number): void => {
    cachesRef.current.snoozeMap.set(sessionId, Date.now() + durationMs);
  }, []);

  const { sessions, threads, activeSessionId, activeThreadId, approvalRequests } = options;

  const maps = useMemo(
    () =>
      computeMaps({
        sessions: sessions ?? [],
        threads: threads ?? [],
        activeSessionId: activeSessionId ?? null,
        activeThreadId: activeThreadId ?? null,
        approvalRequests: approvalRequests ?? [],
        caches: cachesRef.current,
      }),
    [sessions, threads, activeSessionId, activeThreadId, approvalRequests],
  );

  return { ...maps, snoozeSession };
}
