import React, { useState } from 'react';

import { useWorkbenchTimeline } from './useWorkbenchTimeline';

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function toneClasses(tone: 'neutral' | 'success' | 'warning' | 'error'): string {
  if (tone === 'error') return 'border-status-error bg-status-error-subtle/60 text-status-error';
  if (tone === 'warning')
    return 'border-status-warning bg-status-warning-subtle/60 text-status-warning';
  if (tone === 'success')
    return 'border-status-success bg-status-success-subtle/60 text-status-success';
  return 'border-border-semantic bg-surface-panel/80 text-text-semantic-secondary';
}

function EmptyState(): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-semantic-secondary">
      No timeline entries yet.
    </div>
  );
}

function TimelineHeader({ totalCount }: { totalCount: number }): React.ReactElement {
  return (
    <div className="border-b border-border-semantic-subtle px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-semantic-tertiary">
        Timeline
      </div>
      <div className="mt-1 text-xs text-text-semantic-secondary">
        {totalCount} derived events from renderer state
      </div>
    </div>
  );
}

// Chevron icon — rotates 90° when expanded.
function Chevron({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      className={`shrink-0 text-text-semantic-tertiary transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
    >
      <path
        d="M3 2l4 3-4 3"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type EntryType = ReturnType<typeof useWorkbenchTimeline>['entries'][number];

function EntryDetail({ entry }: { entry: EntryType }): React.ReactElement | null {
  if (!entry.detail) return null;
  return (
    <div className="border-t border-border-semantic-subtle px-3 pb-2 pt-1.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 break-words font-mono text-[11px] text-text-semantic-secondary">
          {entry.detail}
        </div>
        <div className="shrink-0 text-[11px] text-text-semantic-tertiary">{entry.sessionLabel}</div>
      </div>
    </div>
  );
}

function TimelineEntryCard({ entry }: { entry: EntryType }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  return (
    <article
      className={`rounded-2xl border ${toneClasses(entry.tone)}`}
      data-testid="timeline-entry-card"
      data-expanded={expanded}
    >
      <button
        type="button"
        aria-expanded={expanded}
        className="flex w-full cursor-pointer select-none items-center gap-2 px-3 py-1.5 text-left"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <Chevron expanded={expanded} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">
          {entry.kindLabel}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-semantic-primary">
          {entry.title}
        </span>
        <span className="shrink-0 text-[11px] text-text-semantic-tertiary">
          {formatTime(entry.timestamp)}
        </span>
      </button>
      {expanded && <EntryDetail entry={entry} />}
    </article>
  );
}

function TimelineEntryList({
  entries,
}: {
  entries: ReturnType<typeof useWorkbenchTimeline>['visibleEntries'];
}): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
      {entries.map((entry) => (
        <TimelineEntryCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

export function WorkbenchTimelinePanel(): React.ReactElement {
  const { visibleEntries, totalCount } = useWorkbenchTimeline();

  if (totalCount === 0) return <EmptyState />;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="workbench-timeline-panel"
    >
      <TimelineHeader totalCount={totalCount} />
      <TimelineEntryList entries={visibleEntries} />
    </div>
  );
}
