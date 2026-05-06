import { useMemo } from 'react';

import { useAgentEventsContext } from '../../../contexts/AgentEventsContext';
import { useApprovalContext } from '../../../contexts/ApprovalContext';
import type { ApprovalRequest } from '../../../types/electron';
import type { AgentSession } from '../../AgentMonitor/types';
import { useDiffReview } from '../../DiffReview/DiffReviewManager';
import type { DiffReviewState } from '../../DiffReview/types';
import { collectSessionEntries } from './useWorkbenchTimeline.entries';
import {
  appendApprovalEntries,
  appendReviewEntry,
  dedupeSessions,
} from './useWorkbenchTimeline.helpers';

// Wave 82 — Phase 0 decision 10 (emerging digest). Cap raised so the counter
// and the visible list no longer disagree wildly. WorkbenchTimelinePanel
// groups entries by session in render so the larger cap doesn't overwhelm.
const TIMELINE_VISIBLE_LIMIT = 500;

export type WorkbenchTimelineTone = 'neutral' | 'success' | 'warning' | 'error';

export type WorkbenchTimelineKind =
  | 'approval'
  | 'review'
  | 'session'
  | 'tool'
  | 'subtool'
  | 'task'
  | 'conversation'
  | 'rule'
  | 'skill'
  | 'permission'
  | 'compaction';

export interface WorkbenchTimelineEntry {
  id: string;
  kind: WorkbenchTimelineKind;
  kindLabel: string;
  sessionId: string;
  sessionLabel: string;
  timestamp: number;
  title: string;
  detail?: string;
  tone: WorkbenchTimelineTone;
}

export interface UseWorkbenchTimelineOptions {
  sessions?: AgentSession[];
  currentSessions?: AgentSession[];
  historicalSessions?: AgentSession[];
  maxEntries?: number;
  approvalRequests?: ApprovalRequest[];
  diffReviewState?: DiffReviewState | null;
  now?: number;
}

export interface UseWorkbenchTimelineResult {
  entries: WorkbenchTimelineEntry[];
  visibleEntries: WorkbenchTimelineEntry[];
  totalCount: number;
  counts: {
    approvals: number;
    review: number;
    monitor: number;
    activity: number;
  };
}

export function buildWorkbenchTimelineEntries(
  sessions: AgentSession[],
  options: {
    approvalRequests?: ApprovalRequest[];
    diffReviewState?: DiffReviewState | null;
    now?: number;
  } = {},
): WorkbenchTimelineEntry[] {
  const orderedSessions = dedupeSessions(sessions);
  const sessionsById = new Map(orderedSessions.map((session) => [session.id, session] as const));
  const entries = orderedSessions.flatMap((session) =>
    collectSessionEntries(session, sessionsById),
  );
  appendApprovalEntries(options.approvalRequests ?? [], entries);
  appendReviewEntry(options.diffReviewState ?? null, entries, options.now ?? Date.now());
  return entries.sort((left, right) => {
    if (left.timestamp !== right.timestamp) return right.timestamp - left.timestamp;
    return left.id.localeCompare(right.id);
  });
}

function useResolvedSessions(options: UseWorkbenchTimelineOptions): AgentSession[] {
  const { currentSessions = [], historicalSessions = [] } = useAgentEventsContext();
  return useMemo(
    () =>
      options.sessions ?? [
        ...(options.currentSessions ?? currentSessions),
        ...(options.historicalSessions ?? historicalSessions),
      ],
    [
      currentSessions,
      historicalSessions,
      options.currentSessions,
      options.historicalSessions,
      options.sessions,
    ],
  );
}

export function useWorkbenchTimeline(
  options: UseWorkbenchTimelineOptions = {},
): UseWorkbenchTimelineResult {
  const sessions = useResolvedSessions(options);
  const { requests } = useApprovalContext();
  const { state } = useDiffReview();
  const approvalRequests = options.approvalRequests ?? requests;
  const reviewState = options.diffReviewState ?? state;
  const now = options.now ?? Date.now();

  const entries = useMemo(
    () =>
      buildWorkbenchTimelineEntries(sessions, {
        approvalRequests,
        diffReviewState: reviewState,
        now,
      }),
    [approvalRequests, now, reviewState, sessions],
  );
  const maxEntries = options.maxEntries ?? TIMELINE_VISIBLE_LIMIT;
  const visibleEntries = useMemo(() => entries.slice(0, maxEntries), [entries, maxEntries]);

  return {
    entries,
    visibleEntries,
    totalCount: entries.length,
    counts: {
      approvals: approvalRequests.length,
      review: reviewState?.files.length ?? 0,
      monitor: sessions.filter((session) => Boolean(session.parentSessionId)).length,
      activity: entries.length,
    },
  };
}
