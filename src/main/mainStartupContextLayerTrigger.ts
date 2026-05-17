/**
 * mainStartupContextLayerTrigger.ts — Wave 69 follow-up.
 *
 * Triggers a contextLayer rebuild after the codebase-memory graph finishes
 * its initial index. The contextLayer's first cold-start rebuild typically
 * races ahead of graph indexing (graph still empty when generateRepoMap
 * runs), so every signature ends up null via the soft-fallback path.
 * Re-running once the graph is populated picks up real signatures, hotspot
 * scores, and graph-derived deps.
 *
 * Extracted from mainStartup.ts to keep that file under the 300-line limit.
 */

import log from './logger';

export async function triggerContextLayerRebuildAfterGraphReady(): Promise<void> {
  const t0 = Date.now();
  log.info(
    `[trace:post-graph-forceRebuild] triggered — heapMB=${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}`,
  );
  try {
    const { getContextLayerController } = await import('./contextLayer/contextLayerController');
    const ctrl = getContextLayerController();
    if (!ctrl) {
      log.info('[trace:post-graph-forceRebuild] no controller — skipping');
      return;
    }
    log.info('[context-layer] graph index ready — triggering forceRebuild');
    await ctrl.forceRebuild();
    log.info(
      `[context-layer] forceRebuild after graph-ready complete — elapsed=${Date.now() - t0}ms`,
    );
  } catch (err) {
    log.warn('[context-layer] post-graph-ready rebuild failed:', err);
  }
}
