/**
 * Monaco LSP lifecycle — didOpen/didChange/didClose and diagnostics markers.
 *
 * Mirrors the CodeMirror LSP integration in InlineEditor.cm.ts but uses
 * Monaco's marker API instead of CodeMirror's linter extension.
 */
import * as monaco from 'monaco-editor';
import { type MutableRefObject, useEffect, useRef } from 'react';

import type { LspDiagnostic } from '../../types/electron';
import { hasLspApi, normalizeFilePath } from './lspShared';
import { setActiveLspContext } from './monacoLspContext';

/** Maps file extension to the LSP server language key. */
const SERVER_LANG_BY_EXT: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript',
  '.py': 'python', '.rs': 'rust', '.go': 'go',
  '.css': 'css', '.html': 'html', '.json': 'json',
};

export function detectLspLanguage(fp: string): string | null {
  const dotIdx = fp.lastIndexOf('.');
  if (dotIdx < 0) return null;
  return SERVER_LANG_BY_EXT[fp.slice(dotIdx).toLowerCase()] ?? null;
}

const SEVERITY_MAP: Record<string, monaco.MarkerSeverity> = {
  error: monaco.MarkerSeverity.Error,
  warning: monaco.MarkerSeverity.Warning,
  info: monaco.MarkerSeverity.Info,
  hint: monaco.MarkerSeverity.Hint,
};

export function mapDiagnosticsToMarkers(
  diagnostics: LspDiagnostic[],
): monaco.editor.IMarkerData[] {
  return diagnostics.map((d) => ({
    severity: SEVERITY_MAP[d.severity] ?? monaco.MarkerSeverity.Info,
    startLineNumber: d.range.startLine + 1,
    startColumn: d.range.startChar + 1,
    endLineNumber: d.range.endLine + 1,
    endColumn: d.range.endChar + 1,
    message: d.message,
    source: 'lsp',
  }));
}

export function scheduleLspDidChange(
  root: string,
  filePath: string,
  content: string,
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
): void {
  if (!hasLspApi()) return;
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(() => {
    window.electronAPI.lsp.didChange(root, filePath, content).catch(() => {});
  }, 200);
}

// ── Session helpers (options-object pattern to stay ≤4 params) ────────────

interface LspSessionOpts {
  root: string;
  filePath: string;
  language: string;
  content: string;
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
}

function startLspSession(opts: LspSessionOpts): (() => void) | null {
  const { root, filePath, language, content, editorRef } = opts;
  setActiveLspContext(root, filePath);
  window.electronAPI.lsp.start(root, language).catch(() => {});
  window.electronAPI.lsp.didOpen(root, filePath, content).catch(() => {});

  const norm = normalizeFilePath(filePath);
  return window.electronAPI.lsp.onDiagnostics((event) => {
    if (normalizeFilePath(event.filePath) !== norm) return;
    const model = editorRef.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(model, 'lsp', mapDiagnosticsToMarkers(event.diagnostics));
  });
}

interface LspCleanupOpts {
  root: string;
  filePath: string;
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  diagCleanup: (() => void) | null;
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

function cleanupLspSession(opts: LspCleanupOpts): void {
  window.electronAPI.lsp.didClose(opts.root, opts.filePath).catch(() => {});
  opts.diagCleanup?.();
  const model = opts.editorRef.current?.getModel();
  if (model) monaco.editor.setModelMarkers(model, 'lsp', []);
  if (opts.timerRef.current) { clearTimeout(opts.timerRef.current); opts.timerRef.current = null; }
  setActiveLspContext(null, null);
}

// ── Lifecycle hook ───────────────────────────────────────────────────────

interface LspLifecycleInput {
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  filePath: string;
  projectRoot: string | null | undefined;
  content: string;
}

export function useMonacoLspLifecycle(
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>,
  filePath: string,
  projectRoot: string | null | undefined,
  content: string,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input: LspLifecycleInput = { editorRef, filePath, projectRoot, content };
  useLspOpenClose(input, timerRef);
  useLspDidChange(input, timerRef);
}

function useLspOpenClose(
  input: LspLifecycleInput,
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
): void {
  const { editorRef, filePath, projectRoot, content } = input;
  useEffect(() => {
    if (!hasLspApi() || !projectRoot || !filePath) return;
    const root = projectRoot;
    const lang = detectLspLanguage(filePath);
    if (!lang) return;

    let cancelled = false;
    let diagCleanup: (() => void) | null = null;

    window.electronAPI.config.get('lspEnabled').then((enabled) => {
      if (!enabled || cancelled) return;
      diagCleanup = startLspSession({ root, filePath, language: lang, content, editorRef });
    }).catch(() => {});

    return () => {
      cancelled = true;
      cleanupLspSession({ root, filePath, editorRef, diagCleanup, timerRef });
    };
  }, [filePath, projectRoot, editorRef, content, timerRef]);
}

function useLspDidChange(
  input: LspLifecycleInput,
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
): void {
  const { editorRef, filePath, projectRoot } = input;
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model || !projectRoot || !filePath) return;
    if (!hasLspApi() || !detectLspLanguage(filePath)) return;

    const root = projectRoot;
    const disposable = model.onDidChangeContent(() => {
      scheduleLspDidChange(root, filePath, model.getValue(), timerRef);
    });
    return () => disposable.dispose();
  }, [editorRef, filePath, projectRoot, timerRef]);
}
