/**
 * monacoEditorRefs — stable React refs + action binders for MonacoEditor.
 */
import * as monaco from 'monaco-editor';
import type { MutableRefObject, RefObject } from 'react';
import { useRef } from 'react';

import { setHostDirtyState, setHostSavedVersion } from './monacoVimMode';

export interface EditorRefs {
  containerRef: React.RefObject<HTMLDivElement | null>;
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  vimStatusRef: React.RefObject<HTMLDivElement | null>;
  vimDisposeRef: MutableRefObject<(() => void) | null>;
  isDirtyRef: MutableRefObject<boolean>;
  contentChangeDisposableRef: MutableRefObject<monaco.IDisposable | null>;
  saveActionDisposableRef: MutableRefObject<monaco.IDisposable | null>;
  inlineEditDisposableRef: MutableRefObject<monaco.IDisposable | null>;
  diffDecorationIdsRef: MutableRefObject<string[]>;
}

export function useEditorRefs(): EditorRefs {
  return {
    containerRef: useRef<HTMLDivElement>(null),
    editorRef: useRef<monaco.editor.IStandaloneCodeEditor | null>(null),
    vimStatusRef: useRef<HTMLDivElement>(null),
    vimDisposeRef: useRef<(() => void) | null>(null),
    isDirtyRef: useRef(false),
    contentChangeDisposableRef: useRef<monaco.IDisposable | null>(null),
    saveActionDisposableRef: useRef<monaco.IDisposable | null>(null),
    inlineEditDisposableRef: useRef<monaco.IDisposable | null>(null),
    diffDecorationIdsRef: useRef<string[]>([]),
  };
}

export interface EditorCallbackRefs {
  onSaveRef: MutableRefObject<((content: string) => void) | undefined>;
  onDirtyChangeRef: MutableRefObject<((dirty: boolean) => void) | undefined>;
  onContentChangeRef: MutableRefObject<((content: string) => void) | undefined>;
}

export function updateScrollMetrics(
  editor: monaco.editor.IStandaloneCodeEditor,
  setScrollMetrics: React.Dispatch<React.SetStateAction<{ scrollTop: number; scrollHeight: number; clientHeight: number }>>,
): void {
  const layoutInfo = editor.getLayoutInfo();
  setScrollMetrics({ scrollTop: editor.getScrollTop(), scrollHeight: editor.getScrollHeight(), clientHeight: layoutInfo.height });
}

export function bindGotoLineHandler(editor: monaco.editor.IStandaloneCodeEditor, filePathRef: RefObject<string | null>): () => void {
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

export function bindScrollTracking(
  editor: monaco.editor.IStandaloneCodeEditor,
  setScrollMetrics: React.Dispatch<React.SetStateAction<{ scrollTop: number; scrollHeight: number; clientHeight: number }>>,
  setIsScrolling: React.Dispatch<React.SetStateAction<boolean>>,
  scrollTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
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

export function bindSaveAction(
  editor: monaco.editor.IStandaloneCodeEditor,
  refs: EditorCallbackRefs & { readOnlyRef: RefObject<boolean | null>; formatOnSaveRef: RefObject<boolean | null> },
  isDirtyRef: MutableRefObject<boolean>,
  saveActionDisposableRef: MutableRefObject<monaco.IDisposable | null>,
): void {
  const save = (): void => {
    const currentModel = editor.getModel();
    if (!currentModel) return;
    setHostSavedVersion(currentModel.uri.toString(), currentModel.getAlternativeVersionId());
    if (isDirtyRef.current) { isDirtyRef.current = false; refs.onDirtyChangeRef.current?.(false); }
    refs.onSaveRef.current?.(currentModel.getValue());
  };
  saveActionDisposableRef.current = editor.addAction({
    id: 'ouroboros-save', label: 'Save File',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
    run: () => {
      if (refs.readOnlyRef.current) return;
      if (refs.formatOnSaveRef.current) {
        const formatAction = editor.getAction('editor.action.formatDocument');
        if (formatAction) { formatAction.run().then(save).catch(save); return; }
      }
      save();
    },
  });
}

export function bindContentChange(
  model: monaco.editor.ITextModel,
  refs: EditorCallbackRefs,
  isDirtyRef: MutableRefObject<boolean>,
  contentChangeDisposableRef: MutableRefObject<monaco.IDisposable | null>,
): void {
  contentChangeDisposableRef.current = model.onDidChangeContent(() => {
    setHostDirtyState(model, isDirtyRef, refs.onDirtyChangeRef);
    refs.onContentChangeRef.current?.(model.getValue());
  });
}

export function bindSearchShortcuts(editor: monaco.editor.IStandaloneCodeEditor): () => void {
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

export function bindInlineEditAction(
  editor: monaco.editor.IStandaloneCodeEditor,
  activateRef: MutableRefObject<() => void>,
  inlineEditDisposableRef: MutableRefObject<monaco.IDisposable | null>,
): void {
  inlineEditDisposableRef.current = editor.addAction({
    id: 'ouroboros-inline-edit',
    label: 'Inline Edit',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
    run: () => {
      activateRef.current();
    },
  });
}
