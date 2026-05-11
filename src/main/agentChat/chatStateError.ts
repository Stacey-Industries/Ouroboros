/**
 * chatStateError.ts — Runtime error class for the new chat state architecture.
 *
 * Decision 3 (wave-86): Hard-fail on impossible states. Every code path that detects
 * an unknown or invalid input throws ChatStateError — no silent recovery in any build.
 *
 * The shared/types version carries only the type definitions (ChatStateErrorKind,
 * ChatStateErrorPayload). This file carries the runtime class used by:
 *   - IdentityRegistry (unknown-turn, unknown-provider-session, duplicate-provider-session-assignment)
 *   - EventNormalizer (malformed-event, unknown-provider-session)
 *   - ChatSessionStateMachine (invalid-transition)
 *   - chatStateNewPath IPC handler (malformed-event)
 *
 * Renderer never imports this file; it receives ChatStateErrorPayload over IPC.
 */

import type { ChatStateErrorKind } from '@shared/types/chatStateError';

export type { ChatStateErrorKind };

export class ChatStateError extends Error {
  readonly kind: ChatStateErrorKind;
  readonly details: Record<string, unknown>;

  constructor(kind: ChatStateErrorKind, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ChatStateError';
    this.kind = kind;
    this.details = details;

    // Maintain proper prototype chain in transpiled ES5 environments.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
