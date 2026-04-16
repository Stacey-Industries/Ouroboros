/**
 * contextOutcomeObserverResearch.ts — Research outcome attribution helper
 * (Wave 25 Phase D).
 *
 * Called from contextOutcomeObserver.observeToolCallBySession for every
 * file-touching tool event. Asks the ResearchCorrelationStore whether this
 * session has a recent research invocation to attribute, and if so emits a
 * line to research-outcomes.jsonl via ResearchOutcomeWriter.
 *
 * Extracted into its own file so contextOutcomeObserver.ts stays under the
 * 300-line ESLint limit and avoids a direct dependency on the research package.
 */

import log from '../logger';
import { getResearchCorrelationStore } from '../research/researchCorrelation';
import { getResearchOutcomeWriter } from '../research/researchOutcomeWriter';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Attribute a file-touching tool call to a research invocation, if any.
 * Emits to research-outcomes.jsonl when attribution succeeds. No-op when no
 * research correlation store or writer is available.
 */
export function attributeResearchOutcome(
  sessionId: string,
  toolName: string,
  filePath: string,
): void {
  try {
    doAttributeResearchOutcome(sessionId, toolName, filePath);
  } catch (err) {
    log.warn('[contextOutcomeObserverResearch] attribution error', err);
  }
}

// ─── Implementation ───────────────────────────────────────────────────────────

function doAttributeResearchOutcome(
  sessionId: string,
  toolName: string,
  filePath: string,
): void {
  const correlationStore = getResearchCorrelationStore();

  const correlationId = correlationStore.attributeOutcome(sessionId, toolName, filePath);
  if (!correlationId) return;

  const invocations = correlationStore.summarizeSession(sessionId);
  const invocation = invocations.find((i) => i.correlationId === correlationId);
  if (!invocation) return;

  const writer = getResearchOutcomeWriter();
  if (!writer) return;

  writer.recordOutcome({ correlationId, sessionId, topic: invocation.topic, toolName, filePath });
  log.info(
    `[contextOutcomeObserverResearch] attributed correlationId=${correlationId} ` +
    `session=${sessionId} tool=${toolName} file=${filePath}`,
  );
}
