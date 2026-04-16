/**
 * contextPacketBuilderPins.ts — Pinned context injection for context packets
 * (Wave 25 Phase D).
 *
 * Fetches the active session's non-dismissed pinned items and prepends them as
 * a synthetic `pinnedContext` section on the ContextPacket so they are
 * prefix-cacheable (they appear before file candidates in the prompt).
 *
 * Token budget is charged against the existing budget object so downstream
 * budget enforcement stays accurate.
 */

import type { PinnedContextItem } from '@shared/types/pinnedContext';

import log from '../logger';
import { getPinnedContextStore } from './pinnedContextStore';
import type { ContextBudgetSummary, ContextPacket } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function estimateTokens(content: string): number {
  return Math.ceil(content.length / CHARS_PER_TOKEN);
}

function renderPin(title: string, content: string): string {
  return `=== [Pin: ${title}] ===\n${content}\n`;
}

function collectRenderedPins(
  pins: PinnedContextItem[],
  budget: ContextBudgetSummary,
): { sections: string[]; totalTokens: number } {
  const sections: string[] = [];
  let totalTokens = 0;
  for (const pin of pins) {
    const rendered = renderPin(pin.title, pin.content);
    const tokenCost = pin.tokens > 0 ? pin.tokens : estimateTokens(rendered);
    if (budget.tokenLimit !== undefined && budget.estimatedTokens + totalTokens + tokenCost > budget.tokenLimit) {
      log.info(`[contextPacketBuilderPins] pin "${pin.title}" skipped — would exceed token budget`);
      budget.droppedContentNotes.push(`Pinned item "${pin.title}" skipped: would exceed token limit`);
      continue;
    }
    sections.push(rendered);
    totalTokens += tokenCost;
  }
  return { sections, totalTokens };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Injects non-dismissed pinned context items into the packet's `pinnedContext`
 * field. Counts tokens against the shared budget. No-ops gracefully if the
 * pinnedContextStore singleton is not yet initialised.
 *
 * Returns a new packet (original is not mutated).
 */
export function injectPinnedContext(
  packet: ContextPacket,
  sessionId: string,
  budget: ContextBudgetSummary,
): ContextPacket {
  const store = getPinnedContextStore();
  if (!store) return packet;
  const pins = store.list(sessionId);
  if (pins.length === 0) return packet;
  const { sections, totalTokens } = collectRenderedPins(pins, budget);
  if (sections.length === 0) return packet;
  budget.estimatedTokens += totalTokens;
  budget.estimatedBytes += sections.reduce((n, s) => n + s.length, 0);
  log.info(`[contextPacketBuilderPins] injected ${sections.length} pin(s) (~${totalTokens} tokens) for session ${sessionId}`);
  return { ...packet, pinnedContext: sections.join('\n') };
}
