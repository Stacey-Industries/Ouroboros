/**
 * pythonFinder.ts — Shared Python binary detection utility.
 *
 * Extracted from orchestration/contextRetrainTriggerHelpers.ts and
 * router/retrainTriggerHelpers.ts which had identical implementations.
 * Probes candidate binary names in platform-appropriate order and caches
 * the result for the process lifetime.
 */

import { execFile } from 'node:child_process';

// ── Module-level cache ────────────────────────────────────────────────────────

let cachedPythonBin: string | null | undefined;

// ── Private helpers ───────────────────────────────────────────────────────────

function probeCandidate(bin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, ['--version'], { timeout: 5_000 }, (err) => {
      if (err) reject(err);
      else resolve(bin);
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Find the Python binary for the current platform.
 * Returns the first candidate that responds to `--version`, or null if none found.
 * Result is cached for the process lifetime.
 */
export async function findPython(): Promise<string | null> {
  if (cachedPythonBin !== undefined) return cachedPythonBin;

  const candidates =
    process.platform === 'win32' ? ['python', 'python3', 'py'] : ['python3', 'python'];

  for (const bin of candidates) {
    try {
      const found = await probeCandidate(bin);
      cachedPythonBin = found;
      return found;
    } catch {
      continue;
    }
  }

  cachedPythonBin = null;
  return null;
}

/** @internal Reset cache between tests. */
export function resetPythonCache(): void {
  cachedPythonBin = undefined;
}
