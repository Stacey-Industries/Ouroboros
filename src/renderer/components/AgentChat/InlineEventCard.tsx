/**
 * InlineEventCard.tsx — Renders a matching agent event inline in the chat stream.
 *
 * Small card: event type icon + short description + timestamp.
 * Interleaved between chat messages when the event type is in inlineEventTypes
 * and the event timestamp falls between adjacent messages.
 */

import React, { memo } from 'react';

import type { AgentEventType } from '../../types/electron-foundation';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InlineEventCardData {
  id: string;
  type: AgentEventType | string;
  timestamp: number;
  description?: string;
}

export interface InlineEventCardProps {
  event: InlineEventCardData;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function describeEvent(type: string, description?: string): string {
  if (description) return description;
  switch (type) {
    case 'pre_tool_use': return 'Tool invoked';
    case 'post_tool_use_failure': return 'Tool failed';
    case 'user_prompt_submit': return 'User prompt submitted';
    case 'notification': return 'Agent notification';
    case 'session_start': return 'Session started';
    case 'session_end': return 'Session ended';
    default: return type.replace(/_/g, ' ');
  }
}

// ─── Icon ─────────────────────────────────────────────────────────────────────

function EventIcon({ type }: { type: string }): React.ReactElement {
  const isFailure = type === 'post_tool_use_failure';
  const isNotification = type === 'notification';
  const color = isFailure
    ? 'var(--status-error)'
    : isNotification
      ? 'var(--status-info)'
      : 'var(--text-faint)';

  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      style={{ color, flexShrink: 0 }}
    >
      {isFailure ? (
        <path
          d="M5 1L9 9H1L5 1Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      ) : (
        <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" />
      )}
    </svg>
  );
}

// ─── InlineEventCard ──────────────────────────────────────────────────────────

export const InlineEventCard = memo(function InlineEventCard({
  event,
}: InlineEventCardProps): React.ReactElement {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1 mx-4 my-0.5 rounded"
      style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)' }}
      role="status"
      aria-label={`Agent event: ${describeEvent(event.type, event.description)}`}
    >
      <EventIcon type={event.type} />
      <span
        className="flex-1 min-w-0 text-[10px] truncate"
        style={{ color: 'var(--text-muted)' }}
      >
        {describeEvent(event.type, event.description)}
      </span>
      <span
        className="shrink-0 text-[10px] tabular-nums"
        style={{ color: 'var(--text-faint)' }}
      >
        {formatTime(event.timestamp)}
      </span>
    </div>
  );
});
