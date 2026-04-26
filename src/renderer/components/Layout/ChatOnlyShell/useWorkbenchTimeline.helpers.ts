import type { LoadedRule, SkillExecutionRecord } from '@shared/types/ruleActivity';

import type { ApprovalRequest } from '../../../types/electron';
import type { AgentSession } from '../../AgentMonitor/types';
import type { DiffReviewState } from '../../DiffReview/types';
import type { WorkbenchTimelineEntry, WorkbenchTimelineTone } from './useWorkbenchTimeline';

// ─── Text helpers ─────────────────────────────────────────────────────────────

export function normalizeText(value: string, maxLength = 120): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength)}...`;
}

export function formatDuration(startedAt: number, completedAt: number): string {
  const totalSeconds = Math.max(0, Math.floor((completedAt - startedAt) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// ─── Tone helpers ─────────────────────────────────────────────────────────────

export function toneForStatus(status: 'pending' | 'success' | 'error'): WorkbenchTimelineTone {
  if (status === 'error') return 'error';
  if (status === 'pending') return 'warning';
  return 'success';
}

export function completionTone(status: AgentSession['status']): WorkbenchTimelineTone {
  if (status === 'error') return 'error';
  if (status === 'complete') return 'success';
  return 'neutral';
}

// ─── Detail helpers ───────────────────────────────────────────────────────────

export function approvalPreview(request: ApprovalRequest): string {
  if (request.toolName === 'Bash')
    return normalizeText(String(request.toolInput.command ?? ''), 140);
  const filePath = request.toolInput.file_path ?? request.toolInput.path;
  if (filePath !== undefined) return normalizeText(String(filePath), 140);
  return normalizeText(JSON.stringify(request.toolInput), 140);
}

export function getRuleDetail(rule: LoadedRule): string {
  const parts = [rule.name, rule.memoryType, normalizeText(rule.loadReason, 80)];
  return parts.filter(Boolean).join(' · ');
}

export function getSkillDetail(record: SkillExecutionRecord): string {
  const parts = [record.skillName, record.agentType];
  if (record.lastMessage) parts.push(normalizeText(record.lastMessage, 80));
  return parts.filter(Boolean).join(' · ');
}

// ─── Session dedup ────────────────────────────────────────────────────────────

export function dedupeSessions(sessions: AgentSession[]): AgentSession[] {
  const byId = new Map<string, AgentSession>();
  for (const session of sessions) {
    if (!byId.has(session.id)) byId.set(session.id, session);
  }
  return [...byId.values()].sort((left, right) => {
    if (left.startedAt !== right.startedAt) return left.startedAt - right.startedAt;
    return left.id.localeCompare(right.id);
  });
}

export function deriveSessionLabel(session: AgentSession): string {
  return session.taskLabel || `Session ${session.id.slice(0, 8)}`;
}

// ─── Approval / review entries ────────────────────────────────────────────────

export function appendApprovalEntries(
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

export function appendReviewEntry(
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
