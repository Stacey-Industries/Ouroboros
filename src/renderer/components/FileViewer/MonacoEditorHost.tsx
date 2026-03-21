/**
 * MonacoEditorHost — single persistent editor instance per pane.
 *
 * Unlike `MonacoEditor` (which recreates the editor widget on every file switch
 * via `key={filePath}`), this component creates ONE `monaco.editor.create()` on
 * mount and reuses it across file switches by swapping models via
 * `editor.setModel()`. This eliminates the ~100-200ms blank flash on tab switch.
 *
 * View state (cursor, scroll, folds) is saved/restored from an in-memory
 * `Map<string, ICodeEditorViewState>` with periodic flush to localStorage for
 * cross-session persistence.
 *
 * Dirty tracking uses `model.getAlternativeVersionId()` (O(1) integer comparison)
 * instead of `model.getValue() !== savedContent` (O(n) string comparison).
 */
import * as monaco from 'monaco-editor';
import React, { memo,useCallback, useEffect, useRef, useState } from 'react';

import type { DiffLineInfo } from '../../types/electron';
import {
  registerMonacoEditor,
  unregisterMonacoEditor,
} from './editorRegistry';
import { detectLanguage,initMonaco } from './monacoSetup';
import { useMonacoTheme } from './monacoThemeBridge';
import {
  enableEmacsMode,
  enableVimMode,
  type KeybindingMode,
} from './monacoVimMode';
import { ScrollIndicator } from './ScrollIndicator';

// ── Re-export existing utilities ─────────────────────────────────────────────
export type { KeybindingMode } from './monacoVimMode';

export interface MonacoEditorHostProps {
  /** Absolute file path — used for model URI and language detection */
  filePath: string;
  /** File content to display */
  content: string;
  /** Monaco language ID override (auto-detected from filePath if omitted) */
  language?: string;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Called when the user saves (Ctrl+S / Cmd+S) */
  onSave?: (content: string) => void;
  /** Called when the dirty state changes */
  onDirtyChange?: (dirty: boolean) => void;
  /** Called on every content change */
  onContentChange?: (content: string) => void;
  /** Keybinding mode: 'default', 'vim', or 'emacs' */
  keybindingMode?: KeybindingMode;
  /** Additional CSS class for the container */
  className?: string;
  /** External word-wrap toggle (driven by toolbar) */
  wordWrap?: boolean;
  /** External minimap toggle (driven by toolbar) */
  showMinimap?: boolean;
  /** Format document before saving (requires formatting provider) */
  formatOnSave?: boolean;
  /** Diff markers to render in read-only code mode */
  diffLines?: DiffLineInfo[];
}

// Ensure Monaco is initialized before any editor is created
initMonaco();

// ── Shared state across all MonacoEditorHost instances ───────────────────────

/**
 * In-memory view state map — stores full Monaco ICodeEditorViewState per URI.
 * This is the primary store; localStorage is the secondary persistence layer.
 */
const viewStateMap = new Map<string, monaco.editor.ICodeEditorViewState>();

/**
 * Saved version IDs for dirty tracking — maps URI string to the
 * `getAlternativeVersionId()` at last save.
 */
const savedVersionIds = new Map<string, number>();

/**
 * Flush the top N most-recently-accessed view states to localStorage
 * for cross-session persistence. Called periodically and on unmount.
 */
const VIEW_STATE_STORAGE_KEY = 'monaco-view-states';
const MAX_PERSISTED_ENTRIES = 50;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleViewStateFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushViewStatesToStorage();
  }, 30_000); // Flush every 30 seconds
}

function flushViewStatesToStorage(): void {
  try {
    // We only persist cursor position and scroll — ICodeEditorViewState
    // contains non-serializable contribution state, so we extract the basics.
    const entries: Array<[string, { cursorState: unknown; viewState: unknown }]> = [];
    for (const [uri, state] of viewStateMap) {
      entries.push([uri, {
        cursorState: state.cursorState,
        viewState: state.viewState,
      }]);
      if (entries.length >= MAX_PERSISTED_ENTRIES) break;
    }
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage quota exceeded — silently ignore
  }
}

// ── URI / Model helpers ──────────────────────────────────────────────────────

/**
 * Convert a file path to a Monaco URI.
 * Using file:// scheme so Monaco can scope models per-file.
 */
function filePathToUri(filePath: string): monaco.Uri {
  const normalized = filePath.replace(/\\/g, '/');
  return monaco.Uri.parse(`file:///${normalized.replace(/^\/+/, '')}`);
}

/**
 * Get or create a Monaco text model for the given file path and content.
 * Reuses existing models to enable multi-tab / split-view scenarios.
 */
function getOrCreateModel(
  filePath: string,
  content: string,
  language: string,
): monaco.editor.ITextModel {
  const uri = filePathToUri(filePath);
  const existing = monaco.editor.getModel(uri);
  if (existing) {
    // Update language if it changed
    if (existing.getLanguageId() !== language) {
      monaco.editor.setModelLanguage(existing, language);
    }
    return existing;
  }
  return monaco.editor.createModel(content, language, uri);
}

// ── Component ────────────────────────────────────────────────────────────────

export const MonacoEditorHost = memo(function MonacoEditorHost(
  props: MonacoEditorHostProps,
): React.ReactElement {
  const {
    filePath,
    content,
    language: languageOverride,
    readOnly = false,
    onSave,
    onDirtyChange,
    onContentChange,
    keybindingMode = 'default',
    className,
    wordWrap: wordWrapProp,
    showMinimap: showMinimapProp,
    formatOnSave = false,
    diffLines = [],
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const vimStatusRef = useRef<HTMLDivElement>(null);
  const vimDisposeRef = useRef<(() => void) | null>(null);
  const isDirtyRef = useRef(false);
  const contentChangeDisposableRef = useRef<monaco.IDisposable | null>(null);
  const saveActionDisposableRef = useRef<monaco.IDisposable | null>(null);
  const diffDecorationIdsRef = useRef<string[]>([]);

  // Stable refs for callbacks (avoids re-registering on every render)
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;
  const formatOnSaveRef = useRef(formatOnSave);
  formatOnSaveRef.current = formatOnSave;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  // Track the current filePath to avoid stale closures
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;

  // ── Scroll indicator state ───────────────────────────────────────────────
  const [scrollMetrics, setScrollMetrics] = useState({
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
  });
  const [isEditorHovered, setIsEditorHovered] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the theme in sync with CSS vars
  useMonacoTheme();

  const language = languageOverride ?? detectLanguage(filePath);

  // ── Create editor ONCE on mount ──────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const model = getOrCreateModel(filePath, content, language);

    // If the model already has content that differs from what we got,
    // update it (e.g., file reloaded from disk)
    if (model.getValue() !== content) {
      model.setValue(content);
    }

    // Initialize saved version ID for dirty tracking
    if (!savedVersionIds.has(model.uri.toString())) {
      savedVersionIds.set(model.uri.toString(), model.getAlternativeVersionId());
    }

    const editor = monaco.editor.create(container, {
      model,
      readOnly,
      theme: 'ouroboros',
      automaticLayout: true,

      // Core features
      minimap: { enabled: showMinimapProp ?? true },
      stickyScroll: { enabled: true, maxLineCount: 5 },
      lineNumbers: 'on',
      glyphMargin: true,
      folding: true,
      foldingStrategy: 'indentation',
      wordWrap: wordWrapProp ? 'on' : 'off',
      renderWhitespace: 'selection',
      bracketPairColorization: { enabled: true },
      guides: {
        bracketPairs: true,
        indentation: true,
      },

      // Scroll
      smoothScrolling: true,
      scrollBeyondLastLine: false,

      // Cursor
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',

      // Suggestion / autocomplete
      quickSuggestions: readOnly ? false : true,
      suggestOnTriggerCharacters: !readOnly,

      // Font — inherit from CSS vars
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      lineHeight: 20,

      // Padding
      padding: { top: 8, bottom: 8 },

      // Disable context menu in read-only
      contextmenu: !readOnly,
    });

    editorRef.current = editor;

    // Register in editor registry
    registerMonacoEditor(filePath, editor);

    // Restore view state from in-memory map
    const savedViewState = viewStateMap.get(filePath);
    if (savedViewState) {
      requestAnimationFrame(() => {
        editor.restoreViewState(savedViewState);
      });
    }

    // ── Save keybinding (Ctrl+S / Cmd+S) ──────────────────────────────────
    const registerSaveAction = (): monaco.IDisposable => {
      return editor.addAction({
        id: 'ouroboros-save',
        label: 'Save File',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => {
          if (readOnlyRef.current) return;
          const doSave = (): void => {
            const currentModel = editor.getModel();
            if (!currentModel) return;
            const currentContent = currentModel.getValue();
            // Update saved version ID
            savedVersionIds.set(
              currentModel.uri.toString(),
              currentModel.getAlternativeVersionId(),
            );
            // Reset dirty state
            if (isDirtyRef.current) {
              isDirtyRef.current = false;
              onDirtyChangeRef.current?.(false);
            }
            onSaveRef.current?.(currentContent);
          };

          if (formatOnSaveRef.current) {
            const formatAction = editor.getAction('editor.action.formatDocument');
            if (formatAction) {
              formatAction.run().then(doSave).catch(doSave);
              return;
            }
          }
          doSave();
        },
      });
    };
    saveActionDisposableRef.current = registerSaveAction();

    // ── Track dirty state and content changes ──────────────────────────────
    const registerContentChangeListener = (m: monaco.editor.ITextModel): monaco.IDisposable => {
      return m.onDidChangeContent(() => {
        const uriStr = m.uri.toString();
        const savedVer = savedVersionIds.get(uriStr);
        const nowDirty = savedVer !== undefined
          ? m.getAlternativeVersionId() !== savedVer
          : false;

        if (nowDirty !== isDirtyRef.current) {
          isDirtyRef.current = nowDirty;
          onDirtyChangeRef.current?.(nowDirty);
        }

        onContentChangeRef.current?.(m.getValue());
      });
    };
    contentChangeDisposableRef.current = registerContentChangeListener(model);

    // ── Listen for goto-line events from Outline panel ────────────────────
    const handleGotoLine = (e: Event): void => {
      const detail = (e as CustomEvent<{ line: number; filePath?: string }>).detail;
      if (!detail) return;
      if (detail.filePath && detail.filePath !== filePathRef.current) return;
      editor.revealLineInCenter(detail.line);
      editor.setPosition({ lineNumber: detail.line, column: 1 });
      editor.focus();
    };
    window.addEventListener('agent-ide:goto-line', handleGotoLine);

    // ── Track scroll metrics for ScrollIndicator ──────────────────────────
    const updateScrollMetrics = (): void => {
      const scrollTop = editor.getScrollTop();
      const scrollHeight = editor.getScrollHeight();
      const layoutInfo = editor.getLayoutInfo();
      setScrollMetrics({
        scrollTop,
        scrollHeight,
        clientHeight: layoutInfo.height,
      });
    };
    requestAnimationFrame(updateScrollMetrics);
    const scrollDisposable = editor.onDidScrollChange(() => {
      updateScrollMetrics();
      setIsScrolling(true);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => setIsScrolling(false), 800);
    });
    const layoutDisposable = editor.onDidLayoutChange(updateScrollMetrics);

    // ── Cleanup (unmount only — NOT on file switch) ───────────────────────
    return () => {
      // Save view state for the current file before disposing
      const currentModel = editor.getModel();
      if (currentModel) {
        const vs = editor.saveViewState();
        if (vs) {
          const currentFilePath = filePathRef.current;
          viewStateMap.set(currentFilePath, vs);
          scheduleViewStateFlush();
        }
        unregisterMonacoEditor(filePathRef.current);
      }

      window.removeEventListener('agent-ide:goto-line', handleGotoLine);

      // Dispose vim/emacs mode before editor
      if (vimDisposeRef.current) {
        vimDisposeRef.current();
        vimDisposeRef.current = null;
      }
      scrollDisposable.dispose();
      layoutDisposable.dispose();
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      contentChangeDisposableRef.current?.dispose();
      contentChangeDisposableRef.current = null;
      saveActionDisposableRef.current?.dispose();
      saveActionDisposableRef.current = null;

      // Dispose the editor widget — NOT the model (models are owned by tabs)
      editor.dispose();
      editorRef.current = null;

      // Flush view states on unmount
      flushViewStatesToStorage();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount once — model swapping is handled by the filePath effect below

  // ── Model swap on filePath change ──────────────────────────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const currentModel = editor.getModel();
    const lang = languageOverride ?? detectLanguage(filePath);
    const targetModel = getOrCreateModel(filePath, content, lang);

    // If we're already showing this model, skip the swap
    if (currentModel === targetModel) {
      // Still might need to update content if reloaded from disk
      if (targetModel.getValue() !== content) {
        targetModel.pushEditOperations(
          [],
          [{ range: targetModel.getFullModelRange(), text: content }],
          () => null,
        );
        savedVersionIds.set(
          targetModel.uri.toString(),
          targetModel.getAlternativeVersionId(),
        );
        isDirtyRef.current = false;
        onDirtyChangeRef.current?.(false);
      }
      return;
    }

    // ── Save view state for outgoing model ─────────────────────────────────
    if (currentModel) {
      const vs = editor.saveViewState();
      if (vs) {
        // Find the file path for the outgoing model
        const outgoingPath = findFilePathForModel(currentModel);
        if (outgoingPath) {
          viewStateMap.set(outgoingPath, vs);
          scheduleViewStateFlush();
        }
      }
      // Unregister old file from editor registry
      const oldPath = findFilePathForModel(currentModel);
      if (oldPath) {
        unregisterMonacoEditor(oldPath);
      }
    }

    // ── Dispose old content change listener ────────────────────────────────
    contentChangeDisposableRef.current?.dispose();
    contentChangeDisposableRef.current = null;

    // ── Swap model ─────────────────────────────────────────────────────────
    editor.setModel(targetModel);

    // If the model content differs from what was passed (e.g., file reloaded)
    if (targetModel.getValue() !== content) {
      targetModel.pushEditOperations(
        [],
        [{ range: targetModel.getFullModelRange(), text: content }],
        () => null,
      );
    }

    // Initialize saved version ID if not set
    const uriStr = targetModel.uri.toString();
    if (!savedVersionIds.has(uriStr)) {
      savedVersionIds.set(uriStr, targetModel.getAlternativeVersionId());
    }

    // ── Restore view state for incoming model ──────────────────────────────
    const savedViewState = viewStateMap.get(filePath);
    if (savedViewState) {
      editor.restoreViewState(savedViewState);
    }

    // ── Register in editor registry ────────────────────────────────────────
    registerMonacoEditor(filePath, editor);

    // ── Re-register content change listener for new model ──────────────────
    contentChangeDisposableRef.current = targetModel.onDidChangeContent(() => {
      const savedVer = savedVersionIds.get(uriStr);
      const nowDirty = savedVer !== undefined
        ? targetModel.getAlternativeVersionId() !== savedVer
        : false;

      if (nowDirty !== isDirtyRef.current) {
        isDirtyRef.current = nowDirty;
        onDirtyChangeRef.current?.(nowDirty);
      }

      onContentChangeRef.current?.(targetModel.getValue());
    });

    // ── Reset dirty state for the new file ─────────────────────────────────
    const savedVer = savedVersionIds.get(uriStr);
    const nowDirty = savedVer !== undefined
      ? targetModel.getAlternativeVersionId() !== savedVer
      : false;
    isDirtyRef.current = nowDirty;
    onDirtyChangeRef.current?.(nowDirty);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  // ── Update content when it changes externally (e.g., file reload) ────────
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    // Only update if the content actually differs from the current model
    if (model.getValue() !== content) {
      model.pushEditOperations(
        [],
        [{ range: model.getFullModelRange(), text: content }],
        () => null,
      );
      // Update saved version (content came from disk — it's the new baseline)
      savedVersionIds.set(
        model.uri.toString(),
        model.getAlternativeVersionId(),
      );
      isDirtyRef.current = false;
      onDirtyChangeRef.current?.(false);
    }
  }, [content]);

  // ── Update readOnly when it changes ──────────────────────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    if (editor) {
      editor.updateOptions({
        readOnly,
        quickSuggestions: readOnly ? false : true,
        suggestOnTriggerCharacters: !readOnly,
        contextmenu: !readOnly,
      });
    }
  }, [readOnly]);

  // ── Update wordWrap when toolbar toggle changes ──────────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && wordWrapProp !== undefined) {
      editor.updateOptions({ wordWrap: wordWrapProp ? 'on' : 'off' });
    }
  }, [wordWrapProp]);

  // ── Update minimap when toolbar toggle changes ───────────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && showMinimapProp !== undefined) {
      editor.updateOptions({ minimap: { enabled: showMinimapProp } });
    }
  }, [showMinimapProp]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    diffDecorationIdsRef.current = editor.deltaDecorations(
      diffDecorationIdsRef.current,
      buildDiffDecorations(diffLines),
    );
  }, [diffLines, filePath]);

  // ── Keybinding mode (vim / emacs / default) ─────────────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Clean up previous keybinding mode
    if (vimDisposeRef.current) {
      vimDisposeRef.current();
      vimDisposeRef.current = null;
    }

    if (keybindingMode === 'vim' && vimStatusRef.current) {
      const statusEl = vimStatusRef.current;
      enableVimMode(editor, statusEl).then((dispose) => {
        if (dispose) {
          vimDisposeRef.current = dispose;
        }
      });
    } else if (keybindingMode === 'emacs') {
      enableEmacsMode(editor).then((dispose) => {
        if (dispose) {
          vimDisposeRef.current = dispose;
        }
      });
    }

    return () => {
      if (vimDisposeRef.current) {
        vimDisposeRef.current();
        vimDisposeRef.current = null;
      }
    };
  }, [keybindingMode]);

  // ── Focus editor imperatively ────────────────────────────────────────────
  const handleContainerClick = useCallback(() => {
    editorRef.current?.focus();
  }, []);

  const handleEditorMouseEnter = useCallback(() => setIsEditorHovered(true), []);
  const handleEditorMouseLeave = useCallback(() => setIsEditorHovered(false), []);

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
        onMouseEnter={handleEditorMouseEnter}
        onMouseLeave={handleEditorMouseLeave}
      >
        <div
          ref={containerRef}
          onClick={handleContainerClick}
          style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
          }}
        />
        <ScrollIndicator
          scrollTop={scrollMetrics.scrollTop}
          scrollHeight={scrollMetrics.scrollHeight}
          clientHeight={scrollMetrics.clientHeight}
          isHovered={isEditorHovered}
          isScrolling={isScrolling}
        />
      </div>
      {/* Vim mode status bar — rendered below the editor */}
      {keybindingMode === 'vim' && (
        <div
          ref={vimStatusRef}
          style={{
            height: '22px',
            lineHeight: '22px',
            padding: '0 8px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            borderTop: '1px solid var(--border)',
            flexShrink: 0,
          }}
        />
      )}
    </div>
  );
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find the file path for a given model by reverse-looking up its URI.
 * The URI scheme is `file:///path/to/file`.
 */
function findFilePathForModel(model: monaco.editor.ITextModel): string | null {
  const uri = model.uri.toString();
  // The URI format is file:///path/to/file — extract the path
  const match = uri.match(/^file:\/\/\/(.+)$/);
  if (match) {
    return match[1];
  }
  return null;
}

// ── Public utilities ─────────────────────────────────────────────────────────

/**
 * Dispose the Monaco text model associated with a file path.
 * Call this when a file tab is closed to free memory.
 * Also cleans up the associated view state and saved version ID.
 */
export function disposeMonacoModel(filePath: string): void {
  const uri = filePathToUri(filePath);
  const model = monaco.editor.getModel(uri);
  if (model) {
    model.dispose();
  }
  viewStateMap.delete(filePath);
  savedVersionIds.delete(uri.toString());
}

/**
 * Get the in-memory view state for a file path (for cross-session persistence).
 */
export function getViewState(
  filePath: string,
): monaco.editor.ICodeEditorViewState | undefined {
  return viewStateMap.get(filePath);
}

/**
 * Set view state for a file path (e.g., restored from localStorage on app start).
 */
export function setViewState(
  filePath: string,
  state: monaco.editor.ICodeEditorViewState,
): void {
  viewStateMap.set(filePath, state);
}

function buildDiffDecorations(diffLines: DiffLineInfo[]): monaco.editor.IModelDeltaDecoration[] {
  const seen = new Set<string>();

  return diffLines.flatMap((diffLine) => {
    const lineNumber = Math.max(1, diffLine.line);
    const key = `${lineNumber}:${diffLine.kind}`;
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);

    return [{
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
    }];
  });
}

function getOverviewRulerColor(kind: DiffLineInfo['kind']): string {
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
