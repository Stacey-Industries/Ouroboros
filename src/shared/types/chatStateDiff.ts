/**
 * chatStateDiff.ts — Discriminated union of state-diff messages and snapshot shape.
 *
 * Main broadcasts these to renderer via chatState:diff and chatState:snapshot IPC channels.
 * Renderer consumes them as a read-only projection — no mutations back.
 * See spec §4.2 and waveplan-86.md Phase 1 scope.
 *
 * No runtime values — type-only per shared/types/ CLAUDE.md convention.
 */

import type { ThreadId, TurnId } from './canonicalChatEvent';

// ─── Thread status enum (Phase 1 subset) ─────────────────────────────────────

/** The four states the state machine traverses in Phase 1. */
export type ChatThreadStatus = 'idle' | 'submitting' | 'streaming' | 'completing';

// ─── Diff variants ────────────────────────────────────────────────────────────

/** Thread status transitioned to a new value. */
export interface StatusChangedDiff {
  type: 'status_changed';
  threadId: ThreadId;
  status: ChatThreadStatus;
  /** Per-thread monotonic seq from the state machine. */
  seq: number;
}

/** A text delta was appended to the active turn's in-flight buffer. */
export interface TextAppendedDiff {
  type: 'text_appended';
  threadId: ThreadId;
  turnId: TurnId;
  delta: string;
  seq: number;
}

/** The active turn completed — final accumulated text available. */
export interface TurnCompletedDiff {
  type: 'turn_completed';
  threadId: ThreadId;
  turnId: TurnId;
  finalText: string;
  seq: number;
}

/** Discriminated union of all Phase 1 diff types. */
export type ChatStateDiff = StatusChangedDiff | TextAppendedDiff | TurnCompletedDiff;

// ─── Snapshot shape ───────────────────────────────────────────────────────────

/**
 * Full thread state snapshot sent by ChatStateBroadcaster on subscribe
 * or on chatState:requestSnapshot IPC.
 * Renderer uses this to hydrate initial display without waiting for diffs.
 */
export interface ChatStateSnapshot {
  threadId: ThreadId;
  status: ChatThreadStatus;
  /** Accumulated text for the current (or most recent) active turn. */
  accumulatedText: string;
  /** The active turn id, or undefined if idle. */
  activeTurnId: TurnId | undefined;
  /** Most recent seq emitted for this thread. */
  seq: number;
}
