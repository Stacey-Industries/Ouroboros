import React from 'react';

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

function TimelineEntryCard({
  entry,
}: {
  entry: ReturnType<typeof useWorkbenchTimeline>['entries'][number];
}): React.ReactElement {
  return (
    <article className={`rounded-2xl border px-3 py-3 ${toneClasses(entry.tone)}`}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">
          {entry.kindLabel}
        </span>
        <span className="ml-auto text-[11px] text-text-semantic-tertiary">
          {formatTime(entry.timestamp)}
        </span>
      </div>
      <div className="mt-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs text-text-semantic-primary">{entry.title}</div>
          {entry.detail && (
            <div className="mt-1 break-words font-mono text-[11px] text-text-semantic-secondary">
              {entry.detail}
            </div>
          )}
        </div>
        <div className="shrink-0 text-[11px] text-text-semantic-tertiary">{entry.sessionLabel}</div>
      </div>
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
