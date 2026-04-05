/**
 * routerExporterHelpers.ts — Pure helpers for the training data export pipeline.
 *
 * Maps quality signals to training labels and builds the record shapes
 * expected by tools/train-router.py.
 */

import type { QualityAnnotation, QualitySignalKind } from './qualitySignalTypes';
import type { EnrichedRoutingLogEntry, ModelTier } from './routerTypes';

/* ── Tier promotion (one step up) ────────────────────────────────────── */

/** Safe tier promotion — avoids security/detect-object-injection. */
function tierUp(tier: ModelTier): ModelTier {
  if (tier === 'HAIKU') return 'SONNET';
  if (tier === 'SONNET') return 'OPUS';
  return 'OPUS';
}

/* ── Signal → label mapping ──────────────────────────────────────────── */

type LabelConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

interface DerivedLabel {
  judgedTier: ModelTier;
  confidence: LabelConfidence;
}

/** Positive signals: routing was adequate → reinforce current tier. */
const POSITIVE_SIGNALS = new Set<QualitySignalKind>([
  'terminal_natural_stop',
  'code_committed',
  'task_completed',
]);

/** Negative signals: routing was wrong → suggest one tier up. */
const NEGATIVE_SIGNALS = new Set<QualitySignalKind>([
  'user_abort',
  'chat_regenerate',
  'chat_correction',
  'terminal_user_abort',
  'task_interrupted',
]);

export function signalToLabel(
  signal: QualityAnnotation,
  routedTier: ModelTier,
): DerivedLabel | null {
  if (signal.signalKind === 'user_override') {
    const model = signal.meta?.userChosenModel as string | undefined;
    const tier = modelToTier(model);
    return tier ? { judgedTier: tier, confidence: 'HIGH' } : null;
  }
  if (POSITIVE_SIGNALS.has(signal.signalKind)) {
    return { judgedTier: routedTier, confidence: 'MEDIUM' };
  }
  if (NEGATIVE_SIGNALS.has(signal.signalKind)) {
    return { judgedTier: tierUp(routedTier), confidence: 'MEDIUM' };
  }
  return null;
}

function modelToTier(model: string | undefined): ModelTier | null {
  if (!model) return null;
  if (model.includes('haiku')) return 'HAIKU';
  if (model.includes('opus')) return 'OPUS';
  if (model.includes('sonnet')) return 'SONNET';
  return null;
}

/* ── Conflicting signal resolution ───────────────────────────────────── */

/** Safe confidence ranking — avoids security/detect-object-injection. */
function confidenceRank(c: LabelConfidence): number {
  if (c === 'HIGH') return 3;
  if (c === 'MEDIUM') return 2;
  return 1;
}

export function pickHighestConfidence(labels: DerivedLabel[]): DerivedLabel | null {
  if (labels.length === 0) return null;
  let best = labels.at(0)!;
  for (let i = 1; i < labels.length; i++) {
    const current = labels.at(i);
    if (current && confidenceRank(current.confidence) > confidenceRank(best.confidence)) {
      best = current;
    }
  }
  return best;
}

/* ── Record builders ─────────────────────────────────────────────────── */

export interface ExtractedRecord {
  id: string;
  prompt: string;
  context_window: unknown[];
  model_used: string;
  interaction_type: string;
  workspace_hash: string | null;
}

export interface JudgedRecord {
  id: string;
  judged_tier: ModelTier;
  confidence: LabelConfidence;
  signal_kind: string;
}

export function buildExtractedRecord(entry: EnrichedRoutingLogEntry): ExtractedRecord {
  return {
    id: entry.traceId,
    prompt: entry.promptFull,
    context_window: [],
    model_used: entry.model,
    interaction_type: entry.interactionType,
    workspace_hash: entry.workspaceRootHash,
  };
}

export function buildJudgedRecord(
  traceId: string,
  label: DerivedLabel,
  signalKind: string,
): JudgedRecord {
  return {
    id: traceId,
    judged_tier: label.judgedTier,
    confidence: label.confidence,
    signal_kind: signalKind,
  };
}
