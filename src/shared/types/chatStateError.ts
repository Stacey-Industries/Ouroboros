/**
 * chatStateError.ts — Type-only definitions for the new chat state error model.
 *
 * This file is shared/types — no runtime values allowed per CLAUDE.md.
 * The runtime ChatStateError class lives in src/main/agentChat/chatStateError.ts.
 * Renderer never throws; it receives the serialized payload via the chatState:error IPC channel.
 */

/** Discriminated error kind — every throw site picks exactly one. */
export type ChatStateErrorKind =
  | 'unknown-thread'
  | 'unknown-turn'
  | 'unknown-provider-session'
  | 'invalid-transition'
  | 'malformed-event'
  | 'duplicate-provider-session-assignment';

/**
 * Serialized shape sent over the chatState:error IPC channel.
 * Main-side catches ChatStateError and serializes it into this before sending.
 */
export interface ChatStateErrorPayload {
  kind: ChatStateErrorKind;
  message: string;
  details: Record<string, unknown>;
}
