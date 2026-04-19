/**
 * ReactionBar.tsx — Thumbs-up / thumbs-down reaction bar for message cards.
 *
 * Renders 👍 (+1) and 👎 (-1) buttons with count badges.
 * Uses optimistic state — updates locally on click, reconciles from IPC response.
 *
 * Wave 41 E.2 — threadId added to props to scope IPC calls by (messageId, threadId).
 */

import React, { useCallback, useState } from 'react';

import type { Reaction } from '../../types/electron';

// ── Constants ─────────────────────────────────────────────────────────────────

const KIND_THUMBS_UP = '+1';
const KIND_THUMBS_DOWN = '-1';

// ── Helpers ───────────────────────────────────────────────────────────────────

function countByKind(reactions: Reaction[], kind: string): number {
  return reactions.filter((r) => r.kind === kind).length;
}

function hasKind(reactions: Reaction[], kind: string): boolean {
  return reactions.some((r) => r.kind === kind);
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ReactionBtnProps {
  emoji: string;
  count: number;
  active: boolean;
  label: string;
  onClick: () => void;
}

function ReactionBtn(props: ReactionBtnProps): React.ReactElement {
  const activeClass = props.active
    ? 'bg-interactive-accent-subtle text-interactive-accent'
    : 'text-text-semantic-muted hover:bg-surface-hover hover:text-text-semantic-primary';

  return (
    <button
      type="button"
      title={props.label}
      aria-pressed={props.active}
      onClick={props.onClick}
      className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] transition-colors duration-100 ${activeClass}`}
    >
      <span aria-hidden="true">{props.emoji}</span>
      {props.count > 0 && <span>{props.count}</span>}
    </button>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function useReactionActions(
  messageId: string,
  threadId: string,
  reactions: Reaction[],
): [Reaction[], (kind: string) => void] {
  const [local, setLocal] = useState<Reaction[]>(reactions);

  // Sync when parent prop changes (e.g. after thread reload)
  React.useEffect(() => {
    setLocal(reactions);
  }, [reactions]);

  const toggle = useCallback(
    (kind: string) => {
      const active = hasKind(local, kind);
      const optimistic: Reaction[] = active
        ? local.filter((r) => r.kind !== kind)
        : [...local, { kind, at: Date.now() }];
      setLocal(optimistic);

      const call = active
        ? window.electronAPI.agentChat.removeMessageReaction(messageId, threadId, kind)
        : window.electronAPI.agentChat.addMessageReaction(messageId, threadId, kind);

      void call.then((result) => {
        if (result.reactions) setLocal(result.reactions);
      });
    },
    [messageId, threadId, local],
  );

  return [local, toggle];
}

// ── Public component ──────────────────────────────────────────────────────────

export interface ReactionBarProps {
  messageId: string;
  /** Wave 41 E.2 — threadId scopes reaction SQL to prevent cross-fork leakage. */
  threadId: string;
  reactions: Reaction[];
}

export function ReactionBar(props: ReactionBarProps): React.ReactElement {
  const [local, toggle] = useReactionActions(props.messageId, props.threadId, props.reactions);

  const upCount = countByKind(local, KIND_THUMBS_UP);
  const downCount = countByKind(local, KIND_THUMBS_DOWN);
  const upActive = hasKind(local, KIND_THUMBS_UP);
  const downActive = hasKind(local, KIND_THUMBS_DOWN);

  return (
    <div className="flex items-center gap-0.5">
      <ReactionBtn
        emoji="👍"
        count={upCount}
        active={upActive}
        label={upActive ? 'Remove thumbs up' : 'Thumbs up'}
        onClick={() => toggle(KIND_THUMBS_UP)}
      />
      <ReactionBtn
        emoji="👎"
        count={downCount}
        active={downActive}
        label={downActive ? 'Remove thumbs down' : 'Thumbs down'}
        onClick={() => toggle(KIND_THUMBS_DOWN)}
      />
    </div>
  );
}
