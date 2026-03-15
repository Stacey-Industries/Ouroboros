/**
 * MonacoDiffEditor — standalone Monaco Diff Editor React wrapper.
 *
 * Renders a side-by-side (or inline) diff view of original vs modified content.
 * Supports navigation between changes, view mode toggle, and per-hunk
 * accept/reject callbacks for agent-driven code review flows.
 */
import React, { useRef, useEffect, useCallback, useState, memo } from 'react';
import * as monaco from 'monaco-editor';
import { initMonaco, detectLanguage } from './monacoSetup';
import { useMonacoTheme } from './monacoThemeBridge';

export interface MonacoDiffEditorProps {
  /** Original (left-side) file content */
  originalContent: string;
  /** Modified (right-side) file content */
  modifiedContent: string;
  /** Monaco language ID (auto-detected from filePath if omitted) */
  language: string;
  /** File path — used for language detection fallback and display */
  filePath?: string;
  /** Whether both sides are read-only */
  readOnly?: boolean;
  /** Called when the user accepts a hunk (by index) */
  onAcceptHunk?: (hunkIndex: number) => void;
  /** Called when the user rejects a hunk (by index) */
  onRejectHunk?: (hunkIndex: number) => void;
  /** Additional CSS class for the outer container */
  className?: string;
}

// Ensure Monaco is initialized before any editor is created
initMonaco();

export const MonacoDiffEditor = memo(function MonacoDiffEditor(
  props: MonacoDiffEditorProps,
): React.ReactElement {
  const {
    originalContent,
    modifiedContent,
    language: languageProp,
    filePath,
    readOnly = true,
    onAcceptHunk,
    onRejectHunk,
    className,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const originalModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const modifiedModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const [sideBySide, setSideBySide] = useState(true);

  // Keep the theme in sync with CSS vars
  useMonacoTheme();

  const language = languageProp || (filePath ? detectLanguage(filePath) : 'plaintext');

  // ── Create diff editor on mount ─────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const originalModel = monaco.editor.createModel(originalContent, language);
    const modifiedModel = monaco.editor.createModel(modifiedContent, language);
    originalModelRef.current = originalModel;
    modifiedModelRef.current = modifiedModel;

    const diffEditor = monaco.editor.createDiffEditor(container, {
      theme: 'ouroboros',
      automaticLayout: true,
      readOnly,
      originalEditable: false,

      // Diff-specific options
      renderSideBySide: sideBySide,
      useInlineViewWhenSpaceIsLimited: true,
      ignoreTrimWhitespace: true,
      renderIndicators: true,
      enableSplitViewResizing: true,

      // Core features (match MonacoEditor settings)
      minimap: { enabled: false }, // minimap less useful in diff view
      lineNumbers: 'on',
      folding: true,
      scrollBeyondLastLine: false,
      smoothScrolling: true,

      // Font — inherit from CSS vars
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      lineHeight: 20,

      // Padding
      padding: { top: 8, bottom: 8 },
    });

    diffEditor.setModel({
      original: originalModel,
      modified: modifiedModel,
    });

    editorRef.current = diffEditor;

    // ── Cleanup ─────────────────────────────────────────────────────────
    return () => {
      diffEditor.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
      editorRef.current = null;
      originalModelRef.current = null;
      modifiedModelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly]);

  // ── Update content when props change ──────────────────────────────────
  useEffect(() => {
    const origModel = originalModelRef.current;
    const modModel = modifiedModelRef.current;
    if (origModel && origModel.getValue() !== originalContent) {
      origModel.setValue(originalContent);
    }
    if (modModel && modModel.getValue() !== modifiedContent) {
      modModel.setValue(modifiedContent);
    }
  }, [originalContent, modifiedContent]);

  // ── Side-by-side toggle ───────────────────────────────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    if (editor) {
      editor.updateOptions({ renderSideBySide: sideBySide });
    }
  }, [sideBySide]);

  const toggleViewMode = useCallback(() => {
    setSideBySide((prev) => !prev);
  }, []);

  // ── Change navigation ────────────────────────────────────────────────
  const navigateChange = useCallback((direction: 'next' | 'prev') => {
    const editor = editorRef.current;
    if (!editor) return;

    const changes = editor.getLineChanges();
    if (!changes || changes.length === 0) return;

    const modifiedEditor = editor.getModifiedEditor();
    const currentLine = modifiedEditor.getPosition()?.lineNumber ?? 1;

    let targetChange: monaco.editor.ILineChange | undefined;

    if (direction === 'next') {
      targetChange = changes.find(
        (c) => (c.modifiedStartLineNumber) > currentLine,
      );
      // Wrap around to the first change
      if (!targetChange) targetChange = changes[0];
    } else {
      // Find the last change before the current line
      for (let i = changes.length - 1; i >= 0; i--) {
        if (changes[i].modifiedStartLineNumber < currentLine) {
          targetChange = changes[i];
          break;
        }
      }
      // Wrap around to the last change
      if (!targetChange) targetChange = changes[changes.length - 1];
    }

    if (targetChange) {
      modifiedEditor.revealLineInCenter(targetChange.modifiedStartLineNumber);
      modifiedEditor.setPosition({
        lineNumber: targetChange.modifiedStartLineNumber,
        column: 1,
      });
      modifiedEditor.focus();
    }
  }, []);

  const goToNextChange = useCallback(() => navigateChange('next'), [navigateChange]);
  const goToPrevChange = useCallback(() => navigateChange('prev'), [navigateChange]);

  // ── Hunk accept/reject ────────────────────────────────────────────────
  const handleAcceptHunk = useCallback(
    (hunkIndex: number) => {
      onAcceptHunk?.(hunkIndex);
    },
    [onAcceptHunk],
  );

  const handleRejectHunk = useCallback(
    (hunkIndex: number) => {
      onRejectHunk?.(hunkIndex);
    },
    [onRejectHunk],
  );

  // ── Get change count for display ──────────────────────────────────────
  const [changeCount, setChangeCount] = useState(0);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Update change count after content loads and diff is computed
    const timer = setTimeout(() => {
      const changes = editor.getLineChanges();
      setChangeCount(changes?.length ?? 0);
    }, 100);

    return () => clearTimeout(timer);
  }, [originalContent, modifiedContent]);

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 8px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          flexShrink: 0,
        }}
      >
        {/* View mode toggle */}
        <button
          onClick={toggleViewMode}
          title={sideBySide ? 'Switch to inline diff' : 'Switch to side-by-side diff'}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: 'var(--text)',
            padding: '2px 8px',
            cursor: 'pointer',
            fontSize: '11px',
          }}
        >
          {sideBySide ? 'Inline' : 'Side-by-Side'}
        </button>

        {/* Separator */}
        <span style={{ color: 'var(--border)' }}>|</span>

        {/* Navigation */}
        <button
          onClick={goToPrevChange}
          title="Previous change"
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: 'var(--text)',
            padding: '2px 8px',
            cursor: 'pointer',
            fontSize: '11px',
          }}
        >
          &uarr; Prev
        </button>
        <button
          onClick={goToNextChange}
          title="Next change"
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: 'var(--text)',
            padding: '2px 8px',
            cursor: 'pointer',
            fontSize: '11px',
          }}
        >
          &darr; Next
        </button>

        {/* Change count */}
        <span>{changeCount} change{changeCount !== 1 ? 's' : ''}</span>

        {/* Spacer */}
        <span style={{ flex: 1 }} />

        {/* Accept/Reject buttons (only shown if callbacks provided) */}
        {(onAcceptHunk || onRejectHunk) && (
          <>
            {onAcceptHunk && (
              <button
                onClick={() => handleAcceptHunk(0)}
                title="Accept all changes"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--success)',
                  borderRadius: '4px',
                  color: 'var(--success)',
                  padding: '2px 8px',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                Accept All
              </button>
            )}
            {onRejectHunk && (
              <button
                onClick={() => handleRejectHunk(0)}
                title="Reject all changes"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--error)',
                  borderRadius: '4px',
                  color: 'var(--error)',
                  padding: '2px 8px',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                Reject All
              </button>
            )}
          </>
        )}
      </div>

      {/* Diff editor container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'hidden',
        }}
      />
    </div>
  );
});
