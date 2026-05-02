/**
 * contextRetrainStartup.ts — Wave 70 Phase A2 wire-up for the context-ranker
 * auto-retrain trigger.
 *
 * Pre-Wave-70: `startContextRetrainTrigger` had zero production callers — the
 * shadow-mode classifier scored every IDE chat session against
 * `BUNDLED_CONTEXT_WEIGHTS` forever. Wave 31's soak gates (held-out AUC > 0.75
 * over ≥ 1000 outcomes) were therefore unreachable: no retrain ever ran.
 *
 * This module is the missing wire. At main-process startup it:
 *   1. Resolves the four paths the trigger needs (decisions/outcomes dirs,
 *      output weights file, trainer script).
 *   2. Calls `startContextRetrainTrigger` if `contextRanker.autoRetrainEnabled`
 *      is on (default true).
 *   3. Stashes the controller for shutdown cleanup.
 *
 * The trigger watches `<userData>` (a directory) post-Wave-70 — see the
 * directory-aware `countRows` extension in `contextRetrainTriggerHelpers.ts`.
 */

import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { getConfigValue } from '../config';
import log from '../logger';
import { type ContextRetrainController, startContextRetrainTrigger } from './contextRetrainTrigger';

// ─── State ────────────────────────────────────────────────────────────────────

let controller: ContextRetrainController | null = null;

// ─── Trainer-script resolution (mirrors router/retrainTrigger.ts) ─────────────

const TRAINER_BASENAME = 'train-context.py';

function resolveTrainerScript(): string | null {
  // Development: relative to repo root
  try {
    const devPath = path.join(app.getAppPath(), 'tools', TRAINER_BASENAME);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- app.getAppPath() is trusted
    if (fs.existsSync(devPath)) return devPath;
  } catch {
    // app may not be ready in non-Electron test environments
  }

  // Packaged: extraResources
  if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
    const resPath = path.join(process.resourcesPath, TRAINER_BASENAME);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- process.resourcesPath is trusted
    if (fs.existsSync(resPath)) return resPath;
  }

  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the context-ranker retrain trigger if `contextRanker.autoRetrainEnabled`
 * is true. Idempotent — calling twice is a no-op.
 *
 * The trigger watches `userDataDir` for `context-outcomes-*.jsonl` growth and
 * spawns `tools/train-context.py` once 200 new outcome rows accumulate. New
 * weights are hot-swapped via `reloadContextWeights()`.
 */
export function startContextRetrainTriggerIfEnabled(userDataDir: string): void {
  if (controller !== null) return;

  const cfg = getConfigValue('contextRanker');
  const enabled = cfg?.autoRetrainEnabled ?? true;
  if (!enabled) {
    log.info('[context-ranker] auto-retrain disabled by config — skipping trigger');
    return;
  }

  const scriptPath = resolveTrainerScript();
  if (!scriptPath) {
    log.warn(
      '[context-ranker] train-context.py not found in dev or resources path — skipping trigger',
    );
    return;
  }

  const weightsOutPath = path.join(userDataDir, 'context-retrained-weights.json');

  // Wave 70 Phase A2: outcomes/decisions paths point at userDataDir (a
  // directory). The trigger's `countRows` and the trainer's `load_jsonl` are
  // both directory-aware — they glob `context-{outcomes,decisions}-*.jsonl`
  // across all date-rotated files.
  controller = startContextRetrainTrigger({
    outcomesPath: userDataDir,
    decisionsPath: userDataDir,
    weightsOutPath,
    scriptPath,
  });
  log.info('[context-ranker] auto-retrain trigger wired at startup');
}

/** Stop the trigger (called from `mainShutdown.ts` during `will-quit`). */
export function stopContextRetrainTrigger(): void {
  if (controller === null) return;
  try {
    controller.stop();
  } catch (err) {
    log.warn('[context-ranker] stop error:', err);
  }
  controller = null;
}

/** Read-only status for IPC/dashboard surfaces (Settings → Context Ranker). */
export function getContextRetrainStatus(): {
  wired: boolean;
  enabled?: boolean;
  lastRunAt?: string | null;
  lastOutcome?: 'success' | 'failure' | 'skipped' | null;
  lastError?: string | null;
  rowCountAtLastRun?: number;
  nextTriggerRowCount?: number;
} {
  if (controller === null) return { wired: false };
  return { wired: true, ...controller.getStatus() };
}
