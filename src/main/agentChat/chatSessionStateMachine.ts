/**
 * chatSessionStateMachine.ts — Per-thread state machine for the new chat state path.
 *
 * ONE instance per thread, owned by ChatStateBroadcaster via a Map<ThreadId, …>.
 * See spec §4.5 and waveplan-86.md Phase 1 scope (4 states, 4 event types).
 *
 * Decision 3: invalid transitions throw ChatStateError — never silently ignored.
 * Decision 8: emits [trace:event] at dispatch entry and [trace:state] on every transition.
 *
 * seq: per-thread monotonic integer, incremented on every emitted diff.
 */

import type { CanonicalChatEvent, ThreadId, TurnId } from '@shared/types/canonicalChatEvent';
import type {
  ChatStateDiff,
  ChatStateSnapshot,
  ChatThreadStatus,
} from '@shared/types/chatStateDiff';

import log from '../logger';
import { ChatStateError } from './chatStateError';

// ─── State machine ────────────────────────────────────────────────────────────

export class ChatSessionStateMachine {
  private status: ChatThreadStatus = 'idle';
  private accumulatedText = '';
  private activeTurnId: TurnId | undefined = undefined;
  private seq = 0;

  constructor(private readonly threadId: ThreadId) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Apply a canonical event. Returns the list of diffs to broadcast.
   * Decision 8: emits [trace:event] at entry and [trace:state] on transition.
   */
  dispatch(event: CanonicalChatEvent): ChatStateDiff[] {
    log.info('[trace:event]', { threadId: this.threadId, type: event.type, seq: event.seq });
    return this.applyEvent(event);
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

  // ─── Event application ───────────────────────────────────────────────────────

  private applyEvent(event: CanonicalChatEvent): ChatStateDiff[] {
    switch (event.type) {
      case 'turn_submitted':
        return this.onTurnSubmitted(event.turnId);
      case 'provider_session_assigned':
        return this.onProviderSessionAssigned();
      case 'text_delta':
        return this.onTextDelta(event.delta);
      case 'turn_completed':
        return this.onTurnCompleted(event.finalText);
      default: {
        // Exhaustiveness guard — Phase 3 expands the event union.
        const _exhaustive: never = event;
        throw new ChatStateError(
          'invalid-transition',
          `ChatSessionStateMachine: unhandled event type`,
          { type: (_exhaustive as CanonicalChatEvent).type, from: this.status },
        );
      }
    }
  }

  // ─── Transition handlers ─────────────────────────────────────────────────────

  private onTurnSubmitted(turnId: TurnId): ChatStateDiff[] {
    this.requireState('idle', 'turn_submitted');
    this.activeTurnId = turnId;
    this.accumulatedText = '';
    return [this.transition('submitting')];
  }

  private onProviderSessionAssigned(): ChatStateDiff[] {
    this.requireState('submitting', 'provider_session_assigned');
    // No state change — PSID registered is informational only at state-machine level.
    // The broadcaster calls IdentityRegistry.assignProviderSession before dispatching.
    return [];
  }

  private onTextDelta(delta: string): ChatStateDiff[] {
    if (this.status !== 'submitting' && this.status !== 'streaming') {
      this.throwInvalidTransition('text_delta');
    }

    const diffs: ChatStateDiff[] = [];
    if (this.status === 'submitting') {
      diffs.push(this.transition('streaming'));
    }
    this.accumulatedText += delta;
    diffs.push({
      type: 'text_appended',
      threadId: this.threadId,
      turnId: this.activeTurnId as TurnId,
      delta,
      seq: this.nextSeq(),
    });
    return diffs;
  }

  private onTurnCompleted(finalText: string): ChatStateDiff[] {
    // Phase 1 boundary: only 'streaming' → 'completing' is valid.
    // A duplicate turn_completed (e.g. provider sends result twice) will throw
    // ChatStateError('invalid-transition') via requireState — this is intentional
    // (Decision 3: hard-fail on impossible states, never swallow silently).
    // Phase 2 should add deduplication at the normalizer level if needed.
    this.requireState('streaming', 'turn_completed');
    const diffs: ChatStateDiff[] = [];
    diffs.push(this.transition('completing'));
    diffs.push({
      type: 'turn_completed',
      threadId: this.threadId,
      turnId: this.activeTurnId as TurnId,
      finalText,
      seq: this.nextSeq(),
    });
    // completing → idle: in Phase 1 the transition is immediate (no SQLite write).
    // Phase 2 TODO: emit a synthetic 'message_committed' event after persistence
    // so the completing state is observable before the next turn can be submitted.
    // Until then, the machine returns to idle atomically with the turn_completed diff,
    // which is sufficient for the Phase 1 smoke: one message per thread.
    this.activeTurnId = undefined;
    diffs.push(this.transition('idle'));
    return diffs;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private requireState(expected: ChatThreadStatus, eventType: string): void {
    if (this.status !== expected) {
      this.throwInvalidTransition(eventType);
    }
  }

  private throwInvalidTransition(eventType: string): never {
    throw new ChatStateError(
      'invalid-transition',
      `ChatSessionStateMachine[${this.threadId}]: event '${eventType}' invalid in state '${this.status}'`,
      { from: this.status, type: eventType },
    );
  }

  private transition(to: ChatThreadStatus): ChatStateDiff {
    const from = this.status;
    this.status = to;
    const seq = this.nextSeq();
    log.info('[trace:state]', { threadId: this.threadId, from, to, seq });
    return { type: 'status_changed', threadId: this.threadId, status: to, seq };
  }

  private nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }
}
