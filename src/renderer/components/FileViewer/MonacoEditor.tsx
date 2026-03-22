/**
 * MonacoEditor — standalone Monaco Editor React wrapper.
 *
 * This component creates a Monaco editor instance in a container div, handles
 * lifecycle (mount/update/dispose), tracks dirty state, and registers a save
 * keybinding. It is designed to work alongside the existing Shiki/CodeMirror
 * viewers without replacing them.
 */
import React, { useRef, useEffect, useCallback, useState, memo } from 'react';
import * as monaco from 'monaco-editor';
import { initMonaco, detectLanguage } from './monacoSetup';
import { useMonacoTheme } from './monacoThemeBridge';
import {
  enableVimMode,
  disableVimMode,
  enableEmacsMode,
  type KeybindingMode,
} from './monacoVimMode';
import { saveEditorState, loadEditorState } from './editorStateStore';
import { ScrollIndicator } from './ScrollIndicator';

export interface MonacoEditorProps {
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
}

// Ensure Monaco is initialized before any editor is created
initMonaco();

/**
 * Convert a file path to a Monaco URI.
 * Using file:// scheme so Monaco can scope models per-file.
 */
function filePathToUri(filePath: string): monaco.Uri {
  // Normalize backslashes to forward slashes for URI
  const normalized = filePath.replace(/\\/g, '/');
  return monaco.Uri.parse(`file:///${normalized.replace(/^\/+/, '')}`);
}

/**
 * Get or create a Monaco text model for the given file path and content.
 * Reuses existing models to enable multi-tab scenarios.
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

export const MonacoEditor = memo(function MonacoEditor(
  props: MonacoEditorProps,
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
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const vimStatusRef = useRef<HTMLDivElement>(null);
  const vimDisposeRef = useRef<(() => void) | null>(null);
  const savedContentRef = useRef<string>(content);
  const isDirtyRef = useRef(false);

  // ── Scroll indicator state ───────────────────────────────────────────────
  const [scrollMetrics, setScrollMetrics] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 });
  const [isEditorHovered, setIsEditorHovered] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the theme in sync with CSS vars
  useMonacoTheme();

  const language = languageOverride ?? detectLanguage(filePath);

  // ── Create editor on mount ──────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const model = getOrCreateModel(filePath, content, language);

    // If the model already has content that differs from what we got,
    // update it (e.g., file reloaded from disk)
    if (model.getValue() !== content) {
      model.setValue(content);
    }
    savedContentRef.current = content;

    const editor = monaco.editor.create(container, {
      model,
      readOnly,
      theme: 'ouroboros',
      automaticLayout: true, // auto-resize on container resize

      // Core features
      minimap: { enabled: showMinimapProp ?? true },
      stickyScroll: { enabled: true, maxLineCount: 5 },
      lineNumbers: 'on',
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

      // Disable context menu in read-only to avoid confusing users
      contextmenu: !readOnly,
    });

    editorRef.current = editor;

    // ── Restore saved editor state (scroll + cursor) ────────────────────
    const savedState = loadEditorState(filePath);
    if (savedState) {
      // Restore after Monaco has finished layout (next frame)
      requestAnimationFrame(() => {
        editor.setScrollTop(savedState.scrollTop);
        editor.setScrollLeft(savedState.scrollLeft);
        editor.setPosition({
          lineNumber: savedState.cursorLine,
          column: savedState.cursorColumn,
        });
      });
    }

    // ── Save keybinding (Ctrl+S / Cmd+S) ────────────────────────────────
    if (!readOnly) {
      const doSave = (): void => {
        const currentContent = editor.getValue();
        savedContentRef.current = currentContent;
        // Reset dirty state
        if (isDirtyRef.current) {
          isDirtyRef.current = false;
          onDirtyChange?.(false);
        }
        onSave?.(currentContent);
      };

      editor.addAction({
        id: 'ouroboros-save',
        label: 'Save File',
        keybindings: [
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        ],
        run: () => {
          if (formatOnSave) {
            const formatAction = editor.getAction('editor.action.formatDocument');
            if (formatAction) {
              formatAction.run().then(doSave).catch(doSave);
              return;
            }
          }
          doSave();
        },
      });
    }

    // ── Track dirty state and content changes ────────────────────────────
    const disposable = model.onDidChangeContent(() => {
      const currentContent = model.getValue();
      const nowDirty = currentContent !== savedContentRef.current;

      if (nowDirty !== isDirtyRef.current) {
        isDirtyRef.current = nowDirty;
        onDirtyChange?.(nowDirty);
      }

      onContentChange?.(currentContent);
    });

    // ── Listen for goto-line events from Outline panel ──────────────────
    const handleGotoLine = (e: Event): void => {
      const detail = (e as CustomEvent<{ line: number; filePath?: string }>).detail;
      if (!detail) return;
      // Only respond if this editor is showing the target file (or no file specified)
      if (detail.filePath && detail.filePath !== filePath) return;
      editor.revealLineInCenter(detail.line);
      editor.setPosition({ lineNumber: detail.line, column: 1 });
      editor.focus();
    };
    window.addEventListener('agent-ide:goto-line', handleGotoLine);

    // ── Track scroll metrics for ScrollIndicator ────────────────────────
    const updateScrollMetrics = (): void => {
      const scrollTop = editor.getScrollTop();
      const scrollHeight = editor.getScrollHeight();
      const layoutInfo = editor.getLayoutInfo();
      setScrollMetrics({ scrollTop, scrollHeight, clientHeight: layoutInfo.height });
    };
    // Initial measurement after layout settles
    requestAnimationFrame(updateScrollMetrics);
    const scrollDisposable = editor.onDidScrollChange(() => {
      updateScrollMetrics();
      setIsScrolling(true);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => setIsScrolling(false), 800);
    });
    const layoutDisposable = editor.onDidLayoutChange(updateScrollMetrics);

    // ── Cleanup ──────────────────────────────────────────────────────────
    return () => {
      // Save editor state before disposing
      try {
        const position = editor.getPosition();
        saveEditorState(filePath, {
          scrollTop: editor.getScrollTop(),
          scrollLeft: editor.getScrollLeft(),
          cursorLine: position?.lineNumber ?? 1,
          cursorColumn: position?.column ?? 1,
        });
      } catch {
        // Ignore errors during state save
      }

      // Remove goto-line listener
      window.removeEventListener('agent-ide:goto-line', handleGotoLine);

      // Dispose vim/emacs mode before editor
      if (vimDisposeRef.current) {
        vimDisposeRef.current();
        vimDisposeRef.current = null;
      }
      scrollDisposable.dispose();
      layoutDisposable.dispose();
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      disposable.dispose();
      editor.dispose();
      editorRef.current = null;
      // Note: we do NOT dispose the model here — it may be shared across
      // tabs. Models are disposed explicitly when a tab/file is closed.
    };
    // We intentionally use filePath as the key dependency. When the file
    // changes, the entire editor is recreated (the parent should use
    // key={filePath} to force remount for different files).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  // ── Update readOnly when it changes ────────────────────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    if (editor) {
      editor.updateOptions({ readOnly });
    }
  }, [readOnly]);

  // ── Update wordWrap when toolbar toggle changes ──────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && wordWrapProp !== undefined) {
      editor.updateOptions({ wordWrap: wordWrapProp ? 'on' : 'off' });
    }
  }, [wordWrapProp]);

  // ── Update minimap when toolbar toggle changes ───────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && showMinimapProp !== undefined) {
      editor.updateOptions({ minimap: { enabled: showMinimapProp } });
    }
  }, [showMinimapProp]);

  // ── Keybinding mode (vim / emacs / default) ───────────────────────────
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

  // ── Update content when it changes externally (e.g., file reload) ──────
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    // Only update if the content actually differs from the current model
    // (avoids resetting cursor position on re-renders)
    if (model.getValue() !== content) {
      // Push as an edit operation to preserve undo stack
      model.pushEditOperations(
        [],
        [
          {
            range: model.getFullModelRange(),
            text: content,
          },
        ],
        () => null,
      );
      savedContentRef.current = content;
      isDirtyRef.current = false;
      onDirtyChange?.(false);
    }
  }, [content, onDirtyChange]);

  // ── Find / Replace via menu events ────────────────────────────────────
  useEffect(() => {
    function onFind(): void {
      editorRef.current?.focus();
      editorRef.current?.getAction('actions.find')?.run();
    }
    function onReplace(): void {
      editorRef.current?.focus();
      editorRef.current?.getAction('editor.action.startFindReplaceAction')?.run();
    }
    function onGoToLine(): void {
      editorRef.current?.focus();
      editorRef.current?.getAction('editor.action.gotoLine')?.run();
    }
    window.addEventListener('agent-ide:find', onFind);
    window.addEventListener('agent-ide:replace', onReplace);
    window.addEventListener('agent-ide:go-to-line', onGoToLine);
    return () => {
      window.removeEventListener('agent-ide:find', onFind);
      window.removeEventListener('agent-ide:replace', onReplace);
      window.removeEventListener('agent-ide:go-to-line', onGoToLine);
    };
  }, []);

  // ── Focus editor imperatively ──────────────────────────────────────────
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
          className="text-text-semantic-muted"
          style={{
            height: '22px',
            lineHeight: '22px',
            padding: '0 8px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            background: 'var(--surface-panel)',
            borderTop: '1px solid var(--border-semantic)',
            flexShrink: 0,
          }}
        />
      )}
    </div>
  );
});

// ────────────────────────────────────────────────────────────────────────────
// Utility: dispose a model for a given file path
// ────────────────────────────────────────────────────────────────────────────

/**
 * Dispose the Monaco text model associated with a file path.
 * Call this when a file tab is closed to free memory.
 */
export function disposeMonacoModel(filePath: string): void {
  const uri = filePathToUri(filePath);
  const model = monaco.editor.getModel(uri);
  if (model) {
    model.dispose();
  }
}
