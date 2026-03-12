/**
 * GitPanel.tsx — Main Git panel component for staged/unstaged changes,
 * branch switching, and commit creation.
 *
 * Polls git:statusDetailed every 3 seconds while visible.
 */

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useProject } from '../../contexts/ProjectContext';
import { BranchSelector } from './BranchSelector';
import { GitFileRow } from './GitFileRow';

export const GitPanel = memo(function GitPanel(): React.ReactElement {
  const { projectRoot } = useProject();

  const [staged, setStaged] = useState<Record<string, string>>({});
  const [unstaged, setUnstaged] = useState<Record<string, string>>({});
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [isRepo, setIsRepo] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Refresh status ──────────────────────────────────────────────────────────

  const refreshStatus = useCallback(async () => {
    if (!projectRoot) return;

    try {
      const [statusRes, branchRes] = await Promise.all([
        window.electronAPI.git.statusDetailed(projectRoot),
        window.electronAPI.git.branch(projectRoot),
      ]);

      if (statusRes.success) {
        setStaged(statusRes.staged ?? {});
        setUnstaged(statusRes.unstaged ?? {});
        setError(null);
      } else {
        setError(statusRes.error ?? 'Failed to get status');
      }

      if (branchRes.success) {
        setCurrentBranch(branchRes.branch ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [projectRoot]);

  // ── Check if directory is a git repo ────────────────────────────────────────

  useEffect(() => {
    if (!projectRoot) {
      setIsRepo(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const res = await window.electronAPI.git.isRepo(projectRoot);
        if (!cancelled) {
          setIsRepo(res.isRepo ?? false);
          if (res.isRepo) {
            await refreshStatus();
            // Also load branches
            const branchRes = await window.electronAPI.git.branches(projectRoot);
            if (branchRes.success && branchRes.branches) {
              setBranches(branchRes.branches);
            }
          }
        }
      } catch {
        if (!cancelled) setIsRepo(false);
      }
    })();

    return () => { cancelled = true; };
  }, [projectRoot, refreshStatus]);

  // ── Poll every 3 seconds ────────────────────────────────────────────────────

  useEffect(() => {
    if (!projectRoot || !isRepo) return;

    const interval = setInterval(() => {
      void refreshStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [projectRoot, isRepo, refreshStatus]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleStageFile = useCallback(async (filePath: string) => {
    if (!projectRoot) return;
    await window.electronAPI.git.stage(projectRoot, filePath);
    void refreshStatus();
  }, [projectRoot, refreshStatus]);

  const handleUnstageFile = useCallback(async (filePath: string) => {
    if (!projectRoot) return;
    await window.electronAPI.git.unstage(projectRoot, filePath);
    void refreshStatus();
  }, [projectRoot, refreshStatus]);

  const handleStageAll = useCallback(async () => {
    if (!projectRoot) return;
    await window.electronAPI.git.stageAll(projectRoot);
    void refreshStatus();
  }, [projectRoot, refreshStatus]);

  const handleUnstageAll = useCallback(async () => {
    if (!projectRoot) return;
    await window.electronAPI.git.unstageAll(projectRoot);
    void refreshStatus();
  }, [projectRoot, refreshStatus]);

  const handleDiscardFile = useCallback(async (filePath: string) => {
    if (!projectRoot) return;
    await window.electronAPI.git.discardFile(projectRoot, filePath);
    void refreshStatus();
  }, [projectRoot, refreshStatus]);

  const handleCheckout = useCallback(async (branch: string) => {
    if (!projectRoot) return;
    const res = await window.electronAPI.git.checkout(projectRoot, branch);
    if (!res.success) {
      setError(res.error ?? 'Checkout failed');
    }
    void refreshStatus();
    // Refresh branches too
    const branchRes = await window.electronAPI.git.branches(projectRoot);
    if (branchRes.success && branchRes.branches) {
      setBranches(branchRes.branches);
    }
  }, [projectRoot, refreshStatus]);

  const handleCommit = useCallback(async () => {
    if (!projectRoot || !commitMessage.trim() || Object.keys(staged).length === 0) return;

    setIsCommitting(true);
    try {
      const res = await window.electronAPI.git.commit(projectRoot, commitMessage.trim());
      if (res.success) {
        setCommitMessage('');
        setError(null);
      } else {
        setError(res.error ?? 'Commit failed');
      }
      void refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed');
    } finally {
      setIsCommitting(false);
    }
  }, [projectRoot, commitMessage, staged, refreshStatus]);

  // Handle Ctrl+Enter to commit
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleCommit();
    }
  }, [handleCommit]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const stagedFiles = Object.entries(staged).sort(([a], [b]) => a.localeCompare(b));
  const unstagedFiles = Object.entries(unstaged).sort(([a], [b]) => a.localeCompare(b));
  const stagedCount = stagedFiles.length;
  const unstagedCount = unstagedFiles.length;
  const canCommit = stagedCount > 0 && commitMessage.trim().length > 0 && !isCommitting;

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!projectRoot) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          No project open
        </span>
      </div>
    );
  }

  if (isRepo === false) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <span className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
          Not a git repository
        </span>
      </div>
    );
  }

  if (isRepo === null) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Loading...
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ fontSize: '12px' }}>
      {/* Branch selector */}
      <div className="flex-shrink-0 px-2 py-2 border-b border-[var(--border)]">
        <BranchSelector
          currentBranch={currentBranch}
          branches={branches}
          onCheckout={handleCheckout}
        />
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="flex-shrink-0 px-2 py-1 text-xs border-b border-[var(--border)]"
          style={{ color: 'var(--error, #f85149)', backgroundColor: 'rgba(248, 81, 73, 0.1)' }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 underline"
            style={{ color: 'var(--error, #f85149)' }}
          >
            dismiss
          </button>
        </div>
      )}

      {/* Scrollable file lists */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Staged Changes */}
        <div className="border-b border-[var(--border)]">
          <div className="flex items-center justify-between px-2 py-1.5 sticky top-0 bg-[var(--bg-secondary)] z-10">
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Staged ({stagedCount})
            </span>
            {stagedCount > 0 && (
              <button
                onClick={() => void handleUnstageAll()}
                className="text-xs px-1.5 py-0.5 rounded hover:bg-[var(--bg-tertiary)] transition-colors duration-75"
                style={{ color: 'var(--text-muted)' }}
                title="Unstage all"
              >
                Unstage All
              </button>
            )}
          </div>

          {stagedCount === 0 ? (
            <div className="px-2 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              No staged changes
            </div>
          ) : (
            stagedFiles.map(([filePath, status]) => (
              <GitFileRow
                key={`staged-${filePath}`}
                filePath={filePath}
                status={status}
                isStaged={true}
                onToggle={handleUnstageFile}
              />
            ))
          )}
        </div>

        {/* Unstaged Changes */}
        <div>
          <div className="flex items-center justify-between px-2 py-1.5 sticky top-0 bg-[var(--bg-secondary)] z-10">
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Changes ({unstagedCount})
            </span>
            {unstagedCount > 0 && (
              <button
                onClick={() => void handleStageAll()}
                className="text-xs px-1.5 py-0.5 rounded hover:bg-[var(--bg-tertiary)] transition-colors duration-75"
                style={{ color: 'var(--text-muted)' }}
                title="Stage all"
              >
                Stage All
              </button>
            )}
          </div>

          {unstagedCount === 0 ? (
            <div className="px-2 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              No changes
            </div>
          ) : (
            unstagedFiles.map(([filePath, status]) => (
              <GitFileRow
                key={`unstaged-${filePath}`}
                filePath={filePath}
                status={status}
                isStaged={false}
                onToggle={handleStageFile}
                onDiscard={handleDiscardFile}
              />
            ))
          )}
        </div>
      </div>

      {/* Commit area */}
      <div className="flex-shrink-0 border-t border-[var(--border)] p-2">
        <textarea
          ref={textareaRef}
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Commit message..."
          rows={3}
          className="
            w-full px-2 py-1.5 text-xs rounded resize-none
            border border-[var(--border)]
            bg-[var(--bg)] text-[var(--text)]
            placeholder:text-[var(--text-muted)]
            focus:outline-none focus:border-[var(--accent)]
            transition-colors duration-100
          "
          style={{ fontFamily: 'var(--font-mono, monospace)' }}
        />
        <button
          onClick={() => void handleCommit()}
          disabled={!canCommit}
          className="
            w-full mt-1.5 px-3 py-1.5 text-xs font-medium rounded
            transition-colors duration-100
            disabled:opacity-40 disabled:cursor-not-allowed
          "
          style={{
            backgroundColor: canCommit ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: canCommit ? 'var(--bg)' : 'var(--text-muted)',
          }}
          title={stagedCount === 0 ? 'No staged changes' : commitMessage.trim() ? 'Commit (Ctrl+Enter)' : 'Enter a commit message'}
        >
          {isCommitting ? 'Committing...' : `Commit${stagedCount > 0 ? ` (${stagedCount} file${stagedCount !== 1 ? 's' : ''})` : ''}`}
        </button>
      </div>
    </div>
  );
});
