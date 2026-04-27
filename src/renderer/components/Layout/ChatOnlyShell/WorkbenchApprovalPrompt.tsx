import React, { useMemo, useState } from 'react';

import type {
  AgentChatThreadRecord,
  ApprovalRequest,
  SessionRecord,
} from '../../../types/electron';
import {
  getApprovalRequestKey,
  getApprovalRequestPreview,
} from '../../AgentChat/approvalRequestPreview';

interface WorkbenchApprovalPromptProps {
  requests: ApprovalRequest[];
  activeSessionIds: Array<string | null | undefined>;
  sessions: SessionRecord[];
  threads: AgentChatThreadRecord[];
  onSelectSession: (sessionId: string) => void;
  onSelectThread: (threadId: string) => void;
}

type ApprovalDecision = 'approve' | 'reject';

interface PromptData {
  preview: string;
  queuedCount: number;
  request: ApprovalRequest;
  session: SessionRecord | null;
  targetLabel: string;
  thread: AgentChatThreadRecord | null;
}

function projectBasename(root: string): string {
  return root.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? root;
}

function threadSessionIds(thread: AgentChatThreadRecord): string[] {
  return [
    thread.latestOrchestration?.sessionId,
    thread.latestOrchestration?.claudeSessionId,
    thread.latestOrchestration?.codexThreadId,
  ].filter((value): value is string => Boolean(value));
}

function findRequestThread(
  request: ApprovalRequest,
  threads: AgentChatThreadRecord[],
): AgentChatThreadRecord | null {
  return threads.find((thread) => threadSessionIds(thread).includes(request.sessionId)) ?? null;
}

function isActiveApproval(
  request: ApprovalRequest,
  activeSessionIds: Array<string | null | undefined>,
): boolean {
  return activeSessionIds.some((sessionId) => sessionId === request.sessionId);
}

function useBackgroundApproval(
  requests: ApprovalRequest[],
  activeSessionIds: Array<string | null | undefined>,
): { request: ApprovalRequest | null; queuedCount: number } {
  return useMemo(() => {
    const background = requests.filter((request) => !isActiveApproval(request, activeSessionIds));
    return { request: background[0] ?? null, queuedCount: Math.max(0, background.length - 1) };
  }, [activeSessionIds, requests]);
}

function ActionButton({
  label,
  onClick,
  tone = 'secondary',
  disabled,
}: {
  label: string;
  onClick: () => void;
  tone?: 'primary' | 'secondary' | 'danger';
  disabled: boolean;
}): React.ReactElement {
  const toneClass =
    tone === 'primary'
      ? 'border-interactive-accent bg-interactive-accent text-text-on-accent'
      : tone === 'danger'
        ? 'border-status-error bg-status-error-subtle text-status-error'
        : 'border-border-semantic bg-surface-panel text-text-semantic-secondary hover:bg-surface-hover';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-default disabled:opacity-60 ${toneClass}`}
    >
      {label}
    </button>
  );
}

function resolvePromptData({
  request,
  queuedCount,
  sessions,
  threads,
}: {
  request: ApprovalRequest;
  queuedCount: number;
  sessions: SessionRecord[];
  threads: AgentChatThreadRecord[];
}): PromptData {
  const session = sessions.find((candidate) => candidate.id === request.sessionId) ?? null;
  const thread = findRequestThread(request, threads);
  return {
    preview: getApprovalRequestPreview(request),
    queuedCount,
    request,
    session,
    targetLabel: session ? projectBasename(session.projectRoot) : (thread?.title ?? 'Background'),
    thread,
  };
}

function PromptTargetButton({
  data,
  onSelect,
}: {
  data: PromptData;
  onSelect: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="min-w-0 flex-1 text-left"
      title="Open approval session"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-status-warning">
          Approval required
        </span>
        <span className="font-mono text-xs text-text-semantic-primary">
          {data.request.toolName}
        </span>
        <span className="text-xs text-text-semantic-muted">{data.targetLabel}</span>
        {data.queuedCount > 0 && (
          <span className="text-xs text-text-semantic-muted">+{data.queuedCount} more</span>
        )}
      </div>
      <div
        className="mt-1 truncate font-mono text-xs text-text-semantic-secondary"
        data-testid="workbench-background-approval-preview"
      >
        {data.preview}
      </div>
    </button>
  );
}

function PromptActions({
  busy,
  onDecision,
}: {
  busy: boolean;
  onDecision: (decision: ApprovalDecision, persist: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton
        label="Allow once"
        tone="primary"
        disabled={busy}
        onClick={() => onDecision('approve', false)}
      />
      <ActionButton
        label="Allow always"
        disabled={busy}
        onClick={() => onDecision('approve', true)}
      />
      <ActionButton label="Deny once" disabled={busy} onClick={() => onDecision('reject', false)} />
      <ActionButton
        label="Deny always"
        tone="danger"
        disabled={busy}
        onClick={() => onDecision('reject', true)}
      />
    </div>
  );
}

async function respondToApproval(
  data: PromptData,
  decision: ApprovalDecision,
  persist: boolean,
): Promise<void> {
  if (persist) {
    await window.electronAPI.approval.remember(
      data.request.toolName,
      getApprovalRequestKey(data.request),
      decision === 'approve' ? 'allow' : 'deny',
    );
  }
  await window.electronAPI.approval.respond(data.request.requestId, decision);
}

function selectPromptTarget(
  data: PromptData,
  onSelectSession: (sessionId: string) => void,
  onSelectThread: (threadId: string) => void,
): void {
  if (data.session) {
    onSelectSession(data.session.id);
    return;
  }
  if (data.thread) onSelectThread(data.thread.id);
}

function PromptCard({
  data,
  onSelectSession,
  onSelectThread,
}: {
  data: PromptData;
  onSelectSession: (sessionId: string) => void;
  onSelectThread: (threadId: string) => void;
}): React.ReactElement {
  const [busy, setBusy] = useState(false);

  async function decide(decision: ApprovalDecision, persist: boolean): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await respondToApproval(data, decision, persist);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="workbench-background-approval-prompt"
      className="fixed left-1/2 top-3 z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 rounded-lg border border-status-warning bg-surface-panel/95 px-3 py-3 shadow-2xl backdrop-blur"
    >
      <div className="flex flex-wrap items-start gap-3">
        <PromptTargetButton
          data={data}
          onSelect={() => selectPromptTarget(data, onSelectSession, onSelectThread)}
        />
        <PromptActions
          busy={busy}
          onDecision={(decision, persist) => void decide(decision, persist)}
        />
      </div>
    </div>
  );
}

export function WorkbenchApprovalPrompt({
  requests,
  activeSessionIds,
  sessions,
  threads,
  onSelectSession,
  onSelectThread,
}: WorkbenchApprovalPromptProps): React.ReactElement | null {
  const { request, queuedCount } = useBackgroundApproval(requests, activeSessionIds);
  if (!request) return null;
  return (
    <PromptCard
      data={resolvePromptData({ request, queuedCount, sessions, threads })}
      onSelectSession={onSelectSession}
      onSelectThread={onSelectThread}
    />
  );
}
