/**
 * contextRankerDashboardHandlers.ts — IPC handler for the context ranker
 * observability dashboard (Wave 31 Phase F).
 *
 * Channel: context:getRankerDashboard
 *
 * Aggregates data from contextClassifier.ts (active weights, version,
 * trainedAt, AUC, feature importance top-5).
 */

import { ipcMain } from 'electron';

import log from '../logger';
import { getActiveWeights } from '../orchestration/contextClassifier';
import { getContextRetrainStatus } from '../orchestration/contextRetrainStartup';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContextRankerFeature {
  name: string;
  weight: number;
}

/**
 * Wave 70 follow-up — surface auto-retrain trigger status alongside the active
 * weights. Lets a Settings → Context Ranker readout show whether the trigger
 * is wired, when it last ran, and what its outcome was. Pre-fix the getter
 * was exported from `contextRetrainStartup.ts` but never reached the renderer.
 */
export interface ContextRetrainStatusDTO {
  wired: boolean;
  enabled?: boolean;
  lastRunAt?: string | null;
  lastOutcome?: 'success' | 'failure' | 'skipped' | null;
  lastError?: string | null;
  rowCountAtLastRun?: number;
  nextTriggerRowCount?: number;
}

export interface ContextRankerDashboard {
  version: string;
  trainedAt: string;
  auc: number | null;
  topFeatures: ContextRankerFeature[];
  /** Wave 70 — auto-retrain trigger status, or null if the getter throws. */
  retrain: ContextRetrainStatusDTO | null;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function computeTopFeatures(
  featureOrder: readonly string[],
  weights: readonly number[],
): ContextRankerFeature[] {
  const paired: ContextRankerFeature[] = featureOrder.map((name, i) => ({
    name,
    // Use .at() to satisfy security/detect-object-injection — avoids bracket access
    weight: weights.at(i) ?? 0,
  }));
  return paired
    .slice()
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 5);
}

export function getRankerDashboard(): ContextRankerDashboard {
  const w = getActiveWeights();
  const isBundled = w.version === 'bundled-1';
  const auc = isBundled || w.metrics.heldOutAuc === 0 ? null : w.metrics.heldOutAuc;

  let retrain: ContextRetrainStatusDTO | null;
  try {
    retrain = getContextRetrainStatus();
  } catch (err) {
    log.warn('[contextRankerDashboard] retrain status read failed:', err);
    retrain = null;
  }

  return {
    version: w.version,
    trainedAt: w.metrics.trainedAt,
    auc,
    topFeatures: computeTopFeatures(w.featureOrder, w.weights),
    retrain,
  };
}

// ─── Registration ─────────────────────────────────────────────────────────────

let registeredChannels: string[] = [];

export function registerContextRankerDashboardHandlers(): string[] {
  const channels: string[] = [];

  ipcMain.removeHandler('context:getRankerDashboard');
  ipcMain.handle('context:getRankerDashboard', () => {
    try {
      const dashboard = getRankerDashboard();
      return { success: true, dashboard };
    } catch (err) {
      log.error('[contextRankerDashboard] getRankerDashboard error:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
  channels.push('context:getRankerDashboard');

  registeredChannels = channels;
  return channels;
}

export function cleanupContextRankerDashboardHandlers(): void {
  for (const ch of registeredChannels) {
    ipcMain.removeHandler(ch);
  }
  registeredChannels = [];
}
