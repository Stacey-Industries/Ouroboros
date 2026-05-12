/**
 * eventNormalizer.ts — Converts raw events from three sources into CanonicalChatEvent.
 *
 * Three entry points (per spec §4.4):
 *   fromCommand    — chatCommand:sendMessage payload → turn_submitted
 *   fromStreamJson — CLI stream-json NDJSON event → canonical event or null
 *   fromHookEvent  — hook pipe payload → canonical event or null (Phase 3 fills body)
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
  ToolUseId,
  TurnId,
} from '@shared/types/canonicalChatEvent';

import log from '../logger';
import type { StreamJsonEvent } from '../orchestration/providers/streamJsonTypes';
import type { IdentityRegistry } from './identityRegistry';

// ─── Hook payload type ────────────────────────────────────────────────────────

export interface HookPayload {
  type: string;
  session_id?: string;
  /** For PreToolUse events: 'ask' | 'approve' | 'deny' */
  decision?: string;
  /** Tool name for PreToolUse / PostToolUse */
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  /** File names loaded for instructions_loaded */
  fileNames?: string[];
  totalCount?: number;
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
  message: {
    content: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
  session_id?: string;
}

interface ResultEventShape {
  type: 'result';
  subtype: string;
  result: string;
}

interface UserEventShape {
  type: 'user';
  message: {
    content: Array<{
      type: string;
      tool_use_id?: string;
      content?: unknown;
    }>;
  };
  session_id?: string;
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

/** Extract tool_call_started from an assistant message block. */
function extractToolCallStarted(
  block: AssistantEventShape['message']['content'][number],
  turnId: TurnId,
  threadId: ThreadId,
): Extract<CanonicalChatEvent, { type: 'tool_call_started' }> | null {
  if (block.type !== 'tool_use' || !block.id || !block.name) return null;
  return {
    type: 'tool_call_started',
    threadId,
    turnId,
    toolUseId: block.id as ToolUseId,
    name: block.name,
    ts: Date.now(),
    seq: 0,
  };
}

/** Extract tool_result_observed events from a user event (one per tool_result block). */
function extractToolResults(
  raw: UserEventShape,
  turnId: TurnId,
  threadId: ThreadId,
): CanonicalChatEvent[] {
  const blocks = Array.isArray(raw.message?.content) ? raw.message.content : [];
  const results: CanonicalChatEvent[] = [];
  for (const block of blocks) {
    if (block.type !== 'tool_result' || !block.tool_use_id) continue;
    const content =
      typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '');
    results.push({
      type: 'tool_result_observed',
      threadId,
      turnId,
      toolUseId: block.tool_use_id as ToolUseId,
      content,
      ts: Date.now(),
      seq: 0,
    });
  }
  return results;
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
   * Convert a raw stream-json event into canonical event(s), or null.
   *
   * Returns an array when one raw event maps to multiple canonicals
   * (e.g. a user event with several tool_result blocks).
   *
   * Decision 3: throws ChatStateError if turnId is unknown in registry.
   */
  fromStreamJson(
    raw: StreamJsonEvent,
    turnId: TurnId,
    seenProviderSessionIds: Set<ProviderSessionId>,
  ): CanonicalChatEvent | CanonicalChatEvent[] | null {
    const rawSessionId = (raw as { session_id?: string }).session_id;
    if (rawSessionId && !seenProviderSessionIds.has(rawSessionId as ProviderSessionId)) {
      return handleProviderSessionAssign(
        rawSessionId as ProviderSessionId,
        turnId,
        this.registry,
        seenProviderSessionIds,
      );
    }
    if (raw.type === 'assistant') return this.normalizeAssistant(raw, turnId);
    if (raw.type === 'user') return this.normalizeUser(raw, turnId);
    if (raw.type === 'result') return this.normalizeResult(raw, turnId);
    log.info('[eventNormalizer] dropping unhandled stream-json event type', { type: raw.type });
    return null;
  }

  private normalizeAssistant(raw: StreamJsonEvent, turnId: TurnId): CanonicalChatEvent | null {
    const threadId = this.registry.threadIdForTurn(turnId);
    const assistantRaw = raw as unknown as AssistantEventShape;
    const blocks = assistantRaw.message?.content ?? [];
    const toolUseBlock = blocks.find((b) => b.type === 'tool_use');
    if (toolUseBlock) return extractToolCallStarted(toolUseBlock, turnId, threadId);
    return extractTextDelta(assistantRaw, turnId, threadId);
  }

  private normalizeUser(raw: StreamJsonEvent, turnId: TurnId): CanonicalChatEvent[] | null {
    const threadId = this.registry.threadIdForTurn(turnId);
    const results = extractToolResults(raw as unknown as UserEventShape, turnId, threadId);
    return results.length > 0 ? results : null;
  }

  private normalizeResult(raw: StreamJsonEvent, turnId: TurnId): CanonicalChatEvent | null {
    const result = raw as unknown as ResultEventShape;
    const threadId = this.registry.threadIdForTurn(turnId);
    if (result.subtype === 'success') {
      return {
        type: 'turn_completed',
        threadId,
        turnId,
        finalText: result.result ?? '',
        ts: Date.now(),
        seq: 0,
      };
    }
    if (result.subtype.startsWith('error')) {
      return {
        type: 'turn_failed',
        threadId,
        turnId,
        errorMessage: result.result ?? result.subtype,
        subtype: result.subtype,
        ts: Date.now(),
        seq: 0,
      };
    }
    log.info('[eventNormalizer] dropping result with unhandled subtype', {
      subtype: result.subtype,
    });
    return null;
  }

  /**
   * Convert a hook pipe payload into a canonical event, or null.
   *
   * Phase 3 handles:
   *   - PreToolUse with decision 'ask' → tool_permission_requested
   *   - instructions_loaded event type → instructions_loaded
   *
   * Events from sessions we don't own (PSID not in registry) are dropped
   * with a high-severity log — not thrown (spec §4.3 "not ours" exception).
   * Events claiming to belong to us but with missing required fields throw.
   */
  fromHookEvent(raw: HookPayload): CanonicalChatEvent | null {
    if (raw.type === 'pre_tool_use' && raw.decision === 'ask') {
      return this.hookPreToolUseAsk(raw);
    }

    if (raw.type === 'instructions_loaded') {
      return this.hookInstructionsLoaded(raw);
    }

    // All other hook types: not handled in Phase 3.
    return null;
  }

  // ─── Hook handler helpers ──────────────────────────────────────────────────

  private hookPreToolUseAsk(raw: HookPayload): CanonicalChatEvent | null {
    const psid = raw.session_id as ProviderSessionId | undefined;
    if (!psid) {
      log.warn('[eventNormalizer] pre_tool_use ask missing session_id — dropping');
      return null;
    }

    let threadId: ThreadId;
    try {
      threadId = this.registry.threadIdForProviderSession(psid);
    } catch {
      // Not our session — drop with high-severity log (spec §4.3).
      log.warn('[eventNormalizer] pre_tool_use ask: session not ours — dropping', { psid });
      return null;
    }

    const activeTurnId = this.registry.getActiveTurn(threadId);
    if (!activeTurnId) {
      log.warn('[eventNormalizer] pre_tool_use ask: no active turn for thread — dropping', {
        threadId,
      });
      return null;
    }

    const toolUseId = (raw.toolCallId ?? '') as ToolUseId;
    const request = raw.toolName ?? 'unknown tool';
    return {
      type: 'tool_permission_requested',
      threadId,
      turnId: activeTurnId,
      toolUseId,
      request,
      ts: Date.now(),
      seq: 0,
    };
  }

  private hookInstructionsLoaded(raw: HookPayload): CanonicalChatEvent | null {
    const psid = raw.session_id as ProviderSessionId | undefined;
    if (!psid) {
      log.warn('[eventNormalizer] instructions_loaded missing session_id — dropping');
      return null;
    }

    let threadId: ThreadId;
    try {
      threadId = this.registry.threadIdForProviderSession(psid);
    } catch {
      // Not our session — drop silently (spec §4.3 "not ours" exception).
      log.info('[trace:identity]', {
        op: 'fromHookEvent:instructions_loaded',
        psid,
        result: 'drop-not-ours',
      });
      return null;
    }

    const fileNames = Array.isArray(raw.fileNames) ? (raw.fileNames as string[]) : [];
    const totalCount = typeof raw.totalCount === 'number' ? raw.totalCount : fileNames.length;
    return {
      type: 'instructions_loaded',
      threadId,
      fileNames,
      totalCount,
      ts: Date.now(),
      seq: 0,
    };
  }
}
