/**
 * canonicalChatEvent.ts — Discriminated union of canonical chat events.
 *
 * Phase 1 scope: four event types only. Full vocabulary (16 types) comes in Phase 3.
 * See spec §4.4 and waveplan-86.md Phase 1 row.
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

// ─── Canonical event variants (Phase 1 set) ───────────────────────────────────

/** User pressed send — turn lifecycle begins. */
export interface TurnSubmittedEvent {
  type: 'turn_submitted';
  threadId: ThreadId;
  turnId: TurnId;
  content: string;
  ts: number;
  /** Per-thread monotonic integer; assigned by ChatSessionStateMachine. */
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

/** Turn reached a success result — all text delivered. */
export interface TurnCompletedEvent {
  type: 'turn_completed';
  threadId: ThreadId;
  turnId: TurnId;
  finalText: string;
  ts: number;
  seq: number;
}

/** Discriminated union of all Phase 1 canonical events. */
export type CanonicalChatEvent =
  | TurnSubmittedEvent
  | ProviderSessionAssignedEvent
  | TextDeltaEvent
  | TurnCompletedEvent;
