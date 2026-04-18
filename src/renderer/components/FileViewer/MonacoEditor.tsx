import * as monaco from 'monaco-editor';
import React, { memo, type MutableRefObject,useEffect, useRef, useState } from 'react';

import { useConfig } from '../../hooks/useConfig';
import type { DiffLineInfo } from '../../types/electron';
import { EditorHunkGutterActions } from './EditorHunkGutterActions';
import { registerMonacoEditor, unregisterMonacoEditor } from './editorRegistry';
import { saveEditorState } from './editorStateStore';
import { InlineEditWidget } from './InlineEditWidget';
import {
  bindContentChange,
  bindGotoLineHandler,
  bindInlineEditAction,
  bindSaveAction,
  bindScrollTracking,
  bindSearchShortcuts,
  type EditorCallbackRefs,
  useEditorRefs,
} from './monacoEditorRefs';
import { useMonacoLspLifecycle } from './monacoLsp';
import { detectLanguage, initMonaco } from './monacoSetup';
import { useMonacoTheme } from './monacoThemeBridge';
import {
  buildDiffDecorations,
  createEditorOptions,
  enableEmacsMode,
  enableVimMode,
  filePathToUri,
  getHostViewState,
  getOrCreateModel,
  hasHostSavedVersion,
  type KeybindingMode,
  scheduleHostViewStateFlush,
  setHostSavedVersion,
  useStableCallbackRefs,
} from './monacoVimMode';
import { ScrollIndicator } from './ScrollIndicator';
import { useEditorHunkDecorations } from './useEditorHunkDecorations';
import { useInlineEdit } from './useInlineEdit';
import { useMonacoBlame } from './useMonacoBlame';

initMonaco();

const frameStyle: React.CSSProperties = { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const shellStyle: React.CSSProperties = { flex: 1, overflow: 'hidden', position: 'relative' };
const canvasStyle: React.CSSProperties = { width: '100%', height: '100%', overflow: 'hidden' };
const vimStatusStyle: React.CSSProperties = { height: '22px', lineHeight: '22px', padding: '0 8px', fontSize: '11px', fontFamily: 'var(--font-mono)', background: 'var(--surface-panel)', borderTop: '1px solid var(--border-semantic)', flexShrink: 0 };

export interface MonacoEditorProps {
  filePath: string; content: string; language?: string; readOnly?: boolean;
  projectRoot?: string | null;
  onSave?: (content: string) => void; onDirtyChange?: (dirty: boolean) => void; onContentChange?: (content: string) => void;
  keybindingMode?: KeybindingMode; className?: string; wordWrap?: boolean; showMinimap?: boolean; showBlame?: boolean; formatOnSave?: boolean; diffLines?: DiffLineInfo[];
}

interface RuntimeInput {
  filePath: string; content: string; language: string; readOnly: boolean;
  projectRoot?: string | null;
  onSave?: (content: string) => void; onDirtyChange?: (dirty: boolean) => void; onContentChange?: (content: string) => void;
  keybindingMode: KeybindingMode; wordWrap?: boolean; showMinimap?: boolean; showBlame?: boolean; formatOnSave: boolean; diffLines: DiffLineInfo[];
  containerRef: MutableRefObject<HTMLDivElement | null>; editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  vimStatusRef: MutableRefObject<HTMLDivElement | null>; vimDisposeRef: MutableRefObject<(() => void) | null>; isDirtyRef: MutableRefObject<boolean>;
  contentChangeDisposableRef: MutableRefObject<monaco.IDisposable | null>; saveActionDisposableRef: MutableRefObject<monaco.IDisposable | null>;
  inlineEditDisposableRef: MutableRefObject<monaco.IDisposable | null>;
  activateInlineEditRef: MutableRefObject<() => void>;
  diffDecorationIdsRef: MutableRefObject<string[]>;
  /** Stable refs that track the latest callback props across re-renders */
  callbackRefs: EditorCallbackRefs & { readOnlyRef: MutableRefObject<boolean>; formatOnSaveRef: MutableRefObject<boolean>; filePathRef: MutableRefObject<string> };
}

function mountMonacoEditor(input: RuntimeInput, setScrollMetrics: React.Dispatch<React.SetStateAction<{ scrollTop: number; scrollHeight: number; clientHeight: number }>>, setIsScrolling: React.Dispatch<React.SetStateAction<boolean>>, scrollTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>): () => void {
  const { filePath, content, language, readOnly, wordWrap, showMinimap, containerRef, editorRef, vimDisposeRef, isDirtyRef, contentChangeDisposableRef, saveActionDisposableRef, inlineEditDisposableRef } = input;
  const model = getOrCreateModel(filePath, content, language);
  if (model.getValue() !== content) model.setValue(content);
  if (!hasHostSavedVersion(model.uri.toString())) setHostSavedVersion(model.uri.toString(), model.getAlternativeVersionId());
  const editor = monaco.editor.create(containerRef.current!, { ...createEditorOptions(readOnly, wordWrap, showMinimap), model });
  editorRef.current = editor;
  registerMonacoEditor(filePath, editor);
  const savedViewState = getHostViewState(filePath);
  if (savedViewState) requestAnimationFrame(() => editor.restoreViewState(savedViewState));
  const refs = input.callbackRefs;
  bindSaveAction(editor, refs, isDirtyRef, saveActionDisposableRef);
  bindInlineEditAction(editor, input.activateInlineEditRef, inlineEditDisposableRef);
  bindContentChange(model, refs, isDirtyRef, contentChangeDisposableRef);
  const disposeGoto = bindGotoLineHandler(editor, refs.filePathRef);
  const disposeScroll = bindScrollTracking(editor, setScrollMetrics, setIsScrolling, scrollTimerRef);
  const searchCleanup = bindSearchShortcuts(editor);
  return () => {
    try {
      const position = editor.getPosition();
      saveEditorState(filePath, { scrollTop: editor.getScrollTop(), scrollLeft: editor.getScrollLeft(), cursorLine: position?.lineNumber ?? 1, cursorColumn: position?.column ?? 1 });
    } catch { return; }
    searchCleanup();
    disposeGoto();
    vimDisposeRef.current?.();
    vimDisposeRef.current = null;
    disposeScroll();
    contentChangeDisposableRef.current?.dispose();
    contentChangeDisposableRef.current = null;
    saveActionDisposableRef.current?.dispose();
    saveActionDisposableRef.current = null;
    inlineEditDisposableRef.current?.dispose();
    inlineEditDisposableRef.current = null;
    unregisterMonacoEditor(filePath);
    editor.dispose();
    editorRef.current = null;
    scheduleHostViewStateFlush();
  };
}

function useMonacoEditorMount(input: RuntimeInput, setScrollMetrics: React.Dispatch<React.SetStateAction<{ scrollTop: number; scrollHeight: number; clientHeight: number }>>, setIsScrolling: React.Dispatch<React.SetStateAction<boolean>>, scrollTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>): void {
  const inputRef = useRef(input);
  inputRef.current = input;
  useEffect(() => {
    if (!inputRef.current.containerRef.current) return;
    return mountMonacoEditor(inputRef.current, setScrollMetrics, setIsScrolling, scrollTimerRef);
  }, [input.filePath, scrollTimerRef, setIsScrolling, setScrollMetrics]);
}

function useMonacoEditorContentSync(
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>,
  content: string,
  isDirtyRef: MutableRefObject<boolean>,
  onDirtyChange?: (dirty: boolean) => void,
): void {
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model || model.getValue() === content) return;
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: content }], () => null);
    setHostSavedVersion(model.uri.toString(), model.getAlternativeVersionId());
    isDirtyRef.current = false;
    onDirtyChange?.(false);
  }, [content, editorRef, isDirtyRef, onDirtyChange]);
}

function resolveEditorFont(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--font-editor').trim();
  return v || 'var(--font-mono, monospace)';
}

function useMonacoEditorFontFamily(editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>): void {
  const { config } = useConfig();
  const editorFont = config?.theming?.fonts?.editor;
  useEffect(() => {
    const editor = editorRef.current;
    if (editor) editor.updateOptions({ fontFamily: resolveEditorFont() });
  }, [editorRef, editorFont]);
}

function useMonacoEditorOptions(input: RuntimeInput): void {
  useEffect(() => {
    const editor = input.editorRef.current;
    if (editor) editor.updateOptions({ readOnly: input.readOnly, quickSuggestions: input.readOnly ? false : true, suggestOnTriggerCharacters: !input.readOnly, contextmenu: !input.readOnly });
  }, [input.editorRef, input.readOnly]);
  useEffect(() => {
    const editor = input.editorRef.current;
    if (editor && input.wordWrap !== undefined) editor.updateOptions({ wordWrap: input.wordWrap ? 'on' : 'off' });
  }, [input.editorRef, input.wordWrap]);
  useEffect(() => {
    const editor = input.editorRef.current;
    if (editor && input.showMinimap !== undefined) editor.updateOptions({ minimap: { enabled: input.showMinimap } });
  }, [input.editorRef, input.showMinimap]);
  useMonacoEditorFontFamily(input.editorRef);
}

function useMonacoEditorModes(input: RuntimeInput): void {
  useEffect(() => {
    const editor = input.editorRef.current;
    if (!editor) return;
    if (input.vimDisposeRef.current) {
      input.vimDisposeRef.current();
      input.vimDisposeRef.current = null;
    }
    if (input.keybindingMode === 'vim' && input.vimStatusRef.current) {
      void enableVimMode(editor, input.vimStatusRef.current).then((dispose) => { if (dispose) input.vimDisposeRef.current = dispose; });
    } else if (input.keybindingMode === 'emacs') {
      void enableEmacsMode(editor).then((dispose) => { if (dispose) input.vimDisposeRef.current = dispose; });
    }
    return () => {
      input.vimDisposeRef.current?.();
      input.vimDisposeRef.current = null;
    };
  }, [input.editorRef, input.keybindingMode, input.vimDisposeRef, input.vimStatusRef]);
}

function useMonacoEditorDiffs(input: RuntimeInput): void {
  useEffect(() => {
    const editor = input.editorRef.current;
    if (!editor) return;
    input.diffDecorationIdsRef.current = editor.deltaDecorations(input.diffDecorationIdsRef.current, buildDiffDecorations(input.diffLines));
  }, [input.diffDecorationIdsRef, input.diffLines, input.editorRef]);
}

function useMonacoEditorRuntime(input: RuntimeInput): { scrollMetrics: { scrollTop: number; scrollHeight: number; clientHeight: number }; isEditorHovered: boolean; setIsEditorHovered: React.Dispatch<React.SetStateAction<boolean>>; isScrolling: boolean } {
  const [scrollMetrics, setScrollMetrics] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 });
  const [isEditorHovered, setIsEditorHovered] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useMonacoEditorMount(input, setScrollMetrics, setIsScrolling, scrollTimerRef);
  useMonacoEditorContentSync(input.editorRef, input.content, input.isDirtyRef, input.onDirtyChange);
  useMonacoEditorOptions(input);
  useMonacoEditorModes(input);
  useMonacoEditorDiffs(input);
  useMonacoLspLifecycle(input.editorRef, input.filePath, input.projectRoot, input.content);
  useMonacoBlame(input.editorRef, input.filePath, input.projectRoot, input.showBlame ?? false);
  return { scrollMetrics, isEditorHovered, setIsEditorHovered, isScrolling };
}

interface MonacoInlineEditLayerProps {
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  filePath: string;
  language: string;
  activateInlineEditRef: MutableRefObject<() => void>;
}

function MonacoInlineEditLayer({
  editorRef,
  filePath,
  language,
  activateInlineEditRef,
}: MonacoInlineEditLayerProps): React.ReactElement {
  const { state, activate, submit, accept, reject, cancel, streaming } = useInlineEdit(editorRef, filePath, language);
  activateInlineEditRef.current = activate;
  return (
    <InlineEditWidget
      editor={editorRef.current}
      state={state}
      actions={{ submit, accept, reject, cancel, streaming }}
    />
  );
}

interface MonacoHunkGutterLayerProps {
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  filePath: string;
}

function MonacoHunkGutterLayer({
  editorRef,
  filePath,
}: MonacoHunkGutterLayerProps): React.ReactElement | null {
  const { decorations, diffReview } = useEditorHunkDecorations(editorRef, filePath);
  return (
    <EditorHunkGutterActions
      editor={editorRef.current}
      decorations={decorations}
      diffReview={diffReview}
    />
  );
}

export type { MonacoEditorProps as MonacoEditorHostProps };

export const MonacoEditor = memo(function MonacoEditor(props: MonacoEditorProps): React.ReactElement {
  const { filePath, content, language: languageOverride, readOnly = false, projectRoot, onSave, onDirtyChange, onContentChange, keybindingMode = 'default', className, wordWrap, showMinimap, showBlame, formatOnSave = false, diffLines = [] } = props;
  const { containerRef, editorRef, vimStatusRef, vimDisposeRef, isDirtyRef, contentChangeDisposableRef, saveActionDisposableRef, inlineEditDisposableRef, diffDecorationIdsRef } = useEditorRefs();
  const callbackRefs = useStableCallbackRefs({ onSave, onDirtyChange, onContentChange, readOnly, formatOnSave, filePath });
  useMonacoTheme();
  const language = languageOverride ?? detectLanguage(filePath);
  const activateInlineEditRef = useRef<() => void>(() => { });
  const { scrollMetrics, isEditorHovered, setIsEditorHovered, isScrolling } = useMonacoEditorRuntime({
    filePath, content, language, readOnly, projectRoot, onSave, onDirtyChange, onContentChange, keybindingMode, wordWrap, showMinimap, showBlame, formatOnSave, diffLines, containerRef, editorRef, vimStatusRef, vimDisposeRef, isDirtyRef, contentChangeDisposableRef, saveActionDisposableRef, inlineEditDisposableRef, activateInlineEditRef, diffDecorationIdsRef, callbackRefs,
  });
  return (
    <div className={className} style={frameStyle}>
      <div style={shellStyle} onMouseEnter={() => setIsEditorHovered(true)} onMouseLeave={() => setIsEditorHovered(false)}>
        <div ref={containerRef} style={canvasStyle} onClick={() => editorRef.current?.focus()} data-no-swipe="" />
        <ScrollIndicator {...scrollMetrics} isHovered={isEditorHovered} isScrolling={isScrolling} />
      </div>
      {keybindingMode === 'vim' && <div ref={vimStatusRef} className="text-text-semantic-muted" style={vimStatusStyle} />}
      <MonacoInlineEditLayer
        editorRef={editorRef}
        filePath={filePath}
        language={language}
        activateInlineEditRef={activateInlineEditRef}
      />
      <MonacoHunkGutterLayer editorRef={editorRef} filePath={filePath} />
    </div>
  );
});

export function disposeMonacoModel(filePath: string): void {
  monaco.editor.getModel(filePathToUri(filePath))?.dispose();
}
