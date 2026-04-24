import * as monaco from 'monaco-editor';
import React, { memo, type MutableRefObject, useRef } from 'react';

import type { DiffLineInfo } from '../../types/electron';
import { EditorHunkGutterActions } from './EditorHunkGutterActions';
import { InlineEditWidget } from './InlineEditWidget';
import { useMonacoEditorRuntime } from './MonacoEditor.hooks';
import { type RuntimeInput } from './MonacoEditor.mount';
import { useEditorRefs } from './monacoEditorRefs';
import { detectLanguage, initMonaco } from './monacoSetup';
import { useMonacoTheme } from './monacoThemeBridge';
import {
  filePathToUri,
  type KeybindingMode,
  useStableCallbackRefs,
} from './monacoVimMode';
import { ScrollIndicator } from './ScrollIndicator';
import { useEditorHunkDecorations } from './useEditorHunkDecorations';
import { useInlineEdit } from './useInlineEdit';

initMonaco();

const frameStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};
const shellStyle: React.CSSProperties = { flex: 1, overflow: 'hidden', position: 'relative' };
const canvasStyle: React.CSSProperties = { width: '100%', height: '100%', overflow: 'hidden' };
const vimStatusStyle: React.CSSProperties = {
  height: '22px',
  lineHeight: '22px',
  padding: '0 8px',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  background: 'var(--surface-panel)',
  borderTop: '1px solid var(--border-semantic)',
  flexShrink: 0,
};

export interface MonacoEditorProps {
  filePath: string;
  content: string;
  language?: string;
  readOnly?: boolean;
  projectRoot?: string | null;
  onSave?: (content: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onContentChange?: (content: string) => void;
  keybindingMode?: KeybindingMode;
  className?: string;
  wordWrap?: boolean;
  showMinimap?: boolean;
  showBlame?: boolean;
  formatOnSave?: boolean;
  diffLines?: DiffLineInfo[];
}

interface MonacoInlineEditLayerProps {
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  filePath: string;
  language: string;
  activateInlineEditRef: MutableRefObject<() => void>;
}

function MonacoInlineEditLayer({ editorRef, filePath, language, activateInlineEditRef }: MonacoInlineEditLayerProps): React.ReactElement {
  'use no memo';
  const { state, activate, submit, accept, reject, cancel, streaming } = useInlineEdit(editorRef, filePath, language);
  activateInlineEditRef.current = activate;
  return <InlineEditWidget editor={editorRef.current} state={state} actions={{ submit, accept, reject, cancel, streaming }} />;
}

interface MonacoHunkGutterLayerProps {
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  filePath: string;
}

function MonacoHunkGutterLayer({ editorRef, filePath }: MonacoHunkGutterLayerProps): React.ReactElement | null {
  'use no memo';
  const { decorations, diffReview } = useEditorHunkDecorations(editorRef, filePath);
  return <EditorHunkGutterActions editor={editorRef.current} decorations={decorations} diffReview={diffReview} />;
}

interface EditorSetupResult {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  vimStatusRef: MutableRefObject<HTMLDivElement | null>;
  activateInlineEditRef: MutableRefObject<() => void>;
  language: string;
  scrollMetrics: { scrollTop: number; scrollHeight: number; clientHeight: number };
  isEditorHovered: boolean;
  setIsEditorHovered: React.Dispatch<React.SetStateAction<boolean>>;
  isScrolling: boolean;
}

function useMonacoEditorSetup(props: MonacoEditorProps): EditorSetupResult {
  'use no memo';
  const {
    filePath, content, language: languageOverride, readOnly = false, projectRoot,
    onSave, onDirtyChange, onContentChange, keybindingMode = 'default',
    wordWrap, showMinimap, showBlame, formatOnSave = false, diffLines = [],
  } = props;
  const { containerRef, editorRef, vimStatusRef, vimDisposeRef, isDirtyRef, contentChangeDisposableRef, saveActionDisposableRef, inlineEditDisposableRef, diffDecorationIdsRef } = useEditorRefs();
  const callbackRefs = useStableCallbackRefs({ onSave, onDirtyChange, onContentChange, readOnly, formatOnSave, filePath });
  useMonacoTheme();
  const language = languageOverride ?? detectLanguage(filePath);
  const activateInlineEditRef = useRef<() => void>(() => {});
  const runtimeInput: RuntimeInput = {
    filePath, content, language, readOnly, projectRoot, onSave, onDirtyChange, onContentChange,
    keybindingMode, wordWrap, showMinimap, showBlame, formatOnSave, diffLines,
    containerRef, editorRef, vimStatusRef, vimDisposeRef, isDirtyRef,
    contentChangeDisposableRef, saveActionDisposableRef, inlineEditDisposableRef,
    activateInlineEditRef, diffDecorationIdsRef, callbackRefs,
  };
  const { scrollMetrics, isEditorHovered, setIsEditorHovered, isScrolling } = useMonacoEditorRuntime(runtimeInput);
  return { containerRef, editorRef, vimStatusRef, activateInlineEditRef, language, scrollMetrics, isEditorHovered, setIsEditorHovered, isScrolling };
}

export type { MonacoEditorProps as MonacoEditorHostProps };

export const MonacoEditor = memo(function MonacoEditor(props: MonacoEditorProps): React.ReactElement {
  'use no memo';
  const { className, keybindingMode = 'default', filePath } = props;
  const { containerRef, editorRef, vimStatusRef, activateInlineEditRef, language, scrollMetrics, isEditorHovered, setIsEditorHovered, isScrolling } = useMonacoEditorSetup(props);
  return (
    <div className={className} style={frameStyle}>
      <div style={shellStyle} onMouseEnter={() => setIsEditorHovered(true)} onMouseLeave={() => setIsEditorHovered(false)}>
        <div ref={containerRef} style={canvasStyle} onClick={() => editorRef.current?.focus()} data-no-swipe="" />
        <ScrollIndicator {...scrollMetrics} isHovered={isEditorHovered} isScrolling={isScrolling} />
      </div>
      {keybindingMode === 'vim' && (
        <div ref={vimStatusRef} className="text-text-semantic-muted" style={vimStatusStyle} />
      )}
      <MonacoInlineEditLayer editorRef={editorRef} filePath={filePath} language={language} activateInlineEditRef={activateInlineEditRef} />
      <MonacoHunkGutterLayer editorRef={editorRef} filePath={filePath} />
    </div>
  );
});

export function disposeMonacoModel(filePath: string): void {
  monaco.editor.getModel(filePathToUri(filePath))?.dispose();
}
