/* eslint-disable max-lines, max-lines-per-function, complexity */
import type { LoadedRule, SkillExecutionRecord } from '@shared/types/ruleActivity';
import { useMemo } from 'react';

import { useAgentEventsContext } from '../../../contexts/AgentEventsContext';
import { useApprovalContext } from '../../../contexts/ApprovalContext';
import type { ApprovalRequest } from '../../../types/electron';
import type { AgentSession } from '../../AgentMonitor/types';
import { useDiffReview } from '../../DiffReview/DiffReviewManager';
import type { DiffReviewState } from '../../DiffReview/types';

const TIMELINE_VISIBLE_LIMIT = 24;

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
    subagents: number;
    activity: number;
  };
}

function deriveSessionLabel(session: AgentSession): string {
  return session.taskLabel || `Session ${session.id.slice(0, 8)}`;
}

function normalizeText(value: string, maxLength = 120): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength)}...`;
}

function formatDuration(startedAt: number, completedAt: number): string {
  const totalSeconds = Math.max(0, Math.floor((completedAt - startedAt) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function toneForStatus(status: 'pending' | 'success' | 'error'): WorkbenchTimelineTone {
  if (status === 'error') return 'error';
  if (status === 'pending') return 'warning';
  return 'success';
}

function completionTone(status: AgentSession['status']): WorkbenchTimelineTone {
  if (status === 'error') return 'error';
  if (status === 'complete') return 'success';
  return 'neutral';
}

function approvalPreview(request: ApprovalRequest): string {
  if (request.toolName === 'Bash')
    return normalizeText(String(request.toolInput.command ?? ''), 140);
  const filePath = request.toolInput.file_path ?? request.toolInput.path;
  if (filePath !== undefined) return normalizeText(String(filePath), 140);
  return normalizeText(JSON.stringify(request.toolInput), 140);
}

function getRuleDetail(rule: LoadedRule): string {
  const parts = [rule.name, rule.memoryType, normalizeText(rule.loadReason, 80)];
  return parts.filter(Boolean).join(' · ');
}

function getSkillDetail(record: SkillExecutionRecord): string {
  const parts = [record.skillName, record.agentType];
  if (record.lastMessage) parts.push(normalizeText(record.lastMessage, 80));
  return parts.filter(Boolean).join(' · ');
}

function dedupeSessions(sessions: AgentSession[]): AgentSession[] {
  const byId = new Map<string, AgentSession>();
  for (const session of sessions) {
    if (!byId.has(session.id)) byId.set(session.id, session);
  }
  return [...byId.values()].sort((left, right) => {
    if (left.startedAt !== right.startedAt) return left.startedAt - right.startedAt;
    return left.id.localeCompare(right.id);
  });
}

function appendApprovalEntries(
  requests: ApprovalRequest[],
  entries: WorkbenchTimelineEntry[],
): void {
  for (const request of requests) {
    entries.push({
      id: `approval:${request.requestId}`,
      kind: 'approval',
      kindLabel: 'Approval',
      sessionId: request.sessionId,
      sessionLabel: request.sessionId,
      timestamp: request.timestamp,
      title: `Approval required for ${request.toolName}`,
      detail: approvalPreview(request) || undefined,
      tone: 'warning',
    });
  }
}

function appendReviewEntry(
  diffReviewState: DiffReviewState | null,
  entries: WorkbenchTimelineEntry[],
  timestamp: number,
): void {
  if (!diffReviewState) return;
  const pendingHunks = diffReviewState.files.reduce(
    (count, file) => count + file.hunks.filter((hunk) => hunk.decision === 'pending').length,
    0,
  );
  entries.push({
    id: `review:${diffReviewState.sessionId}:${diffReviewState.snapshotHash}`,
    kind: 'review',
    kindLabel: 'Review',
    sessionId: diffReviewState.sessionId,
    sessionLabel: diffReviewState.sessionId,
    timestamp,
    title: 'Diff review waiting',
    detail: `${diffReviewState.files.length} files · ${pendingHunks} pending hunks`,
    tone: pendingHunks > 0 ? 'warning' : 'neutral',
  });
}

function appendSessionLifecycleEntries(
  session: AgentSession,
  sessionsById: Map<string, AgentSession>,
  entries: WorkbenchTimelineEntry[],
): void {
  const sessionLabel = deriveSessionLabel(session);
  const parentLabel = session.parentSessionId
    ? (sessionsById.get(session.parentSessionId)?.taskLabel ?? session.parentSessionId.slice(0, 8))
    : null;

  entries.push({
    id: `${session.id}:session-start`,
    kind: 'session',
    kindLabel: session.parentSessionId ? 'Subagent' : 'Session',
    sessionId: session.id,
    sessionLabel,
    timestamp: session.startedAt,
    title: session.parentSessionId ? 'Subagent started' : 'Session started',
    detail:
      [
        session.parentSessionId ? `Child of ${parentLabel}` : null,
        session.model ? `Model ${session.model}` : null,
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
    tone: 'neutral',
  });

  if (session.completedAt && session.status !== 'idle') {
    entries.push({
      id: `${session.id}:session-end`,
      kind: 'session',
      kindLabel: 'Session',
      sessionId: session.id,
      sessionLabel,
      timestamp: session.completedAt,
      title:
        session.status === 'error'
          ? 'Session failed'
          : session.status === 'complete'
            ? 'Session completed'
            : 'Session ended',
      detail:
        [
          `Duration ${formatDuration(session.startedAt, session.completedAt)}`,
          session.error ? normalizeText(session.error, 80) : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
      tone: completionTone(session.status),
    });
  }
}

function appendToolEntries(session: AgentSession, entries: WorkbenchTimelineEntry[]): void {
  const sessionLabel = deriveSessionLabel(session);
  for (const [index, toolCall] of session.toolCalls.entries()) {
    entries.push({
      id: `${session.id}:tool:${toolCall.id ?? index}`,
      kind: 'tool',
      kindLabel: 'Tool',
      sessionId: session.id,
      sessionLabel,
      timestamp: toolCall.timestamp,
      title: toolCall.toolName,
      detail: normalizeText(toolCall.output || toolCall.input, 140) || undefined,
      tone: toneForStatus(toolCall.status),
    });

    for (const [subIndex, subTool] of (toolCall.subTools ?? []).entries()) {
      entries.push({
        id: `${session.id}:tool:${toolCall.id ?? index}:subtool:${subTool.id ?? subIndex}`,
        kind: 'subtool',
        kindLabel: 'Subtool',
        sessionId: session.id,
        sessionLabel,
        timestamp: subTool.timestamp,
        title: subTool.toolName,
        detail: normalizeText(`${toolCall.toolName} · ${subTool.input}`, 140) || undefined,
        tone: toneForStatus(subTool.status),
      });
    }
  }
}

function appendTaskEntries(session: AgentSession, entries: WorkbenchTimelineEntry[]): void {
  const sessionLabel = deriveSessionLabel(session);
  for (const [index, task] of (session.tasks ?? []).entries()) {
    entries.push({
      id: `${session.id}:task:${task.id ?? index}:created`,
      kind: 'task',
      kindLabel: 'Task',
      sessionId: session.id,
      sessionLabel,
      timestamp: task.createdAt,
      title: 'Task created',
      detail: normalizeText(task.description, 120) || undefined,
      tone: 'warning',
    });
    if (task.completedAt) {
      entries.push({
        id: `${session.id}:task:${task.id ?? index}:completed`,
        kind: 'task',
        kindLabel: 'Task',
        sessionId: session.id,
        sessionLabel,
        timestamp: task.completedAt,
        title: task.status === 'error' ? 'Task failed' : 'Task completed',
        detail: normalizeText(task.description, 120) || undefined,
        tone: task.status === 'error' ? 'error' : 'success',
      });
    }
  }
}

function appendConversationEntries(session: AgentSession, entries: WorkbenchTimelineEntry[]): void {
  const sessionLabel = deriveSessionLabel(session);
  for (const [index, turn] of (session.conversationTurns ?? []).entries()) {
    const title =
      turn.type === 'prompt'
        ? 'User prompt'
        : turn.type === 'elicitation'
          ? 'Elicitation question'
          : 'Elicitation result';
    entries.push({
      id: `${session.id}:turn:${index}:${turn.type}`,
      kind: 'conversation',
      kindLabel: 'Conversation',
      sessionId: session.id,
      sessionLabel,
      timestamp: turn.timestamp,
      title,
      detail: normalizeText(turn.content, 140) || undefined,
      tone: 'neutral',
    });
  }
}

function appendRuleEntries(session: AgentSession, entries: WorkbenchTimelineEntry[]): void {
  const sessionLabel = deriveSessionLabel(session);
  for (const [index, rule] of (session.loadedRules ?? []).entries()) {
    entries.push({
      id: `${session.id}:rule:${index}:${rule.filePath}`,
      kind: 'rule',
      kindLabel: 'Rule',
      sessionId: session.id,
      sessionLabel,
      timestamp: rule.loadedAt,
      title: 'Rule loaded',
      detail: getRuleDetail(rule),
      tone: 'neutral',
    });
  }
}

function appendSkillEntries(session: AgentSession, entries: WorkbenchTimelineEntry[]): void {
  const sessionLabel = deriveSessionLabel(session);
  for (const [index, record] of (session.skillExecutions ?? []).entries()) {
    entries.push({
      id: `${session.id}:skill:${index}:${record.agentId}:start`,
      kind: 'skill',
      kindLabel: 'Skill',
      sessionId: session.id,
      sessionLabel,
      timestamp: record.startedAt,
      title: 'Skill started',
      detail: getSkillDetail(record),
      tone: 'warning',
    });
    if (record.completedAt) {
      entries.push({
        id: `${session.id}:skill:${index}:${record.agentId}:end`,
        kind: 'skill',
        kindLabel: 'Skill',
        sessionId: session.id,
        sessionLabel,
        timestamp: record.completedAt,
        title: record.status === 'failed' ? 'Skill failed' : 'Skill completed',
        detail: getSkillDetail(record),
        tone: record.status === 'failed' ? 'error' : 'success',
      });
    }
  }
}

function appendPermissionEntries(session: AgentSession, entries: WorkbenchTimelineEntry[]): void {
  const sessionLabel = deriveSessionLabel(session);
  for (const [index, event] of (session.permissionEvents ?? []).entries()) {
    entries.push({
      id: `${session.id}:permission:${index}:${event.type}`,
      kind: 'permission',
      kindLabel: 'Permission',
      sessionId: session.id,
      sessionLabel,
      timestamp: event.timestamp,
      title: event.type === 'denied' ? 'Permission denied' : 'Permission requested',
      detail:
        [event.permissionType, event.toolName, event.reason].filter(Boolean).join(' · ') ||
        undefined,
      tone: event.type === 'denied' ? 'error' : 'warning',
    });
  }
}

function appendCompactionEntries(session: AgentSession, entries: WorkbenchTimelineEntry[]): void {
  const sessionLabel = deriveSessionLabel(session);
  for (const [index, compaction] of (session.compactions ?? []).entries()) {
    entries.push({
      id: `${session.id}:compaction:${index}`,
      kind: 'compaction',
      kindLabel: 'Compaction',
      sessionId: session.id,
      sessionLabel,
      timestamp: compaction.timestamp,
      title: 'Context compacted',
      detail: `${compaction.preTokens} -> ${compaction.postTokens} tokens`,
      tone: 'neutral',
    });
  }
}

function collectSessionEntries(
  session: AgentSession,
  sessionsById: Map<string, AgentSession>,
): WorkbenchTimelineEntry[] {
  const entries: WorkbenchTimelineEntry[] = [];
  appendSessionLifecycleEntries(session, sessionsById, entries);
  appendToolEntries(session, entries);
  appendTaskEntries(session, entries);
  appendConversationEntries(session, entries);
  appendRuleEntries(session, entries);
  appendSkillEntries(session, entries);
  appendPermissionEntries(session, entries);
  appendCompactionEntries(session, entries);
  return entries;
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

export function useWorkbenchTimeline(
  options: UseWorkbenchTimelineOptions = {},
): UseWorkbenchTimelineResult {
  const { currentSessions = [], historicalSessions = [] } = useAgentEventsContext();
  const { requests } = useApprovalContext();
  const { state } = useDiffReview();
  const approvalRequests = options.approvalRequests ?? requests;
  const reviewState = options.diffReviewState ?? state;
  const now = options.now ?? Date.now();

  const sessions = useMemo(
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
      subagents: sessions.filter((session) => Boolean(session.parentSessionId)).length,
      activity: entries.length,
    },
  };
}
