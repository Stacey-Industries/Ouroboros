/**
 * ConversationTurnRow.tsx — Single conversation turn row for the tool call feed.
 */

import React, { memo } from 'react';

import type { ConversationTurn } from './types';

interface ConversationTurnRowProps {
  turn: ConversationTurn;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function turnLabel(turn: ConversationTurn): string {
  switch (turn.type) {
    case 'prompt':
      return 'You:';
    case 'elicitation':
      return 'Agent asks:';
    case 'elicitation_result':
      return 'You answered:';
  }
}

function turnContent(turn: ConversationTurn): string {
  if (turn.type === 'elicitation' && turn.question) return turn.question;
  return turn.content;
}

function labelColor(type: ConversationTurn['type']): string {
  if (type === 'elicitation') return 'var(--interactive-accent)';
  return 'var(--text-faint)';
}

export const ConversationTurnRow = memo(function ConversationTurnRow({
  turn,
}: ConversationTurnRowProps): React.ReactElement<unknown> {
  const color = labelColor(turn.type);
  const label = turnLabel(turn);
  const content = turnContent(turn);
  const ts = formatTimestamp(turn.timestamp);

  return (
    <div
      className="flex items-center gap-2 px-3 py-1 text-[11px] leading-snug"
      style={{ minHeight: '28px' }}
    >
      <span
        className="shrink-0 font-mono text-[10px]"
        style={{ color, width: '10px' }}
        aria-hidden="true"
      >
        {'\u25b8'}
      </span>
      <span
        className="shrink-0 text-[10px] font-medium"
        style={{ color }}
      >
        {label}
      </span>
      <span
        className="flex-1 min-w-0 truncate text-text-semantic-muted"
        title={content}
      >
        {content}
      </span>
      <span
        className="shrink-0 text-[10px] tabular-nums text-text-semantic-faint"
      >
        {ts}
      </span>
    </div>
  );
});
