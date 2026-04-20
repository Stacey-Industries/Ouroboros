/**
 * ChatHistoryStatusDot — per-thread status indicator (Wave 44 Phase B).
 *
 * Maps AgentChatThreadStatus to a coloured 8px dot.
 * 'running' pulses via CSS keyframes. Transitions are debounced 200ms to
 * prevent flicker on rapid status changes.
 *
 * Colour mapping:
 *   running       → --status-success (green) + pulse animation
 *   submitting    → --status-success (green) + pulse animation
 *   verifying     → --status-warning (yellow) + pulse animation
 *   needs_review  → --status-warning (yellow)
 *   failed        → --status-error (red)
 *   cancelled     → --text-semantic-muted (dim)
 *   complete      → --text-semantic-muted (dim)
 *   idle          → --text-semantic-muted (dim)
 */

import React, { useEffect, useRef, useState } from 'react';

import type { AgentChatThreadStatus } from '../../../types/electron';

// ── Dot style resolution ──────────────────────────────────────────────────────

type DotStyle = {
  color: string;
  pulse: boolean;
};

function resolveDotStyle(status: AgentChatThreadStatus): DotStyle {
  switch (status) {
    case 'running':
    case 'submitting':
      return { color: 'var(--status-success)', pulse: true };
    case 'verifying':
      return { color: 'var(--status-warning)', pulse: true };
    case 'needs_review':
      return { color: 'var(--status-warning)', pulse: false };
    case 'failed':
      return { color: 'var(--status-error)', pulse: false };
    default:
      // idle, complete, cancelled
      return { color: 'var(--text-semantic-muted)', pulse: false };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface ChatHistoryStatusDotProps {
  status: AgentChatThreadStatus;
}

export function ChatHistoryStatusDot({ status }: ChatHistoryStatusDotProps): React.ReactElement {
  // Debounce style transitions 200ms to avoid flicker on rapid status changes.
  const [displayStyle, setDisplayStyle] = useState<DotStyle>(() => resolveDotStyle(status));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const next = resolveDotStyle(status);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { setDisplayStyle(next); }, 200);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [status]);

  return (
    <span
      data-testid="status-dot"
      data-status={status}
      aria-hidden="true"
      className={displayStyle.pulse ? 'chat-status-dot chat-status-dot--pulse' : 'chat-status-dot'}
      style={{ backgroundColor: displayStyle.color }}
    />
  );
}
