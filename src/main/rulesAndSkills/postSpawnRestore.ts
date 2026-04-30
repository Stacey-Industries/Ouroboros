/**
 * postSpawnRestore.ts — Wave 62 Phase D
 *
 * Fires once per session spawn, AFTER Claude Code has ingested its rules into
 * the system prompt. Moves all disabled rules back to the active dir so that
 * the NEXT session starts with the baseline-on invariant intact.
 *
 * Timing contract: callers MUST invoke this only after the spawned process
 * has emitted its first `system { subtype: 'init' }` event (normal path) or
 * after the first warm-turn message has been written to stdin (warm path).
 * Both are post-system-prompt-ingestion moments.
 *
 * Errors are logged at warn level and never propagate — a restore failure must
 * not affect the running session's success/failure status.
 */

import log from '../logger';
import { restoreAllDisabled } from './rulesDirectoryManager';

async function fireRestore(trigger: 'post-spawn' | 'boot', projectRoot?: string): Promise<void> {
  try {
    const [globalResult, projectResult] = await Promise.all([
      restoreAllDisabled('global'),
      projectRoot
        ? restoreAllDisabled('project', projectRoot)
        : Promise.resolve({ restored: 0, skipped: 0 }),
    ]);
    const total = globalResult.restored + projectResult.restored;
    const skipped = globalResult.skipped + projectResult.skipped;
    if (total > 0 || skipped > 0) {
      log.info('[trace:rules-restore]', { trigger, restored: total, skipped, projectRoot });
    }
  } catch (err) {
    log.warn('[rules-restore] restore failed — session unaffected:', err);
  }
}

export async function firePostSpawnRestore(projectRoot?: string): Promise<void> {
  return fireRestore('post-spawn', projectRoot);
}

/** Wave 62 — boot-time orphan-restore. Crash-safety net for the baseline-on invariant. */
export async function fireBootRestore(defaultProjectRoot?: string): Promise<void> {
  return fireRestore('boot', defaultProjectRoot);
}
