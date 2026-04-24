/**
 * MonacoEditor mount helpers — editor creation and cleanup lifecycle.
 */
import * as monaco from 'monaco-editor';
import type { MutableRefObject } from 'react';
import type React from 'react';

import type { DiffLineInfo } from '../../types/electron';
import { registerMonacoEditor, unregisterMonacoEditor } from './editorRegistry';
import { saveEditorState } from './editorStateStore';
import {
  bindContentChange,
  bindGotoLineHandler,
  bindInlineEditAction,
  bindSaveAction,
  bindScrollTracking,
  bindSearchShortcuts,
  type EditorCallbackRefs,
} from './monacoEditorRefs';
import {
  createEditorOptions,
  getHostViewState,
  getOrCreateModel,
  hasHostSavedVersion,
  type KeybindingMode,
  scheduleHostViewStateFlush,
  setHostSavedVersion,
} from './monacoVimMode';

export type { KeybindingMode };

export interface RuntimeInput {
  filePath: string;
  content: string;
  language: string;
  readOnly: boolean;
  projectRoot?: string | null;
  onSave?: (content: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onContentChange?: (content: string) => void;
  keybindingMode: KeybindingMode;
  wordWrap?: boolean;
  showMinimap?: boolean;
  showBlame?: boolean;
  formatOnSave: boolean;
  diffLines: DiffLineInfo[];
  containerRef: MutableRefObject<HTMLDivElement | null>;
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  vimStatusRef: MutableRefObject<HTMLDivElement | null>;
  vimDisposeRef: MutableRefObject<(() => void) | null>;
  isDirtyRef: MutableRefObject<boolean>;
  contentChangeDisposableRef: MutableRefObject<monaco.IDisposable | null>;
  saveActionDisposableRef: MutableRefObject<monaco.IDisposable | null>;
  inlineEditDisposableRef: MutableRefObject<monaco.IDisposable | null>;
  activateInlineEditRef: MutableRefObject<() => void>;
  diffDecorationIdsRef: MutableRefObject<string[]>;
  /** Stable refs that track the latest callback props across re-renders */
  callbackRefs: EditorCallbackRefs & {
    readOnlyRef: MutableRefObject<boolean>;
    formatOnSaveRef: MutableRefObject<boolean>;
    filePathRef: MutableRefObject<string>;
  };
}

interface DisposeResources {
  filePath: string;
  editor: monaco.editor.IStandaloneCodeEditor;
  vimDisposeRef: MutableRefObject<(() => void) | null>;
  contentChangeDisposableRef: MutableRefObject<monaco.IDisposable | null>;
  saveActionDisposableRef: MutableRefObject<monaco.IDisposable | null>;
  inlineEditDisposableRef: MutableRefObject<monaco.IDisposable | null>;
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  searchCleanup: () => void;
  disposeGoto: () => void;
  disposeScroll: () => void;
}

function disposeEditorResources(r: DisposeResources): void {
  try {
    const position = r.editor.getPosition();
    saveEditorState(r.filePath, {
      scrollTop: r.editor.getScrollTop(),
      scrollLeft: r.editor.getScrollLeft(),
      cursorLine: position?.lineNumber ?? 1,
      cursorColumn: position?.column ?? 1,
    });
  } catch {
    return;
  }
  r.searchCleanup();
  r.disposeGoto();
  r.vimDisposeRef.current?.();
  r.vimDisposeRef.current = null;
  r.disposeScroll();
  r.contentChangeDisposableRef.current?.dispose();
  r.contentChangeDisposableRef.current = null;
  r.saveActionDisposableRef.current?.dispose();
  r.saveActionDisposableRef.current = null;
  r.inlineEditDisposableRef.current?.dispose();
  r.inlineEditDisposableRef.current = null;
  unregisterMonacoEditor(r.filePath);
  r.editor.dispose();
  r.editorRef.current = null;
  scheduleHostViewStateFlush();
}

interface BindActionsParams {
  editor: monaco.editor.IStandaloneCodeEditor;
  model: monaco.editor.ITextModel;
  input: RuntimeInput;
  setScrollMetrics: React.Dispatch<
    React.SetStateAction<{ scrollTop: number; scrollHeight: number; clientHeight: number }>
  >;
  setIsScrolling: React.Dispatch<React.SetStateAction<boolean>>;
  scrollTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

function bindEditorActions(p: BindActionsParams): {
  searchCleanup: () => void;
  disposeGoto: () => void;
  disposeScroll: () => void;
} {
  const { editor, model, input, setScrollMetrics, setIsScrolling, scrollTimerRef } = p;
  const refs = input.callbackRefs;
  bindSaveAction(editor, refs, input.isDirtyRef, input.saveActionDisposableRef);
  bindInlineEditAction(editor, input.activateInlineEditRef, input.inlineEditDisposableRef);
  bindContentChange(model, refs, input.isDirtyRef, input.contentChangeDisposableRef);
  const disposeGoto = bindGotoLineHandler(editor, refs.filePathRef);
  const disposeScroll = bindScrollTracking(editor, setScrollMetrics, setIsScrolling, scrollTimerRef);
  const searchCleanup = bindSearchShortcuts(editor);
  return { searchCleanup, disposeGoto, disposeScroll };
}

export function mountMonacoEditor(
  input: RuntimeInput,
  setScrollMetrics: React.Dispatch<
    React.SetStateAction<{ scrollTop: number; scrollHeight: number; clientHeight: number }>
  >,
  setIsScrolling: React.Dispatch<React.SetStateAction<boolean>>,
  scrollTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
): () => void {
  const { filePath, content, language, readOnly, wordWrap, showMinimap, containerRef, editorRef, vimDisposeRef, contentChangeDisposableRef, saveActionDisposableRef, inlineEditDisposableRef } = input;
  const model = getOrCreateModel(filePath, content, language);
  if (model.getValue() !== content) model.setValue(content);
  if (!hasHostSavedVersion(model.uri.toString()))
    setHostSavedVersion(model.uri.toString(), model.getAlternativeVersionId());
  const editor = monaco.editor.create(containerRef.current!, { ...createEditorOptions(readOnly, wordWrap, showMinimap), model });
  editorRef.current = editor;
  registerMonacoEditor(filePath, editor);
  const savedViewState = getHostViewState(filePath);
  if (savedViewState) requestAnimationFrame(() => editor.restoreViewState(savedViewState));
  const { searchCleanup, disposeGoto, disposeScroll } = bindEditorActions({ editor, model, input, setScrollMetrics, setIsScrolling, scrollTimerRef });
  return () => disposeEditorResources({ filePath, editor, vimDisposeRef, contentChangeDisposableRef, saveActionDisposableRef, inlineEditDisposableRef, editorRef, searchCleanup, disposeGoto, disposeScroll });
}
