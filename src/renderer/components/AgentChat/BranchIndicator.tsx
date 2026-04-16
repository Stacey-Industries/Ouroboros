/**
 * BranchIndicator.tsx — Wave 23 Phase B
 *
 * Rendered between messages at a branch-fork point. Shows which child threads
 * diverge at a given messageId. Clicking a branch switches to that thread.
 */
import React, { useCallback, useState } from 'react';

export interface BranchForkEntry {
  threadId: string;
  branchName: string;
}

export interface BranchIndicatorProps {
  forks: BranchForkEntry[];
  currentThreadId: string;
  onSelect: (threadId: string) => void;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function BranchArrowIcon(): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ── Single-branch display ─────────────────────────────────────────────────────

function SingleBranchLabel({
  fork,
  onSelect,
}: {
  fork: BranchForkEntry;
  onSelect: (id: string) => void;
}): React.ReactElement {
  return (
    <button
      className="flex items-center gap-1 text-interactive-accent hover:opacity-80 transition-opacity"
      onClick={() => onSelect(fork.threadId)}
      title={`Switch to branch: ${fork.branchName}`}
    >
      <BranchArrowIcon />
      <span className="font-medium">{fork.branchName}</span>
    </button>
  );
}

// ── Multi-branch dropdown ─────────────────────────────────────────────────────

function MultiBranchDropdown({
  forks,
  onSelect,
  onClose,
}: {
  forks: BranchForkEntry[];
  onSelect: (id: string) => void;
  onClose: () => void;
}): React.ReactElement {
  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
      onClose();
    },
    [onSelect, onClose],
  );

  return (
    <div
      className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-md border border-border-subtle bg-surface-overlay py-1 shadow-lg"
      role="listbox"
      aria-label="Branch options"
    >
      {forks.map((fork) => (
        <button
          key={fork.threadId}
          role="option"
          aria-selected={false}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-semantic-primary hover:bg-surface-raised"
          onClick={() => handleSelect(fork.threadId)}
        >
          <BranchArrowIcon />
          <span className="truncate">{fork.branchName}</span>
        </button>
      ))}
    </div>
  );
}

function ChevronDownIcon(): React.ReactElement {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2 3.5L5 6.5L8 3.5" />
    </svg>
  );
}

function MultiBranchLabel({
  forks,
  onSelect,
}: {
  forks: BranchForkEntry[];
  onSelect: (id: string) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const handleToggle = useCallback(() => setOpen((v) => !v), []);
  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <div className="relative">
      <button
        className="flex items-center gap-1 text-interactive-accent hover:opacity-80 transition-opacity"
        onClick={handleToggle}
        title={`${forks.length} branches fork here`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <BranchArrowIcon />
        <span className="font-medium">{forks.length} branches</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <MultiBranchDropdown forks={forks} onSelect={onSelect} onClose={handleClose} />
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * BranchIndicator — renders a thin horizontal rule with branch links.
 * Shown after a message when one or more child threads fork at that message.
 * Threads that IS the current thread are omitted (no self-link).
 */
export function BranchIndicator({
  forks,
  currentThreadId,
  onSelect,
}: BranchIndicatorProps): React.ReactElement | null {
  const visible = forks.filter((f) => f.threadId !== currentThreadId);
  if (visible.length === 0) return null;

  return (
    <div className="flex items-center gap-2 py-1 text-[11px] text-text-semantic-muted">
      <div
        className="flex-1 border-t border-dashed"
        style={{ borderColor: 'var(--interactive-muted)' }}
        aria-hidden="true"
      />
      <div className="flex shrink-0 items-center gap-1">
        <span className="opacity-60">fork</span>
        {visible.length === 1 ? (
          <SingleBranchLabel fork={visible[0]} onSelect={onSelect} />
        ) : (
          <MultiBranchLabel forks={visible} onSelect={onSelect} />
        )}
      </div>
      <div
        className="flex-1 border-t border-dashed"
        style={{ borderColor: 'var(--interactive-muted)' }}
        aria-hidden="true"
      />
    </div>
  );
}
