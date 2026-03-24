import log from 'electron-log/renderer';
/**
 * Monaco Vim/Emacs keybinding mode support.
 *
 * Uses the `monaco-vim` package for Vim keybindings with a mode indicator
 * status bar. Emacs is stubbed for future `monaco-emacs` integration.
 */
import * as monaco from 'monaco-editor';
import type { RefObject } from 'react';
import { useRef } from 'react';

import type { DiffLineInfo } from '../../types/electron';

// monaco-vim uses a default export

let initVimMode:
  | ((editor: monaco.editor.IStandaloneCodeEditor, statusBarNode: HTMLElement) => VimModeHandle)
  | null = null;

interface VimModeHandle {
  dispose: () => void;
}

// Dynamic import to avoid bundling monaco-vim when not used
let importAttempted = false;
let importFailed = false;

async function ensureVimImported(): Promise<boolean> {
  if (initVimMode) return true;
  if (importFailed) return false;
  if (importAttempted) return false;

  importAttempted = true;
  try {
    const mod = await import('monaco-vim');
    initVimMode = mod.initVimMode ?? mod.default?.initVimMode ?? mod.default;
    if (typeof initVimMode !== 'function') {
      log.warn('monaco-vim loaded but initVimMode not found');
      importFailed = true;
      return false;
    }
    return true;
  } catch (err) {
    log.warn('Failed to load monaco-vim:', err);
    importFailed = true;
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Active vim mode instance
// ────────────────────────────────────────────────────────────────────────────

let activeVimHandle: VimModeHandle | null = null;

/**
 * Enable Vim keybindings on a Monaco editor instance.
 *
 * @param editor - The Monaco standalone code editor
 * @param statusBarElement - An HTMLElement where the Vim mode indicator
 *   (NORMAL / INSERT / VISUAL / COMMAND) will be rendered
 * @returns A dispose function that disables Vim mode, or null if monaco-vim
 *   is not available
 */
export async function enableVimMode(
  editor: monaco.editor.IStandaloneCodeEditor,
  statusBarElement: HTMLElement,
): Promise<(() => void) | null> {
  // Disable any existing vim mode first
  disableVimMode();

  const available = await ensureVimImported();
  if (!available || !initVimMode) {
    log.warn('Vim mode not available — monaco-vim package not loaded');
    return null;
  }

  activeVimHandle = initVimMode(editor, statusBarElement);

  return () => {
    disableVimMode();
  };
}

/**
 * Disable Vim keybindings if currently active.
 */
export function disableVimMode(): void {
  if (activeVimHandle) {
    activeVimHandle.dispose();
    activeVimHandle = null;
  }
}

/**
 * Enable Emacs keybindings on a Monaco editor instance.
 *
 * Stub implementation — will use `monaco-emacs` package when available.
 *
 * @param _editor - The Monaco standalone code editor
 * @returns A dispose function, or null if not available
 */
export async function enableEmacsMode(
  _editor: monaco.editor.IStandaloneCodeEditor,
): Promise<(() => void) | null> {
  void _editor;
  // TODO: Install and integrate `monaco-emacs` package
  // import { EmacsExtension } from 'monaco-emacs';
  // const ext = new EmacsExtension(editor);
  // ext.start();
  // return () => ext.dispose();
  log.warn('Emacs mode not yet implemented — install monaco-emacs package');
  return null;
}

export type KeybindingMode = 'default' | 'vim' | 'emacs';

export function filePathToUri(filePath: string): monaco.Uri {
  const normalized = filePath.replace(/\\/g, '/');
  return monaco.Uri.parse(`file:///${normalized.replace(/^\/+/, '')}`);
}

export function getOrCreateModel(
  filePath: string,
  content: string,
  language: string,
): monaco.editor.ITextModel {
  const uri = filePathToUri(filePath);
  const existing = monaco.editor.getModel(uri);
  if (existing) {
    if (existing.getLanguageId() !== language) monaco.editor.setModelLanguage(existing, language);
    return existing;
  }
  return monaco.editor.createModel(content, language, uri);
}

export function createEditorOptions(
  readOnly: boolean,
  wordWrap: boolean | undefined,
  showMinimap: boolean | undefined,
): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    readOnly,
    theme: 'ouroboros',
    automaticLayout: true,
    minimap: { enabled: showMinimap ?? true },
    stickyScroll: { enabled: true, maxLineCount: 5 },
    lineNumbers: 'on',
    glyphMargin: true,
    folding: true,
    foldingStrategy: 'indentation',
    wordWrap: wordWrap ? 'on' : 'off',
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true },
    smoothScrolling: true,
    scrollBeyondLastLine: false,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    quickSuggestions: readOnly ? false : true,
    suggestOnTriggerCharacters: !readOnly,
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    lineHeight: 20,
    padding: { top: 8, bottom: 8 },
    contextmenu: !readOnly,
  };
}

export function getOverviewRulerColor(kind: DiffLineInfo['kind']): string {
  switch (kind) {
    case 'added':
      return '#3fb950';
    case 'deleted':
      return '#f85149';
    case 'modified':
      return '#2f81f7';
    default:
      return '#6e7681';
  }
}

export function buildDiffDecorations(
  diffLines: DiffLineInfo[],
): monaco.editor.IModelDeltaDecoration[] {
  const seen = new Set<string>();
  return diffLines.flatMap((diffLine) => {
    const lineNumber = Math.max(1, diffLine.line);
    const key = `${lineNumber}:${diffLine.kind}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          isWholeLine: true,
          className: `ouroboros-monaco-diff-line-${diffLine.kind}`,
          linesDecorationsClassName: `ouroboros-monaco-diff-gutter-${diffLine.kind}`,
          overviewRuler: {
            color: getOverviewRulerColor(diffLine.kind),
            position: monaco.editor.OverviewRulerLane.Left,
          },
        },
      },
    ];
  });
}

export function findFilePathForModel(model: monaco.editor.ITextModel): string | null {
  const match = model.uri.toString().match(/^file:\/\/\/(.+)$/);
  return match ? match[1] : null;
}

const viewStateMap = new Map<string, monaco.editor.ICodeEditorViewState>();
const savedVersionIds = new Map<string, number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function getHostViewState(filePath: string): monaco.editor.ICodeEditorViewState | undefined {
  return viewStateMap.get(filePath);
}

export function setHostViewState(
  filePath: string,
  state: monaco.editor.ICodeEditorViewState,
): void {
  viewStateMap.set(filePath, state);
}

export function hasHostSavedVersion(uri: string): boolean {
  return savedVersionIds.has(uri);
}

export function setHostSavedVersion(uri: string, version: number): void {
  savedVersionIds.set(uri, version);
}

export function getHostSavedVersion(uri: string): number | undefined {
  return savedVersionIds.get(uri);
}

export function deleteHostSavedVersion(uri: string): void {
  savedVersionIds.delete(uri);
}

export function scheduleHostViewStateFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushHostViewStatesToStorage();
  }, 30_000);
}

export function flushHostViewStatesToStorage(): void {
  try {
    const entries: Array<[string, { cursorState: unknown; viewState: unknown }]> = [];
    for (const [uri, state] of viewStateMap) {
      entries.push([uri, { cursorState: state.cursorState, viewState: state.viewState }]);
      if (entries.length >= 50) break;
    }
    localStorage.setItem('monaco-view-states', JSON.stringify(entries));
  } catch {
    return;
  }
}

export function setHostDirtyState(
  model: monaco.editor.ITextModel,
  isDirtyRef: RefObject<boolean>,
  onDirtyChangeRef: RefObject<((dirty: boolean) => void) | undefined>,
): void {
  const savedVersion = getHostSavedVersion(model.uri.toString());
  const nowDirty =
    savedVersion !== undefined ? model.getAlternativeVersionId() !== savedVersion : false;
  if (nowDirty !== isDirtyRef.current) {
    isDirtyRef.current = nowDirty;
    onDirtyChangeRef.current?.(nowDirty);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Stable callback refs — keeps closures in mountMonacoEditor in sync with
// the latest React props without re-running the mount effect.
// ────────────────────────────────────────────────────────────────────────────

interface StableCallbackProps {
  onSave?: (content: string) => void; onDirtyChange?: (dirty: boolean) => void;
  onContentChange?: (content: string) => void; readOnly: boolean; formatOnSave: boolean; filePath: string;
}

export interface StableCallbackRefs {
  onSaveRef: RefObject<((content: string) => void) | undefined>;
  onDirtyChangeRef: RefObject<((dirty: boolean) => void) | undefined>;
  onContentChangeRef: RefObject<((content: string) => void) | undefined>;
  readOnlyRef: RefObject<boolean>; formatOnSaveRef: RefObject<boolean>; filePathRef: RefObject<string>;
}

export function useStableCallbackRefs(p: StableCallbackProps): StableCallbackRefs {
  const s = useRef<StableCallbackRefs | null>(null);
  if (!s.current) {
    s.current = {
      onSaveRef: { current: p.onSave }, onDirtyChangeRef: { current: p.onDirtyChange },
      onContentChangeRef: { current: p.onContentChange }, readOnlyRef: { current: p.readOnly },
      formatOnSaveRef: { current: p.formatOnSave }, filePathRef: { current: p.filePath },
    };
  }
  s.current.onSaveRef.current = p.onSave;
  s.current.onDirtyChangeRef.current = p.onDirtyChange;
  s.current.onContentChangeRef.current = p.onContentChange;
  s.current.readOnlyRef.current = p.readOnly;
  s.current.formatOnSaveRef.current = p.formatOnSave;
  s.current.filePathRef.current = p.filePath;
  return s.current;
}
