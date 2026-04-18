/**
 * useShouldShowChangelog — determines whether to display the changelog drawer.
 *
 * Returns true when:
 *  1. The current app version differs from config.platform.lastSeenVersion.
 *  2. There are CHANGELOG entries between lastSeenVersion (exclusive) and
 *     currentVersion (inclusive).
 */
import { useEffect, useState } from 'react';

import { useConfig } from '../../hooks/useConfig';

// Lazy import so missing module is caught at runtime, not load-time.
type ChangelogModule = typeof import('@renderer/generated/changelog');

interface ShouldShowResult {
  shouldShow: boolean;
  currentVersion: string | null;
  /** Versions to display: from currentVersion back to (excl.) lastSeenVersion. */
  visibleVersions: string[];
  /** true if the generated module is absent (dev environment). */
  moduleAbsent: boolean;
}

function semverGte(a: string, b: string): boolean {
  const toNum = (s: string) => s.split('.').map(Number);
  const [aMaj, aMin, aPat] = toNum(a);
  const [bMaj, bMin, bPat] = toNum(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat >= bPat;
}

function computeVisible(
  order: readonly string[],
  current: string,
  lastSeen: string | undefined,
): string[] {
  // Collect versions where: current >= v AND v > lastSeen.
  // "unreleased" is always skipped from display.
  const result: string[] = [];
  for (const v of order) {
    if (v === 'unreleased') continue;
    if (!semverGte(current, v)) continue; // skip versions newer than current
    if (lastSeen && semverGte(lastSeen, v)) continue; // skip already-seen versions
    result.push(v);
  }
  return result;
}

export function useShouldShowChangelog(): ShouldShowResult {
  const { config } = useConfig();
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [mod, setMod] = useState<ChangelogModule | null>(null);
  const [moduleAbsent, setModuleAbsent] = useState(false);

  useEffect(() => {
    window.electronAPI.app.getVersion().then(setCurrentVersion).catch(() => {
      // Non-fatal — show nothing if version fetch fails.
    });
  }, []);

  useEffect(() => {
    import('@renderer/generated/changelog')
      .then(m => setMod(m as unknown as ChangelogModule))
      .catch(() => setModuleAbsent(true));
  }, []);

  if (!currentVersion || !config || moduleAbsent) {
    return { shouldShow: false, currentVersion, visibleVersions: [], moduleAbsent };
  }

  if (!mod) {
    return { shouldShow: false, currentVersion, visibleVersions: [], moduleAbsent: false };
  }

  const lastSeen = config.platform?.lastSeenVersion;
  if (lastSeen === currentVersion) {
    return { shouldShow: false, currentVersion, visibleVersions: [], moduleAbsent: false };
  }

  const visibleVersions = computeVisible(mod.VERSION_ORDER, currentVersion, lastSeen);
  const shouldShow = visibleVersions.length > 0;
  return { shouldShow, currentVersion, visibleVersions, moduleAbsent: false };
}
