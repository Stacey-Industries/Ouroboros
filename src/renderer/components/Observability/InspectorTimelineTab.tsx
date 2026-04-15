/**
 * InspectorTimelineTab.tsx — Hook event timeline grouped by correlationId.
 *
 * Loads telemetry events for the active session, groups them by correlationId,
 * and renders a flat list with left-border accent for grouped rows.
 * Click a row to expand its full JSON payload.
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { TelemetryEvent } from '../../types/electron-telemetry';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function deriveSummary(event: TelemetryEvent): string {
  if (event.payload !== null && typeof event.payload === 'object') {
    const p = event.payload as Record<string, unknown>;
    if (typeof p.toolName === 'string') return p.toolName;
    if (typeof p.tool_name === 'string') return p.tool_name;
  }
  return event.type;
}

interface GroupedEvent {
  event: TelemetryEvent;
  isGrouped: boolean;
}

function groupEvents(events: TelemetryEvent[]): GroupedEvent[] {
  const corrCounts = new Map<string, number>();
  for (const ev of events) {
    corrCounts.set(ev.correlationId, (corrCounts.get(ev.correlationId) ?? 0) + 1);
  }
  return events.map((event) => ({
    event,
    isGrouped: (corrCounts.get(event.correlationId) ?? 0) > 1,
  }));
}

// ─── Row ──────────────────────────────────────────────────────────────────────

interface EventRowProps {
  item: GroupedEvent;
  expanded: boolean;
  onToggle: (id: string) => void;
}

function EventRow({ item, expanded, onToggle }: EventRowProps): React.ReactElement {
  const { event, isGrouped } = item;
  return (
    <div
      className={`cursor-pointer border-b border-border-subtle px-3 py-1.5 text-xs hover:bg-surface-hover ${isGrouped ? 'border-l-2 border-l-interactive-accent pl-4' : ''}`}
      onClick={() => onToggle(event.id)}
    >
      <div className="flex items-center gap-3">
        <span className="w-16 shrink-0 tabular-nums text-text-semantic-muted">
          {formatTimestamp(event.timestamp)}
        </span>
        <span className="w-36 shrink-0 truncate font-mono text-text-semantic-secondary">
          {event.type}
        </span>
        <span className="min-w-0 flex-1 truncate text-text-semantic-muted">
          {deriveSummary(event)}
        </span>
      </div>
      {expanded && (
        <pre className="mt-1.5 max-h-48 overflow-auto rounded bg-surface-inset p-2 text-[10px] text-text-semantic-primary">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState(): React.ReactElement {
  return (
    <div className="flex h-full items-center justify-center p-8 text-sm text-text-semantic-muted">
      No events yet. Start an agent session to see activity here.
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface InspectorTimelineTabProps {
  sessionId: string;
}

function useEventQuery(sessionId: string): { events: TelemetryEvent[]; loading: boolean } {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    window.electronAPI.telemetry
      .queryEvents({ sessionId, limit: 100 })
      .then((result) => setEvents(result.events ?? []))
      .catch((err: unknown) => {
        console.error('[InspectorTimelineTab] queryEvents error:', err);
        setEvents([]);
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  return { events, loading };
}

function useExpandToggle(): { expandedIds: Set<string>; handleToggle: (id: string) => void } {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  return { expandedIds, handleToggle };
}

export function InspectorTimelineTab({
  sessionId,
}: InspectorTimelineTabProps): React.ReactElement {
  const { events, loading } = useEventQuery(sessionId);
  const { expandedIds, handleToggle } = useExpandToggle();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-semantic-muted">
        Loading…
      </div>
    );
  }

  const grouped = groupEvents(events);
  if (grouped.length === 0) return <EmptyState />;

  return (
    <div className="h-full overflow-y-auto">
      {grouped.map((item) => (
        <EventRow
          key={item.event.id}
          item={item}
          expanded={expandedIds.has(item.event.id)}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}
