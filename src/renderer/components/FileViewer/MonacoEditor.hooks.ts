/**
 * MonacoEditor lifecycle hooks — content sync, options, modes, diffs, runtime state.
 */
import * as monaco from 'monaco-editor';
import type React from 'react';
import type { MutableRefObject } from 'react';
import { useEffect, useRef, useState } from 'react';

import { useConfig } from '../../hooks/useConfig';
import { mountMonacoEditor, type RuntimeInput } from './MonacoEditor.mount';
import { useMonacoLspLifecycle } from './monacoLsp';
import {
  buildDiffDecorations,
  buildMinimapEditorOptions,
  enableVimMode,
  setHostSavedVersion,
} from './monacoVimMode';
import { useMonacoBlame } from './useMonacoBlame';

export function useMonacoEditorMount(
  input: RuntimeInput,
  setScrollMetrics: React.Dispatch<
    React.SetStateAction<{ scrollTop: number; scrollHeight: number; clientHeight: number }>
  >,
  setIsScrolling: React.Dispatch<React.SetStateAction<boolean>>,
  scrollTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
): void {
  'use no memo';
  const inputRef = useRef(input);
  inputRef.current = input;
  useEffect(() => {
    if (!inputRef.current.containerRef.current) return;
    return mountMonacoEditor(inputRef.current, setScrollMetrics, setIsScrolling, scrollTimerRef);
  }, [input.filePath, scrollTimerRef, setIsScrolling, setScrollMetrics]);
}

export function useMonacoEditorContentSync(
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>,
  content: string,
  isDirtyRef: MutableRefObject<boolean>,
  onDirtyChange?: (dirty: boolean) => void,
): void {
  'use no memo';
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

export function useMonacoEditorFontFamily(
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>,
): void {
  'use no memo';
  const { config } = useConfig();
  const editorFont = config?.theming?.fonts?.editor;
  useEffect(() => {
    const editor = editorRef.current;
    if (editor) editor.updateOptions({ fontFamily: resolveEditorFont() });
  }, [editorRef, editorFont]);
}

export function useMonacoEditorOptions(input: RuntimeInput): void {
  'use no memo';
  useEffect(() => {
    const editor = input.editorRef.current;
    if (editor)
      editor.updateOptions({
        readOnly: input.readOnly,
        quickSuggestions: input.readOnly ? false : true,
        suggestOnTriggerCharacters: !input.readOnly,
        contextmenu: !input.readOnly,
      });
  }, [input.editorRef, input.readOnly]);
  useEffect(() => {
    const editor = input.editorRef.current;
    if (editor && input.wordWrap !== undefined)
      editor.updateOptions({ wordWrap: input.wordWrap ? 'on' : 'off' });
  }, [input.editorRef, input.wordWrap]);
  useEffect(() => {
    const editor = input.editorRef.current;
    if (!editor) return;
    // Always apply — when `showMinimap` is undefined the construction default
    // treats it as `true`, so the effect must apply the matching corrections
    // (ruler off, scrollbar collapsed). Earlier `!== undefined` guard left
    // Monaco's default 3-lane overview ruler visible as a residual strip.
    editor.updateOptions(buildMinimapEditorOptions(input.showMinimap));
  }, [input.editorRef, input.showMinimap]);
  useMonacoEditorFontFamily(input.editorRef);
}

export function useMonacoEditorModes(input: RuntimeInput): void {
  'use no memo';
  useEffect(() => {
    const editor = input.editorRef.current;
    if (!editor) return;
    if (input.vimDisposeRef.current) {
      input.vimDisposeRef.current();
      input.vimDisposeRef.current = null;
    }
    if (input.keybindingMode === 'vim' && input.vimStatusRef.current) {
      void enableVimMode(editor, input.vimStatusRef.current).then((dispose) => {
        if (dispose) input.vimDisposeRef.current = dispose;
      });
    }
    return () => {
      input.vimDisposeRef.current?.();
      input.vimDisposeRef.current = null;
    };
  }, [input.editorRef, input.keybindingMode, input.vimDisposeRef, input.vimStatusRef]);
}

export function useMonacoEditorDiffs(input: RuntimeInput): void {
  'use no memo';
  useEffect(() => {
    const editor = input.editorRef.current;
    if (!editor) return;
    input.diffDecorationIdsRef.current = editor.deltaDecorations(
      input.diffDecorationIdsRef.current,
      buildDiffDecorations(input.diffLines),
    );
  }, [input.diffDecorationIdsRef, input.diffLines, input.editorRef]);
}

export interface EditorRuntimeResult {
  scrollMetrics: { scrollTop: number; scrollHeight: number; clientHeight: number };
  isEditorHovered: boolean;
  setIsEditorHovered: React.Dispatch<React.SetStateAction<boolean>>;
  isScrolling: boolean;
}

export function useMonacoEditorRuntime(input: RuntimeInput): EditorRuntimeResult {
  'use no memo';
  const [scrollMetrics, setScrollMetrics] = useState({
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
  });
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
