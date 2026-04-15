/**
 * SessionFilterBar — filter controls for the session sidebar (Wave 20 Phase E).
 *
 * Renders status segmented control, project text input, and worktree toggle.
 * All state is owned by the parent (controlled component).
 */

import React, { useCallback } from 'react';

import type { FilterState, StatusFilter, WorktreeFilter } from './sessionFilters';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SessionFilterBarProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
}

// ─── Option constants ─────────────────────────────────────────────────────────

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'queued', label: 'Queued' },
  { value: 'errored', label: 'Errored' },
];

const WORKTREE_OPTIONS: Array<{ value: WorktreeFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'worktree', label: 'Worktree' },
  { value: 'no-worktree', label: 'None' },
];

// ─── SegmentedControl ─────────────────────────────────────────────────────────

interface SegmentProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}

function SegmentedControl<T extends string>({
  options, value, onChange, label,
}: SegmentProps<T>): React.ReactElement {
  const activeCls = 'bg-interactive-accent text-text-on-accent';
  const inactiveCls = 'bg-surface-inset text-text-semantic-muted hover:bg-surface-hover';
  return (
    <div role="group" aria-label={label} className="flex gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={opt.value === value}
          onClick={() => onChange(opt.value)}
          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${opt.value === value ? activeCls : inactiveCls}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── ProjectInput ─────────────────────────────────────────────────────────────

interface ProjectInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function ProjectInput({ value, onChange }: ProjectInputProps): React.ReactElement {
  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder="Filter by project…"
      aria-label="Filter by project name"
      className="w-full text-xs px-2 py-1 rounded bg-surface-inset border border-border-subtle
        text-text-semantic-primary placeholder-text-semantic-faint focus:outline-none
        focus:border-border-accent"
    />
  );
}

// ─── SessionFilterBar ─────────────────────────────────────────────────────────

export function SessionFilterBar({
  filters, onChange,
}: SessionFilterBarProps): React.ReactElement {
  const setStatus = useCallback(
    (status: StatusFilter) => onChange({ ...filters, status }),
    [filters, onChange],
  );
  const setWorktree = useCallback(
    (worktree: WorktreeFilter) => onChange({ ...filters, worktree }),
    [filters, onChange],
  );
  const setProject = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...filters, project: e.target.value }),
    [filters, onChange],
  );
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 border-b border-border-subtle" aria-label="Session filters">
      <SegmentedControl label="Filter by status" options={STATUS_OPTIONS} value={filters.status} onChange={setStatus} />
      <ProjectInput value={filters.project} onChange={setProject} />
      <SegmentedControl label="Filter by worktree" options={WORKTREE_OPTIONS} value={filters.worktree} onChange={setWorktree} />
    </div>
  );
}
