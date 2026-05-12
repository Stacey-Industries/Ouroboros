/**
 * chatStateDiff.ts — Discriminated union of state-diff messages and snapshot shape.
 *
 * Main broadcasts these to renderer via chatState:diff and chatState:snapshot IPC channels.
 * Renderer consumes them as a read-only projection — no mutations back.
 * See spec §4.2 and waveplan-86.md Phase 3 scope.
 *
 * No runtime values — type-only per shared/types/ CLAUDE.md convention.
 */

import type { MessageId, ThreadId, ToolUseId, TurnId } from './canonicalChatEvent';

// ─── Thread status enum (Phase 3 — full 5-state vocabulary) ──────────────────

/** All five states the Phase 3 state machine can occupy. */
export type ChatThreadStatus = 'idle' | 'submitting' | 'streaming' | 'tool_running' | 'completing';

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

/** The active turn failed with an error. */
export interface TurnFailedDiff {
  type: 'turn_failed';
  threadId: ThreadId;
  turnId: TurnId;
  errorMessage: string;
  seq: number;
}

/** The active turn was cancelled. */
export interface TurnCancelledDiff {
  type: 'turn_cancelled';
  threadId: ThreadId;
  turnId: TurnId;
  seq: number;
}

/** A tool_use block started. */
export interface ToolCallStartedDiff {
  type: 'tool_call_started';
  threadId: ThreadId;
  turnId: TurnId;
  toolUseId: ToolUseId;
  name: string;
  seq: number;
}

/** Incremental input JSON for an in-progress tool_use block. */
export interface ToolCallInputDeltaDiff {
  type: 'tool_call_input_delta';
  threadId: ThreadId;
  toolUseId: ToolUseId;
  delta: string;
  seq: number;
}

/** A tool_use block completed — full input available. */
export interface ToolCallCompletedDiff {
  type: 'tool_call_completed';
  threadId: ThreadId;
  toolUseId: ToolUseId;
  finalInput: string;
  seq: number;
}

/** A tool_result observed in the next-turn user event. */
export interface ToolResultObservedDiff {
  type: 'tool_result_observed';
  threadId: ThreadId;
  toolUseId: ToolUseId;
  content: string;
  seq: number;
}

/** A tool permission request is pending user approval. */
export interface ToolPermissionRequestedDiff {
  type: 'tool_permission_requested';
  threadId: ThreadId;
  toolUseId: ToolUseId;
  request: string;
  seq: number;
}

/** A tool permission was resolved (allow/deny). */
export interface ToolPermissionResolvedDiff {
  type: 'tool_permission_resolved';
  threadId: ThreadId;
  toolUseId: ToolUseId;
  decision: 'allow' | 'deny';
  seq: number;
}

/** CLI instructions/skills were loaded. */
export interface InstructionsLoadedDiff {
  type: 'instructions_loaded';
  threadId: ThreadId;
  instructions: string[];
  seq: number;
}

/** A message was queued (thread was busy when user sent). */
export interface QueueAppendedDiff {
  type: 'queue_appended';
  threadId: ThreadId;
  queuedMessageId: MessageId;
  content: string;
  seq: number;
}

/** A message was committed to SQLite — turn lifecycle fully closed. */
export interface MessageCommittedDiff {
  type: 'message_committed';
  threadId: ThreadId;
  messageId: MessageId;
  seq: number;
}

/** Discriminated union of all Phase 3 diff types. */
export type ChatStateDiff =
  | StatusChangedDiff
  | TextAppendedDiff
  | TurnCompletedDiff
  | TurnFailedDiff
  | TurnCancelledDiff
  | ToolCallStartedDiff
  | ToolCallInputDeltaDiff
  | ToolCallCompletedDiff
  | ToolResultObservedDiff
  | ToolPermissionRequestedDiff
  | ToolPermissionResolvedDiff
  | InstructionsLoadedDiff
  | QueueAppendedDiff
  | MessageCommittedDiff;

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
