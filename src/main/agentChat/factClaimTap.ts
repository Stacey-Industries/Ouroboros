/**
 * factClaimTap.ts — Thin stream-tap shim for fact-shaped claim detection.
 *
 * Wave 30 Phase F. Extracted from chatOrchestrationBridgeProgress.ts to keep
 * that file under the 300-line ESLint limit.
 *
 * Called once per text-delta chunk with the active stream context.
 * Awaits up to 800ms before returning so the stream is briefly paused while
 * research fires; never throws.
 *
 * Status-chunk emission: the bridge already calls emitStreamChunk to push
 * chunks to listeners. We replicate that path minimally here by accepting an
 * emitStatusChunk callback built by the caller from the active context.
 */

import { maybePauseForFactClaim } from '../research/factClaimPauseOrchestrator';
import { emitStreamChunk } from './chatOrchestrationBridgeMonitor';
import type { ActiveStreamContext, StreamChunkListener } from './chatOrchestrationBridgeTypes';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Tap a text-delta chunk through the fact-claim detector.
 *
 * Builds an emitStatusChunk callback that injects a status text-delta into
 * the active stream so the user sees a brief "checking…" indicator.
 *
 * @param ctx       Active stream context for the current turn.
 * @param listeners Stream chunk listener set (from bridge runtime).
 * @param textDelta The text delta to inspect.
 * @param now       Timestamp for emitted chunks (pass runtime.now()).
 */
export async function tapTextDeltaForFactClaims(
  ctx: ActiveStreamContext,
  listeners: Set<StreamChunkListener>,
  textDelta: string,
  now: number,
): Promise<void> {
  function emitStatusChunk(text: string): void {
    emitStreamChunk(
      listeners,
      {
        threadId: ctx.threadId,
        messageId: ctx.assistantMessageId,
        type: 'text_delta',
        textDelta: text,
        timestamp: now,
      },
      ctx,
    );
  }

  await maybePauseForFactClaim({
    sessionId: ctx.sessionId,
    modelId: ctx.model,
    chunk: textDelta,
    emitStatusChunk,
    maxLatencyMs: 800,
  });
}
