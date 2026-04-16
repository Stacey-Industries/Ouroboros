/**
 * contextPacketBuilderDecisions.ts — Emits ContextDecision records after a
 * context packet build completes.
 *
 * Extracted from contextPacketBuilder.ts to keep that file under the 300-line
 * ESLint limit. Called once per packet build with the final ranked file list.
 */

import { recordTurnStart } from './contextOutcomeObserver';
import type { ContextSelectionResult } from './contextSelector';
import { emitContextDecisions } from './contextSignalCollector';
import type { RankedContextFile } from './types';

/**
 * Derive ContextFeatures + FinalDecision pairs from the selector result and
 * the set of files that made it into the packet, then hand them to the
 * contextSignalCollector for JSONL writing.
 *
 * Also registers the turn with the outcome observer so that subsequent tool
 * calls can be tracked against the included-file set (Phase B).
 *
 * No-op when traceId is absent (cache-hit paths re-use the original trace).
 */
export function emitDecisionsForPacket(
  traceId: string | undefined,
  selection: ContextSelectionResult,
  files: RankedContextFile[],
): void {
  if (!traceId) return;

  const includedPaths = new Set(files.map((f) => f.filePath));
  const allRanked = selection.rankedFiles;

  const features = allRanked.map((rf) => ({
    score: rf.score,
    reasons: rf.reasons.map((r) => ({ kind: r.kind, weight: r.weight })),
    pagerank_score: (rf as Record<string, unknown>)['pagerank_score'] as number | null ?? null,
    included: includedPaths.has(rf.filePath),
  }));

  const final = allRanked.map((rf) => ({
    fileId: rf.filePath,
    score: rf.score,
    included: includedPaths.has(rf.filePath),
  }));

  emitContextDecisions(traceId, features, final);

  // Phase B — register the included files so the outcome observer can
  // classify tool-call touches during this turn.
  // turnId = traceId; tool events will be routed via sessionId → traceId map.
  const includedFiles = files.map((f) => ({ fileId: f.filePath, path: f.filePath }));
  recordTurnStart(traceId, traceId, includedFiles);
}
