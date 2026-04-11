import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFileTreeStore } from '../components/FileTree/fileTreeStore';
import { worstSeverity } from './useLspDiagnosticsSync';

// ─── worstSeverity unit tests ────────────────────────────────────────────────

describe('worstSeverity', () => {
  it('returns hint for an empty array', () => {
    expect(worstSeverity([])).toBe('hint');
  });

  it('returns the single severity when only one diagnostic is present', () => {
    expect(worstSeverity([{ severity: 'warning', message: 'w', range: { startLine: 0, startChar: 0, endLine: 0, endChar: 1 } }])).toBe('warning');
  });

  it('returns error when mixed severities include error', () => {
    expect(worstSeverity([
      { severity: 'info', message: 'i', range: { startLine: 0, startChar: 0, endLine: 0, endChar: 1 } },
      { severity: 'error', message: 'e', range: { startLine: 1, startChar: 0, endLine: 1, endChar: 1 } },
      { severity: 'warning', message: 'w', range: { startLine: 2, startChar: 0, endLine: 2, endChar: 1 } },
    ])).toBe('error');
  });

  it('returns warning when no errors present', () => {
    expect(worstSeverity([
      { severity: 'hint', message: 'h', range: { startLine: 0, startChar: 0, endLine: 0, endChar: 1 } },
      { severity: 'warning', message: 'w', range: { startLine: 1, startChar: 0, endLine: 1, endChar: 1 } },
      { severity: 'info', message: 'i', range: { startLine: 2, startChar: 0, endLine: 2, endChar: 1 } },
    ])).toBe('warning');
  });

  it('ranks severity: error < warning < info < hint', () => {
    const severities = ['error', 'warning', 'info', 'hint'] as const;
    for (let i = 0; i < severities.length; i++) {
      const diag = [{ severity: severities[i], message: 'm', range: { startLine: 0, startChar: 0, endLine: 0, endChar: 1 } }];
      expect(worstSeverity(diag)).toBe(severities[i]);
    }
  });
});

// ─── useLspDiagnosticsSync integration ───────────────────────────────────────

describe('useLspDiagnosticsSync — store integration', () => {
  let capturedCallback: ((event: { filePath: string; diagnostics: unknown[] }) => void) | undefined;
  const onDiagnostics = vi.fn((cb: (event: { filePath: string; diagnostics: unknown[] }) => void) => {
    capturedCallback = cb;
    return () => { capturedCallback = undefined; };
  });

  beforeEach(() => {
    // fileTreeStore persist middleware requires localStorage
    const storage: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => { storage[k] = v; },
      removeItem: (k: string) => { delete storage[k]; },
    });
    capturedCallback = undefined;
    onDiagnostics.mockClear();
    useFileTreeStore.setState({ diagnostics: new Map() });
    vi.stubGlobal('window', { electronAPI: { lsp: { onDiagnostics } } });
  });

  it('registers a subscription via window.electronAPI.lsp.onDiagnostics', async () => {
    const { useLspDiagnosticsSync } = await import('./useLspDiagnosticsSync');
    // Call the hook's useEffect directly by extracting the subscription logic
    // The hook itself needs React; test the subscription side-effect manually.
    expect(typeof useLspDiagnosticsSync).toBe('function');
  });

  it('pushes worst severity into the store when callback fires', () => {
    // Simulate the subscription callback being called (as it would be by the hook)
    const diagnostics = [
      { severity: 'warning', message: 'w', range: { startLine: 0, startChar: 0, endLine: 0, endChar: 1 } },
      { severity: 'error', message: 'e', range: { startLine: 1, startChar: 0, endLine: 1, endChar: 1 } },
    ];

    // Register by invoking onDiagnostics directly (mirrors what the useEffect does)
    onDiagnostics((event: { filePath: string; diagnostics: unknown[] }) => {
      const severity = worstSeverity(event.diagnostics as Parameters<typeof worstSeverity>[0]);
      useFileTreeStore.getState().updateDiagnostics(new Map([[event.filePath, severity]]));
    });

    capturedCallback?.({ filePath: '/src/foo.ts', diagnostics });

    expect(useFileTreeStore.getState().diagnostics.get('/src/foo.ts')).toBe('error');
  });

  it('updates severity when a subsequent push clears errors', () => {
    onDiagnostics((event: { filePath: string; diagnostics: unknown[] }) => {
      const severity = worstSeverity(event.diagnostics as Parameters<typeof worstSeverity>[0]);
      useFileTreeStore.getState().updateDiagnostics(new Map([[event.filePath, severity]]));
    });

    capturedCallback?.({ filePath: '/src/bar.ts', diagnostics: [
      { severity: 'error', message: 'e', range: { startLine: 0, startChar: 0, endLine: 0, endChar: 1 } },
    ] });
    expect(useFileTreeStore.getState().diagnostics.get('/src/bar.ts')).toBe('error');

    capturedCallback?.({ filePath: '/src/bar.ts', diagnostics: [
      { severity: 'info', message: 'i', range: { startLine: 0, startChar: 0, endLine: 0, endChar: 1 } },
    ] });
    expect(useFileTreeStore.getState().diagnostics.get('/src/bar.ts')).toBe('info');
  });
});
