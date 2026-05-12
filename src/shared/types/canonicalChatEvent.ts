/**
 * canonicalChatEvent.ts — Discriminated union of canonical chat events.
 *
 * Phase 3 scope: full 16-event vocabulary. See spec §4.4 and waveplan-86.md Phase 3 row.
 *
 * ID branding: prevents accidental ID confusion at compile time.
 * Wave-86 Decision 2: correctness over simplicity.
 *
 * No runtime values — type-only per shared/types/ CLAUDE.md convention.
 * Callers use `s as ThreadId` casts directly at the point of trust boundary.
 */

// ─── Branded ID types ─────────────────────────────────────────────────────────

export type ThreadId = string & { readonly __brand: 'ThreadId' };
export type TurnId = string & { readonly __brand: 'TurnId' };
export type ProviderSessionId = string & { readonly __brand: 'ProviderSessionId' };

/**
 * Stable unique ID for a tool_use block within a turn.
 * Sourced from the CLI's stream-json `id` field on `tool_use` content blocks.
 * Format: the CLI's own UUID string (no IDE-side generation needed).
 */
export type ToolUseId = string & { readonly __brand: 'ToolUseId' };

/**
 * Stable unique ID for a persisted message.
 * Format: `agent-chat:{threadId}:{turn}:{role}:{seq}` (per spec §4.3).
 */
export type MessageId = string & { readonly __brand: 'MessageId' };

/**
 * Stable unique ID for a content block within a message.
 * Format: `agent-chat:{messageId}:b{N}` (per spec §4.3).
 */
export type BlockId = string & { readonly __brand: 'BlockId' };

// ─── Canonical event variants (full Phase 3 vocabulary) ───────────────────────

/** User pressed send — turn lifecycle begins. */
export interface TurnSubmittedEvent {
  type: 'turn_submitted';
  threadId: ThreadId;
  turnId: TurnId;
  content: string;
  preSnapshotHash: string | null;
  resolvedProvider: string;
  resolvedModel: string;
  resolvedEffort: string | null;
  resolvedPermissionMode: string | null;
  ts: number;
  /** Per-thread monotonic integer; assigned by ChatSessionStateMachine. */
  seq: number;
}

/**
 * Subprocess confirmed spawned — fired by normalizer between turn_submitted
 * and provider_session_assigned. Signals that the CLI process is alive.
 */
export interface TurnStartedEvent {
  type: 'turn_started';
  threadId: ThreadId;
  turnId: TurnId;
  ts: number;
  seq: number;
}

/** First stream-json event carrying a session_id resolves the ProviderSessionId. */
export interface ProviderSessionAssignedEvent {
  type: 'provider_session_assigned';
  threadId: ThreadId;
  turnId: TurnId;
  providerSessionId: ProviderSessionId;
  ts: number;
  seq: number;
}

/** Text content delta from the CLI stream. */
export interface TextDeltaEvent {
  type: 'text_delta';
  threadId: ThreadId;
  turnId: TurnId;
  delta: string;
  ts: number;
  seq: number;
}

/**
 * A tool_use content block started in the stream.
 * Source: stream-json `content_block_start` with `type: 'tool_use'`.
 */
export interface ToolCallStartedEvent {
  type: 'tool_call_started';
  threadId: ThreadId;
  turnId: TurnId;
  toolUseId: ToolUseId;
  /** Tool name, e.g. "Bash", "Read", "Edit". */
  name: string;
  ts: number;
  seq: number;
}

/**
 * Incremental JSON input for an in-progress tool_use block.
 * Source: stream-json `content_block_delta` with `input_json_delta`.
 */
export interface ToolCallInputDeltaEvent {
  type: 'tool_call_input_delta';
  threadId: ThreadId;
  turnId: TurnId;
  toolUseId: ToolUseId;
  /** Raw JSON fragment string to be accumulated. */
  delta: string;
  ts: number;
  seq: number;
}

/**
 * A tool_use block completed — the full input JSON is now available.
 * Source: stream-json `content_block_stop` for a tool_use block.
 */
export interface ToolCallCompletedEvent {
  type: 'tool_call_completed';
  threadId: ThreadId;
  turnId: TurnId;
  toolUseId: ToolUseId;
  /** Accumulated JSON input string (parsed form available to consumers). */
  finalInput: string;
  ts: number;
  seq: number;
}

/**
 * A tool_result block observed in the next-turn user event.
 * Source: stream-json `user` event carrying `tool_result` content blocks.
 */
export interface ToolResultObservedEvent {
  type: 'tool_result_observed';
  threadId: ThreadId;
  turnId: TurnId;
  toolUseId: ToolUseId;
  /** Raw content of the tool result (string or serialized form). */
  content: string;
  ts: number;
  seq: number;
}

/**
 * A PreToolUse hook event with decision 'ask' — awaiting user approval.
 * Source: hook pipe `PreToolUse` with decision field set to 'ask'.
 */
export interface ToolPermissionRequestedEvent {
  type: 'tool_permission_requested';
  threadId: ThreadId;
  turnId: TurnId;
  toolUseId: ToolUseId;
  /** Serialized request context (tool name + input summary). */
  request: string;
  ts: number;
  seq: number;
}

/**
 * User resolved a tool permission request (allow or deny).
 * Source: chatCommand:resolveToolPermission from renderer.
 */
export interface ToolPermissionResolvedEvent {
  type: 'tool_permission_resolved';
  threadId: ThreadId;
  turnId: TurnId;
  toolUseId: ToolUseId;
  decision: 'allow' | 'deny';
  ts: number;
  seq: number;
}

/**
 * CLI loaded rules / skills files.
 * Source: hook pipe `instructions_loaded` event type.
 */
export interface InstructionsLoadedEvent {
  type: 'instructions_loaded';
  threadId: ThreadId;
  /** File names of the loaded instructions. */
  fileNames: string[];
  totalCount: number;
  ts: number;
  seq: number;
}

/** Turn reached a success result — all text delivered. */
export interface TurnCompletedEvent {
  type: 'turn_completed';
  threadId: ThreadId;
  turnId: TurnId;
  finalText: string;
  ts: number;
  seq: number;
}

/**
 * Turn ended with an error result.
 * Source: stream-json `result` event with subtype `error_*`.
 */
export interface TurnFailedEvent {
  type: 'turn_failed';
  threadId: ThreadId;
  turnId: TurnId;
  /** Error message from the CLI result event. */
  errorMessage: string;
  /** CLI result subtype, e.g. 'error', 'error_during_execution'. */
  subtype: string;
  ts: number;
  seq: number;
}

/**
 * User cancelled the turn (chatCommand:cancelTurn) + subprocess kill.
 * Source: renderer chatCommand:cancelTurn → subprocess kill signal.
 */
export interface TurnCancelledEvent {
  type: 'turn_cancelled';
  threadId: ThreadId;
  turnId: TurnId;
  ts: number;
  seq: number;
}

/**
 * User sent a message while the thread was busy — the message was queued.
 * Source: chatCommand:appendQueue from renderer.
 */
export interface QueueAppendedEvent {
  type: 'queue_appended';
  threadId: ThreadId;
  queuedMessageId: MessageId;
  content: string;
  ts: number;
  seq: number;
}

/**
 * State-machine internal event: persistence completed for the turn's message.
 * Fired by ChatPersistenceLayer after SQLite write succeeds.
 * The turn is now fully committed; the state machine may return to IDLE.
 */
export interface MessageCommittedEvent {
  type: 'message_committed';
  threadId: ThreadId;
  turnId: TurnId;
  messageId: MessageId;
  ts: number;
  seq: number;
}

/** Discriminated union of all Phase 3 canonical events (16 types). */
export type CanonicalChatEvent =
  | TurnSubmittedEvent
  | TurnStartedEvent
  | ProviderSessionAssignedEvent
  | TextDeltaEvent
  | ToolCallStartedEvent
  | ToolCallInputDeltaEvent
  | ToolCallCompletedEvent
  | ToolResultObservedEvent
  | ToolPermissionRequestedEvent
  | ToolPermissionResolvedEvent
  | InstructionsLoadedEvent
  | TurnCompletedEvent
  | TurnFailedEvent
  | TurnCancelledEvent
  | QueueAppendedEvent
  | MessageCommittedEvent;
