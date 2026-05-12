/**
 * crashRecovery.ts — App-start crash-recovery scan for Wave 86 Phase 5.
 *
 * On each app start, scans threads with non-terminal status (running, submitting)
 * that have no active bridge session. These were interrupted mid-turn by a crash
 * or force-quit. For each:
 *   1. Sets lastInterruptedAt marker so the UI shows "Previous turn interrupted".
 *   2. Resets status to 'idle' so the user can re-send.
 *   3. If the last assistant message has dangling tool_use blocks (no matching
 *      tool_result in a later user message), synthesizes a '[interrupted]'
 *      tool_result. This prevents Anthropic's strict-adjacency violation on
 *      --resume (prep doc 03 topic 2).
 *
 * Decision 5: SQLite is authoritative. All writes go through the store API.
 * Decision 3: failures are logged at error level but must NOT crash app start.
 *
 * See spec §4.5, wave-86-decisions.md Decision 9 (lastInterruptedAt column).
 */

import crypto from 'node:crypto';

import type { ThreadId } from '@shared/types/canonicalChatEvent';

import log from '../logger';
import type { ChatPersistenceLayer } from './chatPersistenceLayer';
import type { AgentChatThreadStore } from './threadStore';
import type { AgentChatContentBlock, AgentChatMessageRecord, AgentChatThreadRecord } from './types';

// ─── Dangling tool_use detection ──────────────────────────────────────────────

function findDanglingToolUseIds(thread: AgentChatThreadRecord): string[] {
  const messages = thread.messages;
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  if (!lastAssistant?.blocks) return [];

  const assistantIdx = messages.indexOf(lastAssistant);
  const laterUserMessages = messages.filter((m, i) => i > assistantIdx && m.role === 'user');

  const resolvedIds = new Set<string>();
  for (const msg of laterUserMessages) {
    for (const block of msg.blocks ?? []) {
      if (block.kind === 'tool_result') resolvedIds.add(block.toolUseId);
    }
  }

  return lastAssistant.blocks
    .filter((b): b is Extract<AgentChatContentBlock, { kind: 'tool_use' }> => b.kind === 'tool_use')
    .filter((b) => b.blockId && !resolvedIds.has(b.blockId))
    .map((b) => b.blockId as string);
}

// ─── Synthetic tool_result message ───────────────────────────────────────────

function buildSyntheticToolResultMessage(
  threadId: string,
  toolUseIds: string[],
): AgentChatMessageRecord {
  const blocks: AgentChatContentBlock[] = toolUseIds.map((id) => ({
    kind: 'tool_result' as const,
    toolUseId: id,
    content: '[interrupted]',
  }));
  return {
    id: `agent-chat:${threadId}:interrupted:${crypto.randomUUID()}`,
    threadId,
    role: 'user',
    content: '',
    blocks,
    createdAt: Date.now(),
  };
}

// ─── Per-thread recovery ──────────────────────────────────────────────────────

async function recoverThread(
  thread: AgentChatThreadRecord,
  threadStore: AgentChatThreadStore,
  persistence: ChatPersistenceLayer,
): Promise<void> {
  try {
    // thread.id is the legacy AgentChatThreadRecord string id; brand it for the
    // ChatPersistenceLayer signature (which takes a ThreadId branded type).
    persistence.setLastInterruptedAt(thread.id as ThreadId, Date.now());
    await threadStore.updateThread(thread.id, { status: 'idle' });

    const danglingIds = findDanglingToolUseIds(thread);
    if (danglingIds.length > 0) {
      const synthetic = buildSyntheticToolResultMessage(thread.id, danglingIds);
      await threadStore.appendMessage(thread.id, synthetic);
      log.info('[crash-recovery] synthesized tool_result for dangling tool_use', {
        threadId: thread.id,
        count: danglingIds.length,
      });
    }
  } catch (err) {
    log.error('[crash-recovery] recoverThread failed', { threadId: thread.id, err });
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

const INTERRUPTED_STATUSES = new Set(['running', 'submitting']);

/**
 * Scan all threads for non-terminal statuses that indicate an interrupted turn.
 * Called once at app start from registerChatStateNewPathHandlers, after SQLite
 * is open and the identity registry has been rebuilt.
 *
 * Safe to call with the module-level agentChatThreadStore singleton — it opens
 * its own SQLite connection lazily.
 */
export async function reconcileInterruptedThreads(
  threadStore: AgentChatThreadStore,
  persistence: ChatPersistenceLayer,
): Promise<void> {
  try {
    const threads = await threadStore.listThreads();
    const stranded = threads.filter((t) => INTERRUPTED_STATUSES.has(t.status));
    if (stranded.length === 0) return;

    log.info('[crash-recovery] found interrupted threads', { count: stranded.length });
    await Promise.all(stranded.map((t) => recoverThread(t, threadStore, persistence)));
    log.info('[crash-recovery] recovery complete', { count: stranded.length });
  } catch (err) {
    log.error('[crash-recovery] reconcileInterruptedThreads failed', { err });
  }
}
