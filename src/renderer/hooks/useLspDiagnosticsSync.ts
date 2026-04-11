import { useEffect } from 'react';

import type { DiagnosticSeverity } from '../components/FileTree/fileTreeStore';
import { useFileTreeStore } from '../components/FileTree/fileTreeStore';
import type { LspDiagnostic } from '../types/electron';

const SEVERITY_RANK: Record<DiagnosticSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
  hint: 3,
};

/** Exported for testing — returns the highest-priority severity from a diagnostics array. */
export function worstSeverity(diagnostics: LspDiagnostic[]): DiagnosticSeverity {
  let best: DiagnosticSeverity = 'hint';
  for (const d of diagnostics) {
    if (SEVERITY_RANK[d.severity] < SEVERITY_RANK[best]) {
      best = d.severity;
    }
  }
  return best;
}

/**
 * Subscribes to LSP diagnostic push events and syncs them into the file tree store.
 * Mount once near the app root — the subscription persists across panel mount/unmount cycles.
 */
export function useLspDiagnosticsSync(): void {
  useEffect(() => {
    if (!window.electronAPI?.lsp?.onDiagnostics) return;

    const cleanup = window.electronAPI.lsp.onDiagnostics(({ filePath, diagnostics }) => {
      const severity = worstSeverity(diagnostics);
      useFileTreeStore.getState().updateDiagnostics(
        new Map([[filePath, severity]]),
      );
    });

    return cleanup;
  }, []);
}
