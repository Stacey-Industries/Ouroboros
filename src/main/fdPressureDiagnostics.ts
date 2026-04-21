/**
 * fdPressureDiagnostics.ts — Lightweight active-handle summaries for EMFILE logs.
 *
 * Node's active handle list is not a perfect mirror of OS handle counts, but it
 * is cheap and good enough to show which handle classes are piling up when the
 * process starts hitting descriptor pressure.
 */

function getActiveHandles(): unknown[] | null {
  // NOTE: process._getActiveHandles() is a Node.js internal API, not guaranteed
  // to be stable across versions. Wrapped in try/catch for safety. If it breaks
  // in a future Electron/Node update, this diagnostic silently degrades.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Node internal API used for diagnostics only
  const getter = (process as any)._getActiveHandles;
  if (typeof getter !== 'function') return null;
  try {
    return getter.call(process) as unknown[];
  } catch {
    return null;
  }
}

function summarizeByType(handles: unknown[]): string {
  const counts = new Map<string, number>();
  for (const handle of handles) {
    const type =
      (typeof handle === 'object' && handle !== null && 'constructor' in handle
        ? (handle as { constructor?: { name?: string } }).constructor?.name
        : undefined) ?? typeof handle;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([type, count]) => `${type}:${count}`)
    .join(', ');
}

/**
 * Best-effort PTY session count. Dynamically resolved so this module stays
 * free of circular imports with `pty.ts`. Node's `_getActiveHandles` does NOT
 * surface node-pty's native conpty handles on Windows, so the session count
 * is the primary signal for PTY-related FD pressure.
 */
function getPtySessionCount(): number | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- avoid circular import; pty.ts imports this file's siblings
    const mod = require('./pty') as { getActiveSessionCount?: () => number };
    return typeof mod.getActiveSessionCount === 'function' ? mod.getActiveSessionCount() : null;
  } catch {
    return null;
  }
}

export function describeFdPressure(): string {
  const handles = getActiveHandles();
  const ptyCount = getPtySessionCount();
  const ptyPart = ptyCount !== null ? `, pty sessions=${ptyCount}` : '';
  if (!handles) return `active handles unavailable${ptyPart}`;
  const summary = summarizeByType(handles);
  return summary
    ? `active handles=${handles.length} (${summary})${ptyPart}`
    : `active handles=${handles.length}${ptyPart}`;
}
