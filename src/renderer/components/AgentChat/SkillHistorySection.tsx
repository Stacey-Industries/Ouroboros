import type { SkillExecutionRecord } from '@shared/types/ruleActivity';
import React, { useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLLAPSED_LIMIT = 3;

// ---------------------------------------------------------------------------
// Duration formatter
// ---------------------------------------------------------------------------

function formatSkillDuration(record: SkillExecutionRecord): string {
  if (record.status === 'running') return 'running\u2026';
  if (record.durationMs == null) return '\u2014';
  if (record.durationMs < 1000) return `${record.durationMs}ms`;
  return `${(record.durationMs / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Status icon
// ---------------------------------------------------------------------------

function SkillStatusIcon({ status }: { status: SkillExecutionRecord['status'] }): React.ReactElement<any> {
  if (status === 'running') {
    return <span className="inline-block h-3.5 w-3.5 animate-pulse rounded-full bg-text-semantic-faint" />;
  }
  if (status === 'completed') {
    return <span className="text-status-success">{'\u2713'}</span>;
  }
  return <span className="text-status-error">{'\u2717'}</span>;
}

// ---------------------------------------------------------------------------
// Single skill row
// ---------------------------------------------------------------------------

function SkillRow({ record }: { record: SkillExecutionRecord }): React.ReactElement<any> {
  return (
    <div className="flex items-center gap-2 rounded border border-border-semantic px-2.5 py-2 text-xs">
      <SkillStatusIcon status={record.status} />
      <span className="min-w-0 flex-1 truncate text-text-semantic-primary" title={record.skillName}>
        {record.skillName}
      </span>
      <span className="shrink-0 rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-text-semantic-muted">
        {record.agentType}
      </span>
      <span className="shrink-0 text-text-semantic-muted">
        {formatSkillDuration(record)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle button for expand/collapse
// ---------------------------------------------------------------------------

function ToggleButton(props: {
  expanded: boolean;
  hiddenCount: number;
  onToggle: () => void;
}): React.ReactElement<any> {
  const label = props.expanded
    ? 'Show less'
    : `Show ${props.hiddenCount} more`;

  return (
    <button
      onClick={props.onToggle}
      className="mt-1 text-[11px] text-interactive-accent transition-opacity hover:opacity-80"
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Skill list (handles collapse logic)
// ---------------------------------------------------------------------------

function SkillList({ records }: { records: SkillExecutionRecord[] }): React.ReactElement<any> {
  const [expanded, setExpanded] = useState(false);
  const needsCollapse = records.length > COLLAPSED_LIMIT;
  const visible = expanded ? records : records.slice(0, COLLAPSED_LIMIT);
  const hiddenCount = records.length - COLLAPSED_LIMIT;

  return (
    <div className="mt-2 space-y-2">
      {visible.map((record) => (
        <SkillRow key={`${record.skillName}-${record.startedAt}`} record={record} />
      ))}
      {needsCollapse ? (
        <ToggleButton
          expanded={expanded}
          hiddenCount={hiddenCount}
          onToggle={() => setExpanded((prev) => !prev)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public section component
// ---------------------------------------------------------------------------

export interface SkillHistorySectionProps {
  skillExecutions: SkillExecutionRecord[];
}

export function SkillHistorySection({ skillExecutions }: SkillHistorySectionProps): React.ReactElement<any> | null {
  const sorted = useMemo(
    () => [...skillExecutions].sort((a, b) => b.startedAt - a.startedAt),
    [skillExecutions],
  );

  if (sorted.length === 0) return null;

  return (
    <section className="rounded border border-border-semantic bg-surface-base px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-semantic-muted">Skills</div>
      <SkillList records={sorted} />
    </section>
  );
}
