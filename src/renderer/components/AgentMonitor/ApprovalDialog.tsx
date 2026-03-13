/**
 * ApprovalDialog.tsx — Pre-execution approval dialog for Claude Code tool calls.
 *
 * Shows a modal overlay when a tool call requires user approval before execution.
 * Displays tool name, relevant input details (file paths, commands, content),
 * and provides Approve / Reject / Always Allow buttons.
 *
 * Multiple pending approvals are queued and shown one at a time.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { ApprovalRequest } from '../../types/electron';

// ─── Tool input rendering helpers ────────────────────────────────────────────

function extractFilePath(input: Record<string, unknown>): string | null {
  for (const key of ['file_path', 'filePath', 'path']) {
    if (typeof input[key] === 'string') return input[key] as string;
  }
  return null;
}

function extractCommand(input: Record<string, unknown>): string | null {
  if (typeof input['command'] === 'string') return input['command'] as string;
  return null;
}

function extractContent(input: Record<string, unknown>): string | null {
  for (const key of ['content', 'new_string', 'newString']) {
    if (typeof input[key] === 'string') return input[key] as string;
  }
  return null;
}

function extractOldString(input: Record<string, unknown>): string | null {
  for (const key of ['old_string', 'oldString']) {
    if (typeof input[key] === 'string') return input[key] as string;
  }
  return null;
}

function ToolInputPreview({ toolName, input }: { toolName: string; input: Record<string, unknown> }): React.ReactElement {
  const filePath = extractFilePath(input);
  const command = extractCommand(input);
  const content = extractContent(input);
  const oldString = extractOldString(input);

  return (
    <div className="flex flex-col gap-2 text-sm" style={{ maxHeight: '400px', overflow: 'auto' }}>
      {filePath && (
        <div>
          <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>File: </span>
          <span className="font-mono text-xs" style={{ color: 'var(--accent)' }}>{filePath}</span>
        </div>
      )}

      {command && (
        <div>
          <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>Command: </span>
          <pre
            className="mt-1 p-2 rounded text-xs font-mono whitespace-pre-wrap"
            style={{
              backgroundColor: 'var(--bg-deeper, rgba(0,0,0,0.3))',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              maxHeight: '200px',
              overflow: 'auto',
            }}
          >
            {command}
          </pre>
        </div>
      )}

      {oldString && (toolName === 'Edit' || toolName === 'edit') && (
        <div>
          <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>Replacing: </span>
          <pre
            className="mt-1 p-2 rounded text-xs font-mono whitespace-pre-wrap"
            style={{
              backgroundColor: 'rgba(255, 80, 80, 0.1)',
              color: 'var(--text)',
              border: '1px solid rgba(255, 80, 80, 0.3)',
              maxHeight: '120px',
              overflow: 'auto',
            }}
          >
            {oldString.length > 500 ? oldString.slice(0, 500) + '\n... (truncated)' : oldString}
          </pre>
        </div>
      )}

      {content && (
        <div>
          <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>
            {toolName === 'Edit' || toolName === 'edit' ? 'With:' : 'Content:'}
          </span>
          <pre
            className="mt-1 p-2 rounded text-xs font-mono whitespace-pre-wrap"
            style={{
              backgroundColor: 'rgba(80, 200, 80, 0.1)',
              color: 'var(--text)',
              border: '1px solid rgba(80, 200, 80, 0.3)',
              maxHeight: '200px',
              overflow: 'auto',
            }}
          >
            {content.length > 1000 ? content.slice(0, 1000) + '\n... (truncated)' : content}
          </pre>
        </div>
      )}

      {!filePath && !command && !content && (
        <pre
          className="p-2 rounded text-xs font-mono whitespace-pre-wrap"
          style={{
            backgroundColor: 'var(--bg-deeper, rgba(0,0,0,0.3))',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            maxHeight: '200px',
            overflow: 'auto',
          }}
        >
          {JSON.stringify(input, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ─── Tool name badge ─────────────────────────────────────────────────────────

const TOOL_COLORS: Record<string, string> = {
  Write: '#e06c75',
  write: '#e06c75',
  Bash: '#d19a66',
  bash: '#d19a66',
  Edit: '#e5c07b',
  edit: '#e5c07b',
  Read: '#61afef',
  read: '#61afef',
  Grep: '#98c379',
  grep: '#98c379',
  Glob: '#56b6c2',
  glob: '#56b6c2',
};

function ToolBadge({ toolName }: { toolName: string }): React.ReactElement {
  const color = TOOL_COLORS[toolName] ?? 'var(--accent)';

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold"
      style={{
        backgroundColor: `${color}22`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {toolName}
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface ApprovalDialogProps {
  /** Queue of pending approval requests */
  requests: ApprovalRequest[];
  /** Called when user approves the current request */
  onApprove: (requestId: string) => void;
  /** Called when user rejects the current request */
  onReject: (requestId: string, reason?: string) => void;
  /** Called when user clicks "Always Allow" for this tool in this session */
  onAlwaysAllow: (requestId: string, sessionId: string, toolName: string) => void;
}

export function ApprovalDialog({
  requests,
  onApprove,
  onReject,
  onAlwaysAllow,
}: ApprovalDialogProps): React.ReactElement | null {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Current request is the first in the queue
  const current = requests[0];

  // Reset reject input when the current request changes
  useEffect(() => {
    setRejectReason('');
    setShowRejectInput(false);
  }, [current?.requestId]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!current) return;

    function handleKeyDown(e: KeyboardEvent): void {
      // Don't capture when typing in the reject reason input
      if (showRejectInput) return;

      if (e.key === 'Enter' || e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        onApprove(current.requestId);
      } else if (e.key === 'Escape' || e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        onReject(current.requestId);
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        onAlwaysAllow(current.requestId, current.sessionId, current.toolName);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [current, showRejectInput, onApprove, onReject, onAlwaysAllow]);

  if (!current) return null;

  const elapsed = Math.floor((Date.now() - current.timestamp) / 1000);

  const handleRejectWithReason = (): void => {
    onReject(current.requestId, rejectReason || undefined);
    setRejectReason('');
    setShowRejectInput(false);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        zIndex: 9999,
        backdropFilter: 'blur(2px)',
      }}
      onClick={(e) => {
        // Don't dismiss on backdrop click — require explicit action
        e.stopPropagation();
      }}
    >
      <div
        ref={dialogRef}
        className="flex flex-col gap-3 rounded-lg shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-panel, var(--bg))',
          border: '1px solid var(--border)',
          padding: '20px',
          width: '560px',
          maxWidth: '90vw',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="font-semibold text-base" style={{ color: 'var(--text)' }}>
              Tool Approval Required
            </span>
          </div>
          {requests.length > 1 && (
            <span
              className="text-xs px-2 py-0.5 rounded"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}
            >
              +{requests.length - 1} queued
            </span>
          )}
        </div>

        {/* Tool info */}
        <div className="flex items-center gap-2">
          <ToolBadge toolName={current.toolName} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Session {current.sessionId.slice(0, 8)}...
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {elapsed > 0 ? `${elapsed}s ago` : 'just now'}
          </span>
        </div>

        {/* Tool input preview */}
        <div
          className="rounded p-3"
          style={{
            backgroundColor: 'var(--bg-deeper, rgba(0,0,0,0.2))',
            border: '1px solid var(--border)',
          }}
        >
          <ToolInputPreview toolName={current.toolName} input={current.toolInput} />
        </div>

        {/* Reject reason input */}
        {showRejectInput && (
          <div className="flex gap-2">
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleRejectWithReason();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowRejectInput(false);
                }
              }}
              placeholder="Rejection reason (optional)..."
              autoFocus
              className="flex-1 px-3 py-1.5 rounded text-sm"
              style={{
                backgroundColor: 'var(--bg)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                outline: 'none',
              }}
            />
            <button
              onClick={handleRejectWithReason}
              className="px-3 py-1.5 rounded text-sm font-medium"
              style={{
                backgroundColor: '#e06c75',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Confirm
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={() => onApprove(current.requestId)}
            className="flex-1 px-4 py-2 rounded text-sm font-medium transition-colors"
            style={{
              backgroundColor: '#98c379',
              color: '#1e1e1e',
              border: 'none',
              cursor: 'pointer',
            }}
            title="Approve (Enter or Y)"
          >
            Approve (Y)
          </button>
          <button
            onClick={() => {
              if (showRejectInput) {
                handleRejectWithReason();
              } else {
                setShowRejectInput(true);
              }
            }}
            className="flex-1 px-4 py-2 rounded text-sm font-medium transition-colors"
            style={{
              backgroundColor: '#e06c75',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
            title="Reject (Escape or N)"
          >
            Reject (N)
          </button>
          <button
            onClick={() => onAlwaysAllow(current.requestId, current.sessionId, current.toolName)}
            className="px-4 py-2 rounded text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--accent)',
              border: '1px solid var(--accent)',
              cursor: 'pointer',
            }}
            title="Always Allow this tool for this session (A)"
          >
            Always Allow (A)
          </button>
        </div>

        {/* Hint */}
        <div className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          Claude Code is waiting for your decision. The tool will not execute until you respond.
        </div>
      </div>
    </div>
  );
}
