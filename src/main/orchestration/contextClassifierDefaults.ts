/**
 * contextClassifierDefaults.ts — Bundled fallback weights for the context ranker.
 *
 * Conservative hand-tuned approximation used when no retrained-weights file exists.
 * Replaced at runtime via reloadContextWeights() once train-context.py produces
 * real weights.
 *
 * Feature intuition:
 *   - recencyScore / pagerankScore / keywordOverlap: positive — more relevant
 *   - importDistance: negative — farther from seed files = less relevant
 *   - prevUsedCount: positive — files the agent has used before are good context
 *   - toolKindHint_edit / _write: slight positive — agent is more likely to need
 *     files it will modify
 *   - toolKindHint_read: neutral — reads are common; not a strong signal alone
 *   - toolKindHint_other: zero — no learned signal yet
 *
 * Version 'bundled-1' is a sentinel — hot-swap comparisons will always show a
 * change once real trained weights arrive.
 */

import type { ContextRankerWeights } from './contextClassifier';

export const BUNDLED_CONTEXT_WEIGHTS: ContextRankerWeights = {
  version: 'bundled-1',
  featureOrder: [
    'recencyScore',
    'pagerankScore',
    'importDistance',
    'keywordOverlap',
    'prevUsedCount',
    'toolKindHint_read',
    'toolKindHint_edit',
    'toolKindHint_write',
    'toolKindHint_other',
  ],
  weights: [0.7, 0.9, -0.8, 0.6, 0.5, 0.1, 0.3, 0.4, 0.0],
  bias: -0.5,
  metrics: {
    samples: 0,
    syntheticNegatives: 0,
    heldOutAuc: 0,
    trainedAt: '1970-01-01T00:00:00Z',
    belowMinSamples: true,
    classBalance: { pos: 0, neg: 0 },
  },
};
