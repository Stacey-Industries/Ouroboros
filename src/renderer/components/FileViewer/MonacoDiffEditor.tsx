/**
 * MonacoDiffEditor - standalone Monaco Diff Editor React wrapper.
 */
import * as monaco from 'monaco-editor';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

import { detectLanguage, initMonaco } from './monacoSetup';
import { useMonacoTheme } from './monacoThemeBridge';

export interface MonacoDiffEditorProps {
  originalContent: string;
  modifiedContent: string;
  language: string;
  filePath?: string;
  readOnly?: boolean;
  onAcceptHunk?: (hunkIndex: number) => void;
  onRejectHunk?: (hunkIndex: number) => void;
  className?: string;
}

initMonaco();

const frameStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' };
const toolbarStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderBottom: '1px solid var(--border-semantic)', background: 'var(--surface-panel)', fontSize: 12, flexShrink: 0 };
const buttonStyle: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border-semantic)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 };
const dangerButtonStyle: React.CSSProperties = { ...buttonStyle, border: '1px solid var(--status-error)' };
const successButtonStyle: React.CSSProperties = { ...buttonStyle, border: '1px solid var(--status-success)' };
const editorShellStyle: React.CSSProperties = { flex: 1, overflow: 'hidden' };

function createDiffOptions(readOnly: boolean, sideBySide: boolean): monaco.editor.IStandaloneDiffEditorConstructionOptions {
  return {
    theme: 'ouroboros',
    automaticLayout: true,
    readOnly,
    originalEditable: false,
    renderSideBySide: sideBySide,
    useInlineViewWhenSpaceIsLimited: true,
    ignoreTrimWhitespace: true,
    renderIndicators: true,
    enableSplitViewResizing: true,
    minimap: { enabled: false },
    lineNumbers: 'on',
    folding: true,
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    lineHeight: 20,
    padding: { top: 8, bottom: 8 },
  };
}

function getTargetChange(
  changes: monaco.editor.ILineChange[],
  currentLine: number,
  direction: 'next' | 'prev',
): monaco.editor.ILineChange | undefined {
  if (direction === 'next') return changes.find((change) => change.modifiedStartLineNumber > currentLine) ?? changes[0];
  for (let i = changes.length - 1; i >= 0; i -= 1) if (changes[i].modifiedStartLineNumber < currentLine) return changes[i];
  return changes[changes.length - 1];
}

interface DiffLifecycleDeps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  editorRef: React.RefObject<monaco.editor.IStandaloneDiffEditor | null>;
  originalModelRef: React.RefObject<monaco.editor.ITextModel | null>;
  modifiedModelRef: React.RefObject<monaco.editor.ITextModel | null>;
  originalContent: string;
  modifiedContent: string;
  language: string;
  readOnly: boolean;
  sideBySide: boolean;
}

function useDiffLifecycle({
  containerRef,
  editorRef,
  originalModelRef,
  modifiedModelRef,
  originalContent,
  modifiedContent,
  language,
  readOnly,
  sideBySide,
}: DiffLifecycleDeps): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const originalModel = monaco.editor.createModel(originalContent, language);
    const modifiedModel = monaco.editor.createModel(modifiedContent, language);
    originalModelRef.current = originalModel;
    modifiedModelRef.current = modifiedModel;

    const diffEditor = monaco.editor.createDiffEditor(container, createDiffOptions(readOnly, sideBySide));
    diffEditor.setModel({ original: originalModel, modified: modifiedModel });
    editorRef.current = diffEditor;

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
}

function useDiffContentSync(
  originalContent: string,
  modifiedContent: string,
  originalModelRef: React.RefObject<monaco.editor.ITextModel | null>,
  modifiedModelRef: React.RefObject<monaco.editor.ITextModel | null>,
): void {
  useEffect(() => {
    const originalModel = originalModelRef.current;
    const modifiedModel = modifiedModelRef.current;
    if (originalModel && originalModel.getValue() !== originalContent) originalModel.setValue(originalContent);
    if (modifiedModel && modifiedModel.getValue() !== modifiedContent) modifiedModel.setValue(modifiedContent);
  }, [originalContent, modifiedContent, modifiedModelRef, originalModelRef]);
}

function useDiffSideBySideSync(
  editorRef: React.RefObject<monaco.editor.IStandaloneDiffEditor | null>,
  sideBySide: boolean,
): void {
  useEffect(() => {
    editorRef.current?.updateOptions({ renderSideBySide: sideBySide });
  }, [editorRef, sideBySide]);
}

function useChangeNavigation(editorRef: React.RefObject<monaco.editor.IStandaloneDiffEditor | null>) {
  return useCallback((direction: 'next' | 'prev') => {
    const editor = editorRef.current;
    if (!editor) return;
    const changes = editor.getLineChanges();
    if (!changes?.length) return;

    const modifiedEditor = editor.getModifiedEditor();
    const currentLine = modifiedEditor.getPosition()?.lineNumber ?? 1;
    const targetChange = getTargetChange(changes, currentLine, direction);
    if (!targetChange) return;

    modifiedEditor.revealLineInCenter(targetChange.modifiedStartLineNumber);
    modifiedEditor.setPosition({ lineNumber: targetChange.modifiedStartLineNumber, column: 1 });
    modifiedEditor.focus();
  }, [editorRef]);
}

function useChangeCount(
  editorRef: React.RefObject<monaco.editor.IStandaloneDiffEditor | null>,
  originalContent: string,
  modifiedContent: string,
): number {
  const [changeCount, setChangeCount] = useState(0);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const timer = setTimeout(() => setChangeCount(editor.getLineChanges()?.length ?? 0), 100);
    return () => clearTimeout(timer);
  }, [editorRef, originalContent, modifiedContent]);
  return changeCount;
}

interface DiffToolbarProps {
  sideBySide: boolean;
  setSideBySide: React.Dispatch<React.SetStateAction<boolean>>;
  onPrev: () => void;
  onNext: () => void;
  changeCount: number;
  onAcceptHunk?: (hunkIndex: number) => void;
  onRejectHunk?: (hunkIndex: number) => void;
}

function renderToolbar({
  sideBySide,
  setSideBySide,
  onPrev,
  onNext,
  changeCount,
  onAcceptHunk,
  onRejectHunk,
}: DiffToolbarProps): React.ReactElement {
  return (
    <div style={toolbarStyle} className="text-text-semantic-muted">
      <button
        onClick={() => setSideBySide((value) => !value)}
        title={sideBySide ? 'Switch to inline diff' : 'Switch to side-by-side diff'}
        className="text-text-semantic-primary"
        style={buttonStyle}
      >
        {sideBySide ? 'Inline' : 'Side-by-Side'}
      </button>
      <span style={{ color: 'var(--border-semantic)' }}>|</span>
      <button onClick={onPrev} title="Previous change" className="text-text-semantic-primary" style={buttonStyle}>&uarr; Prev</button>
      <button onClick={onNext} title="Next change" className="text-text-semantic-primary" style={buttonStyle}>&darr; Next</button>
      <span>{changeCount} change{changeCount !== 1 ? 's' : ''}</span>
      <span style={{ flex: 1 }} />
      {(onAcceptHunk || onRejectHunk) && <>
        {onAcceptHunk && <button onClick={() => onAcceptHunk(0)} title="Accept all changes" className="text-status-success" style={successButtonStyle}>Accept All</button>}
        {onRejectHunk && <button onClick={() => onRejectHunk(0)} title="Reject all changes" className="text-status-error" style={dangerButtonStyle}>Reject All</button>}
      </>}
    </div>
  );
}

export const MonacoDiffEditor = memo(function MonacoDiffEditor(props: MonacoDiffEditorProps): React.ReactElement {
  const { originalContent, modifiedContent, language: languageProp, filePath, readOnly = true, onAcceptHunk, onRejectHunk, className } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const originalModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const modifiedModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const [sideBySide, setSideBySide] = useState(true);

  useMonacoTheme();
  const language = languageProp || (filePath ? detectLanguage(filePath) : 'plaintext');
  useDiffLifecycle({ containerRef, editorRef, originalModelRef, modifiedModelRef, originalContent, modifiedContent, language, readOnly, sideBySide });
  useDiffContentSync(originalContent, modifiedContent, originalModelRef, modifiedModelRef);
  useDiffSideBySideSync(editorRef, sideBySide);

  const navigateChange = useChangeNavigation(editorRef);
  const changeCount = useChangeCount(editorRef, originalContent, modifiedContent);
  const handleAcceptHunk = useCallback((hunkIndex: number) => onAcceptHunk?.(hunkIndex), [onAcceptHunk]);
  const handleRejectHunk = useCallback((hunkIndex: number) => onRejectHunk?.(hunkIndex), [onRejectHunk]);

  return (
    <div className={className} style={frameStyle}>
      {renderToolbar({ sideBySide, setSideBySide, onPrev: () => navigateChange('prev'), onNext: () => navigateChange('next'), changeCount, onAcceptHunk: handleAcceptHunk, onRejectHunk: handleRejectHunk })}
      <div ref={containerRef} style={editorShellStyle} />
    </div>
  );
});
