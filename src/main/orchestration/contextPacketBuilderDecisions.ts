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
import { normaliseFileId } from './fileIdNormalise';
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
 *
 * @param traceId       Router trace ID — guaranteed non-empty by Phase B.
 * @param selection     Full ranked file list from the context selector.
 * @param files         Files that made it into the packet (budget-pruned subset).
 * @param sessionId     Chat session / thread ID forwarded to the outcome observer.
 * @param workspaceRoot Absolute workspace root for fileId normalisation.
 */
export function emitDecisionsForPacket(
  traceId: string | undefined,
  selection: ContextSelectionResult,
  files: RankedContextFile[],
  sessionId = '',
  workspaceRoot = '',
): void {
  if (!traceId) return;

  const includedPaths = new Set(files.map((f) => f.filePath));
  const allRanked = selection.rankedFiles;

  const features = allRanked.map((rf) => ({
    score: rf.score,
    reasons: rf.reasons.map((r) => ({ kind: r.kind, weight: r.weight })),
    pagerank_score: (rf as unknown as Record<string, unknown>)['pagerank_score'] as number | null ?? null,
    included: includedPaths.has(rf.filePath),
  }));

  const final = allRanked.map((rf) => ({
    fileId: normaliseFileId(rf.filePath, workspaceRoot),
    score: rf.score,
    included: includedPaths.has(rf.filePath),
  }));

  emitContextDecisions(traceId, features, final);

  // Phase B — register the included files so the outcome observer can
  // classify tool-call touches during this turn.
  const includedFiles = files.map((f) => ({
    fileId: normaliseFileId(f.filePath, workspaceRoot),
    path: f.filePath,
  }));
  recordTurnStart(traceId, traceId, includedFiles, sessionId, workspaceRoot);
}
