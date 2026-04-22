import React, { useMemo, useState } from 'react';

import { useApprovalContext } from '../../contexts/ApprovalContext';
import type { ApprovalRequest } from '../../types/electron';

interface AgentChatApprovalBannerProps {
  sessionIds: Array<string | null | undefined>;
}

function getRequestKey(request: ApprovalRequest): string {
  const input = request.toolInput;
  if (request.toolName === 'Bash') return String(input.command ?? '');
  const filePath = input.file_path ?? input.path;
  if (filePath !== undefined) return String(filePath);
  return JSON.stringify(input);
}

function getRequestPreview(request: ApprovalRequest): string {
  const key = getRequestKey(request);
  return key.length > 160 ? `${key.slice(0, 160)}...` : key;
}

function filterMatchingRequests(
  requests: ApprovalRequest[],
  sessionIds: Array<string | null | undefined>,
): ApprovalRequest[] {
  const allowed = new Set(sessionIds.filter((value): value is string => Boolean(value)));
  if (allowed.size === 0) return [];
  return requests.filter((request) => allowed.has(request.sessionId));
}

interface ApprovalActionButtonProps {
  label: string;
  onClick: () => void;
  disabled: boolean;
  tone: 'allow' | 'secondary' | 'danger';
}

function ApprovalActionButton({
  label,
  onClick,
  disabled,
  tone,
}: ApprovalActionButtonProps): React.ReactElement {
  const baseStyle: React.CSSProperties = {
    borderRadius: 999,
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid var(--border-semantic)',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.65 : 1,
  };
  const toneStyle: Record<ApprovalActionButtonProps['tone'], React.CSSProperties> = {
    allow: {
      background: 'var(--interactive-accent)',
      color: 'var(--text-on-accent, white)',
      borderColor: 'var(--interactive-accent)',
    },
    secondary: {
      background: 'var(--surface-raised)',
      color: 'var(--text-semantic-primary)',
    },
    danger: {
      background: 'var(--status-error-subtle)',
      color: 'var(--status-error)',
      borderColor: 'var(--status-error)',
    },
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ ...baseStyle, ...toneStyle[tone] }}>
      {label}
    </button>
  );
}

export function AgentChatApprovalBanner({
  sessionIds,
}: AgentChatApprovalBannerProps): React.ReactElement | null {
  const { requests } = useApprovalContext();
  const matchingRequests = useMemo(
    () => filterMatchingRequests(requests, sessionIds),
    [requests, sessionIds],
  );
  const request = matchingRequests[0];
  const [busy, setBusy] = useState(false);

  if (!request) return null;

  const preview = getRequestPreview(request);
  const queuedCount = Math.max(0, matchingRequests.length - 1);

  async function handleDecision(
    decision: 'approve' | 'reject',
    persist: 'once' | 'always',
  ): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      if (persist === 'always') {
        await window.electronAPI.approval.remember(
          request.toolName,
          getRequestKey(request),
          decision === 'approve' ? 'allow' : 'deny',
        );
      }
      await window.electronAPI.approval.respond(request.requestId, decision);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="mx-4 mt-3 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-status-warning bg-status-warning-subtle px-4 py-3"
      data-testid="agent-chat-approval-banner"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-status-warning">
            Approval required
          </span>
          <span className="font-mono text-xs text-text-semantic-primary">{request.toolName}</span>
          {queuedCount > 0 && (
            <span className="text-xs text-text-semantic-muted">
              +{queuedCount} more queued
            </span>
          )}
        </div>
        <div
          className="mt-1 break-all font-mono text-xs text-text-semantic-secondary"
          data-testid="agent-chat-approval-preview"
        >
          {preview}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <ApprovalActionButton
          label="Allow once"
          tone="allow"
          disabled={busy}
          onClick={() => void handleDecision('approve', 'once')}
        />
        <ApprovalActionButton
          label="Allow always"
          tone="secondary"
          disabled={busy}
          onClick={() => void handleDecision('approve', 'always')}
        />
        <ApprovalActionButton
          label="Deny once"
          tone="secondary"
          disabled={busy}
          onClick={() => void handleDecision('reject', 'once')}
        />
        <ApprovalActionButton
          label="Deny always"
          tone="danger"
          disabled={busy}
          onClick={() => void handleDecision('reject', 'always')}
        />
      </div>
    </div>
  );
}
