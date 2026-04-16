/**
 * contextPacketBuilderDecisions.ts — Emits ContextDecision records after a
 * context packet build completes.
 *
 * Extracted from contextPacketBuilder.ts to keep that file under the 300-line
 * ESLint limit. Called once per packet build with the final ranked file list.
 */

import type { ContextSelectionResult } from './contextSelector';
import { emitContextDecisions } from './contextSignalCollector';
import type { RankedContextFile } from './types';

/**
 * Derive ContextFeatures + FinalDecision pairs from the selector result and
 * the set of files that made it into the packet, then hand them to the
 * contextSignalCollector for JSONL writing.
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
}
