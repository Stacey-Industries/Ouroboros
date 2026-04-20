/**
 * ChatOnlyStatusBar — Minimal status bar for chat-only shell (Wave 42).
 *
 * Shows: git branch, token usage summary (active sessions), and a
 * "N pending diffs" button that opens the DiffReviewPanel overlay.
 * The diff button is hidden when pending count is 0.
 */

import React from 'react';

import { useAgentEventsContext } from '../../../contexts/AgentEventsContext';
import { useGitBranch } from '../../../hooks/useGitBranch';
import { useDiffReview } from '../../DiffReview/DiffReviewManager';

// ── BranchIcon ────────────────────────────────────────────────────────────────

function BranchIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="4" cy="3" r="1.5" />
      <circle cx="4" cy="13" r="1.5" />
      <circle cx="12" cy="6" r="1.5" />
      <line x1="4" y1="4.5" x2="4" y2="11.5" />
      <path d="M4 4.5 C4 8 12 6.5 12 7.5" />
    </svg>
  );
}

// ── GitBranchItem ─────────────────────────────────────────────────────────────

function GitBranchItem({ branch }: { branch: string | null }): React.ReactElement | null {
  if (!branch) return null;
  return (
    <span className="flex items-center gap-1 text-text-semantic-muted">
      <BranchIcon />
      <span className="truncate max-w-[120px]">{branch}</span>
    </span>
  );
}

// ── TokenUsageItem ────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function TokenUsageItem({ sessions }: { sessions: ReturnType<typeof useAgentEventsContext>['currentSessions'] }): React.ReactElement | null {
  const running = sessions.filter((s) => s.status === 'running');
  if (running.length === 0) return null;
  const totalTokens = running.reduce((sum, s) => sum + s.inputTokens + s.outputTokens, 0);
  if (totalTokens === 0) return null;
  return (
    <span className="text-text-semantic-muted" title={`${totalTokens.toLocaleString()} tokens in active sessions`}>
      {formatTokens(totalTokens)} tokens
    </span>
  );
}

// ── DiffButton ────────────────────────────────────────────────────────────────

function DiffButton({ count, onOpen }: { count: number; onOpen: () => void }): React.ReactElement | null {
  if (count === 0) return null;
  return (
    <button
      className="flex items-center gap-1 px-2 rounded text-xs text-status-warning hover:bg-status-warning-subtle transition-colors"
      onClick={onOpen}
      data-testid="diff-review-button"
      title={`${count} pending diff${count === 1 ? '' : 's'} — click to review`}
    >
      {count} pending diff{count === 1 ? '' : 's'}
    </button>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ChatOnlyStatusBarProps {
  projectRoot: string | null;
  onOpenDiffOverlay: () => void;
}

// ── ChatOnlyStatusBar ─────────────────────────────────────────────────────────

function usePendingDiffCount(): number {
  const { state } = useDiffReview();
  if (!state) return 0;
  return state.files.filter((f) => f.hunks.some((h) => h.decision === 'pending')).length;
}

export function ChatOnlyStatusBar({ projectRoot, onOpenDiffOverlay }: ChatOnlyStatusBarProps): React.ReactElement {
  const { branch } = useGitBranch(projectRoot);
  const { currentSessions } = useAgentEventsContext();
  const pendingDiffCount = usePendingDiffCount();

  return (
    <footer
      className="flex items-center h-6 px-3 gap-3 border-t border-border-semantic bg-surface-panel text-xs shrink-0"
      data-testid="chat-only-status-bar"
    >
      <GitBranchItem branch={branch} />
      <TokenUsageItem sessions={currentSessions} />
      <div className="flex-1" />
      <DiffButton count={pendingDiffCount} onOpen={onOpenDiffOverlay} />
    </footer>
  );
}
