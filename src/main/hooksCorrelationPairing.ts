/**
 * hooksCorrelationPairing.ts — Mint and pair correlationIds across
 * pre_tool_use / post_tool_use hook events within the main process.
 *
 * Claude Code hook scripts already include `tool_use_id` in the envelope.
 * We use (sessionId + toolUseId) as the pairing key: on `pre_tool_use` we
 * mint a fresh UUID and store it; on `post_tool_use` we look it up and attach
 * the same id. Entries older than TTL_MS are evicted on the next write.
 *
 * The hook scripts themselves are NOT modified — all minting is in-process.
 */

import crypto from 'node:crypto';

// ─── Constants ────────────────────────────────────────────────────────────────

const TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─── State ────────────────────────────────────────────────────────────────────

interface PairEntry {
  correlationId: string;
  mintedAt: number;
}

/** Key: `${sessionId}\x00${toolUseId}` */
const pairMap = new Map<string, PairEntry>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pairKey(sessionId: string, toolUseId: string): string {
  return `${sessionId}\x00${toolUseId}`;
}

function evictExpired(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [key, entry] of pairMap) {
    if (entry.mintedAt < cutoff) pairMap.delete(key);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * On pre_tool_use: mint a new correlationId and store it under the pair key.
 * Returns the minted id so the caller can attach it to the payload.
 */
export function mintCorrelationId(sessionId: string, toolUseId: string): string {
  evictExpired();
  const correlationId = crypto.randomUUID();
  pairMap.set(pairKey(sessionId, toolUseId), { correlationId, mintedAt: Date.now() });
  return correlationId;
}

/**
 * On post_tool_use: look up the paired id from the matching pre_tool_use.
 * Deletes the entry after lookup (each pair is consumed once).
 * If not found (pair evicted or mismatched), mints a fresh fallback id.
 */
export function resolveCorrelationId(sessionId: string, toolUseId: string): string {
  const key = pairKey(sessionId, toolUseId);
  const entry = pairMap.get(key);
  if (entry) {
    pairMap.delete(key);
    return entry.correlationId;
  }
  // No pair found — mint a fresh id rather than blocking
  return crypto.randomUUID();
}

/**
 * Attaches a correlationId to the hook payload in-place using the pairing map.
 * Call this before passing the payload to `store.record()` so both the stored
 * event and downstream observers see the same id.
 */
export function pairCorrelationId(payload: {
  type: string;
  sessionId: string;
  toolCallId?: string;
  requestId?: string;
  correlationId?: string;
}): void {
  const toolUseId = payload.toolCallId ?? payload.requestId ?? '';
  if (payload.type === 'pre_tool_use') {
    payload.correlationId = mintCorrelationId(payload.sessionId, toolUseId);
  } else if (payload.type === 'post_tool_use') {
    payload.correlationId = resolveCorrelationId(payload.sessionId, toolUseId);
  }
}

/** @internal Test-only — clears pairing state between test cases. */
export function _resetPairMapForTests(): void {
  pairMap.clear();
}

/** @internal Test-only — returns current map size. */
export function _pairMapSize(): number {
  return pairMap.size;
}
