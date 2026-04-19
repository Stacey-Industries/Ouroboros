/**
 * researchCacheScheduler.ts — Scheduled purge for the research artifact cache.
 *
 * Runs purgeExpired() once at startup (setImmediate) then on a daily interval
 * so the cache does not grow unboundedly (HIGH-D addendum, Wave 41 Phase F.4).
 */

import path from 'path';

import log from '../logger';
import { getResearchCache } from './researchCache';

const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

let _purgeHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Schedule daily research-cache expiry purge.
 * Runs once immediately (setImmediate) then every 24 h.
 */
export function scheduleResearchCachePurge(userDataPath: string): void {
  const dbPath = path.join(userDataPath, 'research-cache.db');
  const runPurge = (): void => {
    try {
      const cache = getResearchCache(dbPath);
      const deleted = cache.purgeExpired();
      if (deleted > 0) log.info(`[researchCache] purged ${deleted} expired entries`);
    } catch (err) {
      log.warn('[researchCache] purge error:', err);
    }
  };
  setImmediate(runPurge);
  _purgeHandle = setInterval(runPurge, PURGE_INTERVAL_MS);
  if (
    typeof _purgeHandle === 'object' &&
    _purgeHandle !== null &&
    'unref' in _purgeHandle
  ) {
    (_purgeHandle as NodeJS.Timeout).unref();
  }
}

/** @internal Test-only — clear the research cache purge interval. */
export function _clearResearchCachePurgeForTests(): void {
  if (_purgeHandle !== null) {
    clearInterval(_purgeHandle);
    _purgeHandle = null;
  }
}
