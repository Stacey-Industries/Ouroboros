/**
 * CommandApprovalBanner.tsx — Inline approval UI for pending tool-use requests.
 *
 * Mounts inside the terminal area when there is a pending approval for the
 * active session. Surfaces four actions: Allow Once, Allow Always, Deny Once,
 * Deny Always. "Always" variants persist via approval:remember IPC.
 */

import React, { useEffect, useState } from 'react';

import type { ApprovalRequest } from '../../types/electron';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommandApprovalBannerProps {
  /** The pending approval request to surface. */
  request: ApprovalRequest;
  /** Called after the user makes a decision (clears the banner). */
  onDecision: (requestId: string) => void;
}

// ─── Command key derivation (mirrors main/approvalManager.ts) ─────────────────

function getCommandKey(request: ApprovalRequest): string {
  const input = request.toolInput;
  if (request.toolName === 'Bash') return String(input.command ?? '');
  const filePath = input.file_path ?? input.path;
  if (filePath !== undefined) return String(filePath);
  return JSON.stringify(input);
}

function getCommandPreview(request: ApprovalRequest): string {
  const key = getCommandKey(request);
  return key.length > 120 ? `${key.slice(0, 120)}…` : key;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BannerToolLabel({ toolName }: { toolName: string }): React.ReactElement {
  return (
    <span className="font-mono text-xs font-semibold text-text-semantic-primary">
      {toolName}
    </span>
  );
}

function BannerCommandPreview({ preview }: { preview: string }): React.ReactElement {
  return (
    <pre className="mt-1 overflow-hidden text-ellipsis whitespace-pre-wrap break-all font-mono text-xs text-text-semantic-secondary">
      {preview}
    </pre>
  );
}

interface ActionButtonProps {
  label: string;
  variant: 'allow' | 'deny' | 'allow-always' | 'deny-always';
  disabled: boolean;
  onClick: () => void;
}

function ActionButton({ label, variant, disabled, onClick }: ActionButtonProps): React.ReactElement {
  const base = 'rounded border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50';
  const styles: Record<typeof variant, string> = {
    allow: `${base} border-border-semantic bg-interactive-accent text-text-semantic-on-accent hover:bg-interactive-accent-hover`,
    'allow-always': `${base} border-interactive-accent bg-surface-raised text-text-semantic-primary hover:bg-surface-hover`,
    deny: `${base} border-border-subtle bg-surface-raised text-text-semantic-secondary hover:bg-surface-hover`,
    'deny-always': `${base} border-status-error bg-surface-raised text-status-error hover:bg-status-error-subtle`,
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={styles[variant]}
    >
      {label}
    </button>
  );
}

// ─── Decision hook ────────────────────────────────────────────────────────────

function useDecisionHandler(
  request: ApprovalRequest,
  onDecision: (requestId: string) => void,
): { busy: boolean; decide: (decision: 'approve' | 'reject', persist: 'once' | 'always') => void } {
  const [busy, setBusy] = useState(false);
  const commandKey = getCommandKey(request);

  function decide(decision: 'approve' | 'reject', persist: 'once' | 'always'): void {
    if (busy) return;
    setBusy(true);
    const run = async (): Promise<void> => {
      try {
        if (persist === 'always') {
          await window.electronAPI.approval.remember(
            request.toolName,
            commandKey,
            decision === 'approve' ? 'allow' : 'deny',
          );
        }
        await window.electronAPI.approval.respond(request.requestId, decision);
        onDecision(request.requestId);
      } finally {
        setBusy(false);
      }
    };
    void run();
  }

  return { busy, decide };
}

// ─── Action buttons strip ─────────────────────────────────────────────────────

function ApprovalActions({
  busy,
  decide,
}: {
  busy: boolean;
  decide: (decision: 'approve' | 'reject', persist: 'once' | 'always') => void;
}): React.ReactElement {
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <ActionButton label="Allow Once" variant="allow" disabled={busy} onClick={() => decide('approve', 'once')} />
      <ActionButton label="Allow Always" variant="allow-always" disabled={busy} onClick={() => decide('approve', 'always')} />
      <ActionButton label="Deny Once" variant="deny" disabled={busy} onClick={() => decide('reject', 'once')} />
      <ActionButton label="Deny Always" variant="deny-always" disabled={busy} onClick={() => decide('reject', 'always')} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Inline banner shown when Claude Code requests pre-execution approval.
 * Positioned absolutely over the terminal area (z-20 so it sits below
 * TerminalDisconnectedBanner at z-30).
 */
export function CommandApprovalBanner({
  request,
  onDecision,
}: CommandApprovalBannerProps): React.ReactElement {
  const { busy, decide } = useDecisionHandler(request, onDecision);
  const preview = getCommandPreview(request);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={`Approval request for ${request.toolName}`}
      className="absolute inset-x-0 top-0 z-20 border-b border-border-semantic bg-surface-overlay px-4 py-3 backdrop-blur-sm"
      data-testid="command-approval-banner"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-semantic-muted">Approval required —</span>
            <BannerToolLabel toolName={request.toolName} />
          </div>
          <BannerCommandPreview preview={preview} />
        </div>
        <ApprovalActions busy={busy} decide={decide} />
      </div>
    </div>
  );
}

// ─── Queue hook ───────────────────────────────────────────────────────────────

/**
 * Tracks pending approval requests for a given PTY session.
 * Returns the most-recent pending request for that session, or null.
 */
export function useSessionApprovalRequest(sessionId: string | null): ApprovalRequest | null {
  const [pending, setPending] = useState<Map<string, ApprovalRequest>>(new Map());

  useEffect(() => {
    if (!sessionId) return;

    const unsubRequest = window.electronAPI.approval.onRequest((req) => {
      if (req.sessionId !== sessionId) return;
      setPending((prev) => new Map(prev).set(req.requestId, req));
    });

    const unsubResolved = window.electronAPI.approval.onResolved(({ requestId }) => {
      setPending((prev) => {
        const next = new Map(prev);
        next.delete(requestId);
        return next;
      });
    });

    return () => {
      unsubRequest();
      unsubResolved();
    };
  }, [sessionId]);

  const requests = Array.from(pending.values());
  return requests.length > 0 ? requests[requests.length - 1] : null;
}
