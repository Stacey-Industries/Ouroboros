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

export function describeFdPressure(): string {
  const handles = getActiveHandles();
  if (!handles) return 'active handles unavailable';

  const summary = summarizeByType(handles);
  return summary
    ? `active handles=${handles.length} (${summary})`
    : `active handles=${handles.length}`;
}
