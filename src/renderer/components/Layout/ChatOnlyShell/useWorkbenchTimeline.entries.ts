import type { AgentSession } from '../../AgentMonitor/types';
import type { WorkbenchTimelineEntry } from './useWorkbenchTimeline';
import {
  completionTone,
  deriveSessionLabel,
  formatDuration,
  getRuleDetail,
  getSkillDetail,
  normalizeText,
  toneForStatus,
} from './useWorkbenchTimeline.helpers';

// ─── Session lifecycle entries ────────────────────────────────────────────────

function buildSessionStartDetail(
  session: AgentSession,
  sessionsById: Map<string, AgentSession>,
): string | undefined {
  const parentLabel = session.parentSessionId
    ? (sessionsById.get(session.parentSessionId)?.taskLabel ?? session.parentSessionId.slice(0, 8))
    : null;
  const parts = [
    session.parentSessionId ? `Child of ${parentLabel}` : null,
    session.model ? `Model ${session.model}` : null,
  ].filter(Boolean);
  return parts.join(' · ') || undefined;
}

function appendSessionStartEntry(
  session: AgentSession,
  sessionsById: Map<string, AgentSession>,
  entries: WorkbenchTimelineEntry[],
): void {
  const sessionLabel = deriveSessionLabel(session);
  entries.push({
    id: `${session.id}:session-start`,
    kind: 'session',
    kindLabel: session.parentSessionId ? 'Subagent' : 'Session',
    sessionId: session.id,
    sessionLabel,
    timestamp: session.startedAt,
    title: session.parentSessionId ? 'Subagent started' : 'Session started',
    detail: buildSessionStartDetail(session, sessionsById),
    tone: 'neutral',
  });
}

function sessionEndTitle(status: AgentSession['status']): string {
  if (status === 'error') return 'Session failed';
  if (status === 'complete') return 'Session completed';
  return 'Session ended';
}

function appendSessionEndEntry(session: AgentSession, entries: WorkbenchTimelineEntry[]): void {
  if (!session.completedAt || session.status === 'idle') return;
  const sessionLabel = deriveSessionLabel(session);
  const durationDetail = `Duration ${formatDuration(session.startedAt, session.completedAt)}`;
  const errorDetail = session.error ? normalizeText(session.error, 80) : null;
  entries.push({
    id: `${session.id}:session-end`,
    kind: 'session',
    kindLabel: 'Session',
    sessionId: session.id,
    sessionLabel,
    timestamp: session.completedAt,
    title: sessionEndTitle(session.status),
    detail: [durationDetail, errorDetail].filter(Boolean).join(' · ') || undefined,
    tone: completionTone(session.status),
  });
}

export function appendSessionLifecycleEntries(
  session: AgentSession,
  sessionsById: Map<string, AgentSession>,
  entries: WorkbenchTimelineEntry[],
): void {
  appendSessionStartEntry(session, sessionsById, entries);
  appendSessionEndEntry(session, entries);
}

// ─── Tool entries ─────────────────────────────────────────────────────────────

export function appendToolEntries(session: AgentSession, entries: WorkbenchTimelineEntry[]): void {
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

// ─── Task entries ─────────────────────────────────────────────────────────────

export function appendTaskEntries(session: AgentSession, entries: WorkbenchTimelineEntry[]): void {
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

// ─── Conversation entries ─────────────────────────────────────────────────────

function conversationTurnTitle(type: 'prompt' | 'elicitation' | 'elicitation_result'): string {
  if (type === 'prompt') return 'User prompt';
  if (type === 'elicitation') return 'Elicitation question';
  return 'Elicitation result';
}

export function appendConversationEntries(
  session: AgentSession,
  entries: WorkbenchTimelineEntry[],
): void {
  const sessionLabel = deriveSessionLabel(session);
  for (const [index, turn] of (session.conversationTurns ?? []).entries()) {
    entries.push({
      id: `${session.id}:turn:${index}:${turn.type}`,
      kind: 'conversation',
      kindLabel: 'Conversation',
      sessionId: session.id,
      sessionLabel,
      timestamp: turn.timestamp,
      title: conversationTurnTitle(turn.type),
      detail: normalizeText(turn.content, 140) || undefined,
      tone: 'neutral',
    });
  }
}

// ─── Rule entries ─────────────────────────────────────────────────────────────

export function appendRuleEntries(session: AgentSession, entries: WorkbenchTimelineEntry[]): void {
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

// ─── Skill entries ────────────────────────────────────────────────────────────

export function appendSkillEntries(session: AgentSession, entries: WorkbenchTimelineEntry[]): void {
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

// ─── Permission entries ───────────────────────────────────────────────────────

export function appendPermissionEntries(
  session: AgentSession,
  entries: WorkbenchTimelineEntry[],
): void {
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

// ─── Compaction entries ───────────────────────────────────────────────────────

export function appendCompactionEntries(
  session: AgentSession,
  entries: WorkbenchTimelineEntry[],
): void {
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

// ─── Session entry collector ──────────────────────────────────────────────────

export function collectSessionEntries(
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
