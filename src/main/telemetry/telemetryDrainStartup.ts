/**
 * telemetryDrainStartup.ts — Wave 52 Phase B
 *
 * Boot-time wrapper around `enforceTotalDirCap` + `drainQueue`. Lives in its
 * own file so `main.ts` can stay under the 300-line cap.
 *
 * Gated by `telemetry.parityQueue.enabled` (default true). All errors are
 * caught and logged; a drain failure must never block IDE startup.
 */

import { getConfigValue } from '../config';
import log from '../logger';
import { enforceTotalDirCap } from './queueRotation';
import { drainQueue } from './telemetryDrain';
import { getQueueDir } from './telemetryQueue';

function isParityQueueEnabled(): boolean {
  const tel = getConfigValue('telemetry') as { parityQueue?: { enabled?: boolean } } | undefined;
  return tel?.parityQueue?.enabled !== false;
}

export async function runParityQueueDrain(): Promise<void> {
  if (!isParityQueueEnabled()) return;
  try {
    const queueDir = getQueueDir();
    const cap = enforceTotalDirCap(queueDir);
    if (cap.dropped.length > 0) {
      log.warn('[telemetry-queue] dropped over-cap files:', cap.dropped);
    }
    const summary = await drainQueue();
    if (summary.filesProcessed > 0) {
      log.info('[telemetry-queue] drain summary', summary);
    }
  } catch (err) {
    log.warn('[telemetry-queue] drain failed (non-fatal):', err);
  }
}
