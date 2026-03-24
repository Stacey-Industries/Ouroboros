import * as monaco from 'monaco-editor';
import React, { memo, useEffect, useRef, useState } from 'react';

import type { DiffLineInfo } from '../../types/electron';
import { registerMonacoEditor, unregisterMonacoEditor } from './editorRegistry';
import { saveEditorState } from './editorStateStore';
import { detectLanguage, initMonaco } from './monacoSetup';
import { useMonacoTheme } from './monacoThemeBridge';
import { enableEmacsMode, enableVimMode, type KeybindingMode } from './monacoVimMode';
import {
  buildDiffDecorations,
  createEditorOptions,
  filePathToUri,
  getHostViewState,
  getOrCreateModel,
  hasHostSavedVersion,
  scheduleHostViewStateFlush,
  setHostDirtyState,
  setHostSavedVersion,
  useStableCallbackRefs,
} from './monacoVimMode';
import { ScrollIndicator } from './ScrollIndicator';

initMonaco();

const frameStyle: React.CSSProperties = { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const shellStyle: React.CSSProperties = { flex: 1, overflow: 'hidden', position: 'relative' };
const canvasStyle: React.CSSProperties = { width: '100%', height: '100%', overflow: 'hidden' };
const vimStatusStyle: React.CSSProperties = { height: '22px', lineHeight: '22px', padding: '0 8px', fontSize: '11px', fontFamily: 'var(--font-mono)', background: 'var(--surface-panel)', borderTop: '1px solid var(--border-semantic)', flexShrink: 0 };

interface MonacoEditorProps {
  filePath: string; content: string; language?: string; readOnly?: boolean;
  onSave?: (content: string) => void; onDirtyChange?: (dirty: boolean) => void; onContentChange?: (content: string) => void;
  keybindingMode?: KeybindingMode; className?: string; wordWrap?: boolean; showMinimap?: boolean; formatOnSave?: boolean; diffLines?: DiffLineInfo[];
}

interface RuntimeInput {
  filePath: string; content: string; language: string; readOnly: boolean;
  onSave?: (content: string) => void; onDirtyChange?: (dirty: boolean) => void; onContentChange?: (content: string) => void;
  keybindingMode: KeybindingMode; wordWrap?: boolean; showMinimap?: boolean; formatOnSave: boolean; diffLines: DiffLineInfo[];
  containerRef: React.RefObject<HTMLDivElement | null>; editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor | null>;
  vimStatusRef: React.RefObject<HTMLDivElement | null>; vimDisposeRef: React.RefObject<(() => void) | null>; isDirtyRef: React.RefObject<boolean>;
  contentChangeDisposableRef: React.RefObject<monaco.IDisposable | null>; saveActionDisposableRef: React.RefObject<monaco.IDisposable | null>;
  diffDecorationIdsRef: React.RefObject<string[]>;
  /** Stable refs that track the latest callback props across re-renders */
  callbackRefs: EditorCallbackRefs & { readOnlyRef: React.RefObject<boolean>; formatOnSaveRef: React.RefObject<boolean>; filePathRef: React.RefObject<string> };
}

interface EditorCallbackRefs {
  onSaveRef: React.RefObject<((content: string) => void) | undefined>;
  onDirtyChangeRef: React.RefObject<((dirty: boolean) => void) | undefined>;
  onContentChangeRef: React.RefObject<((content: string) => void) | undefined>;
}

function updateScrollMetrics(editor: monaco.editor.IStandaloneCodeEditor, setScrollMetrics: React.Dispatch<React.SetStateAction<{ scrollTop: number; scrollHeight: number; clientHeight: number }>>): void {
  const layoutInfo = editor.getLayoutInfo();
  setScrollMetrics({ scrollTop: editor.getScrollTop(), scrollHeight: editor.getScrollHeight(), clientHeight: layoutInfo.height });
}

function bindGotoLineHandler(editor: monaco.editor.IStandaloneCodeEditor, filePathRef: React.RefObject<string>): () => void {
  const handleGotoLine = (event: Event): void => {
    const detail = (event as CustomEvent<{ line: number; filePath?: string }>).detail;
    if (!detail || (detail.filePath && detail.filePath !== filePathRef.current)) return;
    editor.revealLineInCenter(detail.line);
    editor.setPosition({ lineNumber: detail.line, column: 1 });
    editor.focus();
  };
  window.addEventListener('agent-ide:goto-line', handleGotoLine);
  return () => window.removeEventListener('agent-ide:goto-line', handleGotoLine);
}

function bindScrollTracking(
  editor: monaco.editor.IStandaloneCodeEditor,
  setScrollMetrics: React.Dispatch<React.SetStateAction<{ scrollTop: number; scrollHeight: number; clientHeight: number }>>,
  setIsScrolling: React.Dispatch<React.SetStateAction<boolean>>,
  scrollTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>,
): () => void {
  const onScroll = (): void => {
    updateScrollMetrics(editor, setScrollMetrics);
    setIsScrolling(true);
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => setIsScrolling(false), 800);
  };
  requestAnimationFrame(() => updateScrollMetrics(editor, setScrollMetrics));
  const scrollDisposable = editor.onDidScrollChange(onScroll);
  const layoutDisposable = editor.onDidLayoutChange(() => updateScrollMetrics(editor, setScrollMetrics));
  return () => {
    scrollDisposable.dispose();
    layoutDisposable.dispose();
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
  };
}

function bindSaveAction(
  editor: monaco.editor.IStandaloneCodeEditor,
  refs: EditorCallbackRefs & { readOnlyRef: React.RefObject<boolean>; formatOnSaveRef: React.RefObject<boolean> },
  isDirtyRef: React.RefObject<boolean>,
  saveActionDisposableRef: React.RefObject<monaco.IDisposable | null>,
): void {
  const save = (): void => {
    const currentModel = editor.getModel();
    if (!currentModel) return;
    setHostSavedVersion(currentModel.uri.toString(), currentModel.getAlternativeVersionId());
    if (isDirtyRef.current) {
      isDirtyRef.current = false;
      refs.onDirtyChangeRef.current?.(false);
    }
    refs.onSaveRef.current?.(currentModel.getValue());
  };
  saveActionDisposableRef.current = editor.addAction({
    id: 'ouroboros-save',
    label: 'Save File',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
    run: () => {
      if (refs.readOnlyRef.current) return;
      if (refs.formatOnSaveRef.current) {
        const formatAction = editor.getAction('editor.action.formatDocument');
        if (formatAction) {
          formatAction.run().then(save).catch(save);
          return;
        }
      }
      save();
    },
  });
}

function bindContentChange(
  model: monaco.editor.ITextModel,
  refs: EditorCallbackRefs,
  isDirtyRef: React.RefObject<boolean>,
  contentChangeDisposableRef: React.RefObject<monaco.IDisposable | null>,
): void {
  contentChangeDisposableRef.current = model.onDidChangeContent(() => {
    setHostDirtyState(model, isDirtyRef, refs.onDirtyChangeRef);
    refs.onContentChangeRef.current?.(model.getValue());
  });
}

function bindSearchShortcuts(editor: monaco.editor.IStandaloneCodeEditor): () => void {
  const onFind = (): void => { editor.focus(); editor.getAction('actions.find')?.run(); };
  const onReplace = (): void => { editor.focus(); editor.getAction('editor.action.startFindReplaceAction')?.run(); };
  const onGoToLine = (): void => { editor.focus(); editor.getAction('editor.action.gotoLine')?.run(); };
  window.addEventListener('agent-ide:find', onFind);
  window.addEventListener('agent-ide:replace', onReplace);
  window.addEventListener('agent-ide:go-to-line', onGoToLine);
  return () => {
    window.removeEventListener('agent-ide:find', onFind);
    window.removeEventListener('agent-ide:replace', onReplace);
    window.removeEventListener('agent-ide:go-to-line', onGoToLine);
  };
}

function mountMonacoEditor(input: RuntimeInput, setScrollMetrics: React.Dispatch<React.SetStateAction<{ scrollTop: number; scrollHeight: number; clientHeight: number }>>, setIsScrolling: React.Dispatch<React.SetStateAction<boolean>>, scrollTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>): () => void {
  const { filePath, content, language, readOnly, wordWrap, showMinimap, containerRef, editorRef, vimDisposeRef, isDirtyRef, contentChangeDisposableRef, saveActionDisposableRef } = input;
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
    unregisterMonacoEditor(filePath);
    editor.dispose();
    editorRef.current = null;
    scheduleHostViewStateFlush();
  };
}

function useMonacoEditorMount(input: RuntimeInput, setScrollMetrics: React.Dispatch<React.SetStateAction<{ scrollTop: number; scrollHeight: number; clientHeight: number }>>, setIsScrolling: React.Dispatch<React.SetStateAction<boolean>>, scrollTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>): void {
  const inputRef = useRef(input);
  inputRef.current = input;
  useEffect(() => {
    if (!inputRef.current.containerRef.current) return;
    return mountMonacoEditor(inputRef.current, setScrollMetrics, setIsScrolling, scrollTimerRef);
  }, [input.filePath, scrollTimerRef, setIsScrolling, setScrollMetrics]);
}

function useMonacoEditorContentSync(
  editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor | null>,
  content: string,
  isDirtyRef: React.RefObject<boolean>,
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
  return { scrollMetrics, isEditorHovered, setIsEditorHovered, isScrolling };
}

export const MonacoEditor = memo(function MonacoEditor(props: MonacoEditorProps): React.ReactElement {
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
    wordWrap,
    showMinimap,
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
  const callbackRefs = useStableCallbackRefs({ onSave, onDirtyChange, onContentChange, readOnly, formatOnSave, filePath });
  useMonacoTheme();
  const language = languageOverride ?? detectLanguage(filePath);
  const { scrollMetrics, isEditorHovered, setIsEditorHovered, isScrolling } = useMonacoEditorRuntime({
    filePath, content, language, readOnly, onSave, onDirtyChange, onContentChange, keybindingMode, wordWrap, showMinimap, formatOnSave, diffLines, containerRef, editorRef, vimStatusRef, vimDisposeRef, isDirtyRef, contentChangeDisposableRef, saveActionDisposableRef, diffDecorationIdsRef, callbackRefs,
  });
  return (
    <div className={className} style={frameStyle}>
      <div style={shellStyle} onMouseEnter={() => setIsEditorHovered(true)} onMouseLeave={() => setIsEditorHovered(false)}>
        <div ref={containerRef} style={canvasStyle} onClick={() => editorRef.current?.focus()} />
        <ScrollIndicator {...scrollMetrics} isHovered={isEditorHovered} isScrolling={isScrolling} />
      </div>
      {keybindingMode === 'vim' && <div ref={vimStatusRef} className="text-text-semantic-muted" style={vimStatusStyle} />}
    </div>
  );
});

export function disposeMonacoModel(filePath: string): void {
  monaco.editor.getModel(filePathToUri(filePath))?.dispose();
}
