import React, { useMemo, useState } from 'react';

import { useWorkbenchTimeline } from './useWorkbenchTimeline';

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDurationMs(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1_000)}s`;
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

function TimelineHeader({
  totalCount,
  sessionCount,
}: {
  totalCount: number;
  sessionCount: number;
}): React.ReactElement {
  return (
    <div className="border-b border-border-semantic-subtle px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-semantic-tertiary">
        Timeline
      </div>
      <div className="mt-1 text-xs text-text-semantic-secondary">
        {totalCount} events across {sessionCount} session{sessionCount === 1 ? '' : 's'}
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

interface SessionGroup {
  sessionId: string;
  sessionLabel: string;
  entries: EntryType[];
  startedAt: number;
  endedAt: number;
  errorCount: number;
  toolCount: number;
}

function buildSessionGroups(entries: EntryType[]): SessionGroup[] {
  const map = new Map<string, SessionGroup>();
  for (const entry of entries) {
    const existing = map.get(entry.sessionId);
    if (existing) {
      existing.entries.push(entry);
      existing.startedAt = Math.min(existing.startedAt, entry.timestamp);
      existing.endedAt = Math.max(existing.endedAt, entry.timestamp);
      if (entry.tone === 'error') existing.errorCount += 1;
      if (entry.kind === 'tool' || entry.kind === 'subtool') existing.toolCount += 1;
    } else {
      map.set(entry.sessionId, {
        sessionId: entry.sessionId,
        sessionLabel: entry.sessionLabel,
        entries: [entry],
        startedAt: entry.timestamp,
        endedAt: entry.timestamp,
        errorCount: entry.tone === 'error' ? 1 : 0,
        toolCount: entry.kind === 'tool' || entry.kind === 'subtool' ? 1 : 0,
      });
    }
  }
  // Most-recent session first (by endedAt).
  return [...map.values()].sort((a, b) => b.endedAt - a.endedAt);
}

function SessionDigest({ group }: { group: SessionGroup }): React.ReactElement {
  return (
    <span className="flex items-center gap-2 text-[11px] text-text-semantic-tertiary">
      <span className="tabular-nums">{group.entries.length} events</span>
      <span aria-hidden="true">·</span>
      <span className="tabular-nums">{group.toolCount} tool calls</span>
      {group.errorCount > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <span className="text-status-error tabular-nums">
            {group.errorCount} error{group.errorCount === 1 ? '' : 's'}
          </span>
        </>
      )}
      <span aria-hidden="true">·</span>
      <span className="tabular-nums">{formatDurationMs(group.endedAt - group.startedAt)}</span>
    </span>
  );
}

function SessionGroupCard({ group }: { group: SessionGroup }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  return (
    <section
      className="shrink-0 rounded-2xl border border-border-semantic bg-surface-panel/40"
      data-testid="timeline-session-group"
      data-session-id={group.sessionId}
      data-expanded={expanded}
    >
      <button
        type="button"
        aria-expanded={expanded}
        className="flex w-full cursor-pointer select-none items-center gap-2 px-3 py-2 text-left"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <Chevron expanded={expanded} />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-text-semantic-primary">
          {group.sessionLabel}
        </span>
        <SessionDigest group={group} />
      </button>
      {expanded && (
        // Wave 82 (post-smoke): per-session content scrolls independently when
        // the entry list is large. max-h ~50vh keeps the surrounding session
        // groups partially visible.
        <div
          className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto border-t border-border-semantic-subtle px-2 py-2"
          data-testid="timeline-session-entries"
        >
          {group.entries.map((entry) => (
            <TimelineEntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}

function TimelineGroupList({ entries }: { entries: EntryType[] }): React.ReactElement {
  const groups = useMemo(() => buildSessionGroups(entries), [entries]);
  // Wave 82 (post-smoke): added min-h-0 so flex-1 actually computes a bounded
  // height; without it the parent's overflow:hidden + child's overflow-y-auto
  // collapsed to "no scroll possible" because flex-1 took content height.
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
      {groups.map((group) => (
        <SessionGroupCard key={group.sessionId} group={group} />
      ))}
    </div>
  );
}

export function WorkbenchTimelinePanel(): React.ReactElement {
  const { visibleEntries, totalCount } = useWorkbenchTimeline();
  const sessionCount = useMemo(
    () => new Set(visibleEntries.map((e) => e.sessionId)).size,
    [visibleEntries],
  );

  if (totalCount === 0) return <EmptyState />;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="workbench-timeline-panel"
    >
      <TimelineHeader totalCount={totalCount} sessionCount={sessionCount} />
      <TimelineGroupList entries={visibleEntries} />
    </div>
  );
}
