/**
 * eventNormalizer.ts — Converts raw events from three sources into CanonicalChatEvent.
 *
 * Three entry points (per spec §4.4):
 *   fromCommand    — chatCommand:sendMessage payload → turn_submitted
 *   fromStreamJson — CLI stream-json NDJSON event → canonical event or null
 *   fromHookEvent  — hook pipe payload → null for Phase 1 (Phase 3+ fills body)
 *
 * Stateless across threads: seq assignment is the state machine's responsibility.
 * ID resolution uses the IdentityRegistry (the only translation surface).
 *
 * Decision 3: throws ChatStateError on malformed/unknown input; drops "not ours" with log.
 * Decision 8: [trace:identity] emits happen inside IdentityRegistry — not duplicated here.
 */

import type {
  CanonicalChatEvent,
  ProviderSessionId,
  ThreadId,
  TurnId,
} from '@shared/types/canonicalChatEvent';

import log from '../logger';
import type { StreamJsonEvent } from '../orchestration/providers/streamJsonTypes';
import type { IdentityRegistry } from './identityRegistry';

// ─── Hook payload type (minimal — Phase 3 fills in the full shape) ────────────

export interface HookPayload {
  type: string;
  session_id?: string;
  [key: string]: unknown;
}

// ─── Command payload shape ────────────────────────────────────────────────────

export interface ChatCommandPayload {
  threadId: string;
  content: string;
}

// ─── Internal stream-json narrowed shapes ─────────────────────────────────────

interface AssistantEventShape {
  type: 'assistant';
  message: { content: Array<{ type: string; text?: string }> };
  session_id?: string;
}

interface ResultEventShape {
  type: 'result';
  subtype: string;
  result: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractTextDelta(
  raw: AssistantEventShape,
  turnId: TurnId,
  threadId: ThreadId,
): Extract<CanonicalChatEvent, { type: 'text_delta' }> | null {
  const blocks = raw.message?.content ?? [];
  const delta = blocks
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text ?? '')
    .join('');
  if (!delta) return null;
  return { type: 'text_delta', threadId, turnId, delta, ts: Date.now(), seq: 0 };
}

function handleProviderSessionAssign(
  psid: ProviderSessionId,
  turnId: TurnId,
  registry: IdentityRegistry,
  seenPsids: Set<ProviderSessionId>,
): Extract<CanonicalChatEvent, { type: 'provider_session_assigned' }> {
  seenPsids.add(psid);
  const threadId = registry.threadIdForTurn(turnId);
  return {
    type: 'provider_session_assigned',
    threadId,
    turnId,
    providerSessionId: psid,
    ts: Date.now(),
    seq: 0,
  };
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

export class EventNormalizer {
  private readonly registry: IdentityRegistry;

  constructor(registry: IdentityRegistry) {
    this.registry = registry;
  }

  /**
   * Convert a chatCommand:sendMessage payload into a turn_submitted canonical event.
   * seq is a placeholder — the state machine overwrites it before emission.
   */
  fromCommand(
    cmd: ChatCommandPayload,
    turnId: TurnId,
  ): Extract<CanonicalChatEvent, { type: 'turn_submitted' }> {
    return {
      type: 'turn_submitted',
      threadId: cmd.threadId as ThreadId,
      turnId,
      content: cmd.content,
      ts: Date.now(),
      seq: 0,
    };
  }

  /**
   * Convert a raw stream-json event into the appropriate canonical event, or null.
   *
   * Handled (Phase 1):
   *   - First event carrying session_id → provider_session_assigned
   *   - assistant event with text content → text_delta
   *   - result event subtype 'success' → turn_completed
   *
   * Decision 3: throws ChatStateError if turnId is unknown in registry.
   */
  fromStreamJson(
    raw: StreamJsonEvent,
    turnId: TurnId,
    seenProviderSessionIds: Set<ProviderSessionId>,
  ): CanonicalChatEvent | null {
    const rawSessionId = (raw as { session_id?: string }).session_id;

    if (rawSessionId && !seenProviderSessionIds.has(rawSessionId as ProviderSessionId)) {
      return handleProviderSessionAssign(
        rawSessionId as ProviderSessionId,
        turnId,
        this.registry,
        seenProviderSessionIds,
      );
    }

    if (raw.type === 'assistant') {
      const threadId = this.registry.threadIdForTurn(turnId);
      return extractTextDelta(raw as unknown as AssistantEventShape, turnId, threadId);
    }

    if (raw.type === 'result') {
      const result = raw as unknown as ResultEventShape;
      if (result.subtype !== 'success') return null;
      const threadId = this.registry.threadIdForTurn(turnId);
      return {
        type: 'turn_completed',
        threadId,
        turnId,
        finalText: result.result ?? '',
        ts: Date.now(),
        seq: 0,
      };
    }

    log.info('[eventNormalizer] dropping unhandled stream-json event type', { type: raw.type });
    return null;
  }

  /**
   * Convert a hook pipe payload into a canonical event.
   * Phase 1: always returns null. Phase 3+ fills in the body.
   */
  fromHookEvent(raw: HookPayload): CanonicalChatEvent | null {
    void raw;
    return null;
  }
}
