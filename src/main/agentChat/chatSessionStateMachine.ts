/**
 * chatSessionStateMachine.ts — Per-thread state machine for the new chat state path.
 *
 * ONE instance per thread, owned by ChatStateBroadcaster via a Map<ThreadId, …>.
 * See spec §4.5 and waveplan-86.md Phase 3 scope (5 states, 16 event types).
 *
 * Decision 3: invalid transitions throw ChatStateError — never silently ignored.
 * Decision 8: emits [trace:event] at dispatch entry and [trace:state] on every transition.
 *
 * Transition table (Phase 3 — full vocabulary):
 *   IDLE       ──turn_submitted──▶ SUBMITTING
 *   SUBMITTING ──turn_started/provider_session_assigned──▶ SUBMITTING (informational)
 *   SUBMITTING ──text_delta──▶ STREAMING
 *   STREAMING  ──text_delta──▶ STREAMING (loop)
 *   STREAMING  ──tool_call_started──▶ TOOL_RUNNING
 *   STREAMING  ──tool_result_observed──▶ STREAMING
 *   TOOL_RUNNING ──tool_call_input_delta──▶ TOOL_RUNNING (loop)
 *   TOOL_RUNNING ──tool_permission_requested/resolved──▶ TOOL_RUNNING (sub-flags)
 *   TOOL_RUNNING ──tool_call_completed──▶ STREAMING
 *   {STREAMING|TOOL_RUNNING} ──turn_completed──▶ COMPLETING
 *   {STREAMING|TOOL_RUNNING|SUBMITTING} ──turn_failed──▶ COMPLETING
 *   {non-IDLE, non-COMPLETING} ──turn_cancelled──▶ COMPLETING
 *   COMPLETING ──message_committed──▶ IDLE
 *   {non-COMPLETING} ──queue_appended──▶ same state
 *   {any} ──instructions_loaded──▶ same state
 *
 * Implementation is split: applyEvent dispatch in chatSessionStateMachineApply.ts.
 * seq: per-thread monotonic integer, incremented on every emitted diff.
 */

import type {
  CanonicalChatEvent,
  MessageId,
  ThreadId,
  ToolUseId,
  TurnId,
} from '@shared/types/canonicalChatEvent';
import type {
  ChatStateDiff,
  ChatStateSnapshot,
  ChatThreadStatus,
} from '@shared/types/chatStateDiff';

import log from '../logger';
import { applyEvent } from './chatSessionStateMachineApply';
import { ChatStateError } from './chatStateError';

// ─── In-flight tool call state ────────────────────────────────────────────────

export interface ToolCallInFlight {
  name: string;
  inputJson: string;
  startedAt: number;
}

// ─── Queue entry ──────────────────────────────────────────────────────────────

export interface QueueEntry {
  id: MessageId;
  content: string;
  addedAt: number;
}

// ─── State machine ────────────────────────────────────────────────────────────

export class ChatSessionStateMachine {
  // Core state
  status: ChatThreadStatus = 'idle';
  accumulatedText = '';
  activeTurnId: TurnId | undefined = undefined;
  private seq = 0;

  // Phase 3 extended state
  toolCallsInFlight = new Map<ToolUseId, ToolCallInFlight>();
  toolResults = new Map<ToolUseId, string>();
  queue: QueueEntry[] = [];
  awaitingPermission = new Set<ToolUseId>();

  constructor(readonly threadId: ThreadId) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Apply a canonical event. Returns the list of diffs to broadcast.
   * Decision 8: emits [trace:event] at entry and [trace:state] on transition.
   */
  dispatch(event: CanonicalChatEvent): ChatStateDiff[] {
    log.info('[trace:event]', { threadId: this.threadId, type: event.type, seq: event.seq });
    return applyEvent(this, event);
  }

  /** Snapshot for subscribe-time hydration. */
  snapshot(): ChatStateSnapshot {
    return {
      threadId: this.threadId,
      status: this.status,
      accumulatedText: this.accumulatedText,
      activeTurnId: this.activeTurnId,
      seq: this.seq,
    };
  }

  // ─── Queue inspection (called by DualEmitOrchestrator after message_committed) ─

  /** Return and remove the head of the send queue, if any. */
  dequeueHead(): QueueEntry | undefined {
    return this.queue.shift();
  }

  /** Peek at the queue head without removing it. */
  peekQueueHead(): QueueEntry | undefined {
    return this.queue[0];
  }

  // ─── Helpers (called by applyEvent) ──────────────────────────────────────────

  requireState(expected: ChatThreadStatus, eventType: string): void {
    if (this.status !== expected) {
      this.throwInvalidTransition(eventType);
    }
  }

  throwInvalidTransition(eventType: string): never {
    throw new ChatStateError(
      'invalid-transition',
      `ChatSessionStateMachine[${this.threadId}]: event '${eventType}' invalid in state '${this.status}'`,
      { from: this.status, type: eventType },
    );
  }

  transition(to: ChatThreadStatus): ChatStateDiff {
    const from = this.status;
    this.status = to;
    const seq = this.nextSeq();
    log.info('[trace:state]', { threadId: this.threadId, from, to, seq });
    return { type: 'status_changed', threadId: this.threadId, status: to, seq };
  }

  nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }
}
