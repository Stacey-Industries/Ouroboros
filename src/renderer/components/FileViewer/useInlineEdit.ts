/**
 * useInlineEdit — State machine for the Ctrl+K inline edit flow.
 *
 * Phases: idle → input → loading → preview → idle
 * Accepts / reject / cancel return to idle.
 *
 * Submit routes through useStreamingInlineEdit unconditionally.
 */
import * as monaco from 'monaco-editor';
import type { MutableRefObject } from 'react';
import { useCallback, useRef, useState } from 'react';

import type { StreamingInlineEditActions } from './useStreamingInlineEdit';
import { useStreamingInlineEdit } from './useStreamingInlineEdit';

export type InlineEditPhase = 'idle' | 'input' | 'loading' | 'preview';

export interface SelectionRange {
  startLine: number;
  endLine: number;
}

export interface InlineEditState {
  phase: InlineEditPhase;
  instruction: string;
  originalCode: string;
  editedCode: string | null;
  selectionRange: SelectionRange | null;
  error: string | null;
}

export interface InlineEditActions {
  state: InlineEditState;
  activate: () => void;
  submit: (instruction: string) => Promise<void>;
  accept: () => void;
  reject: () => void;
  cancel: () => void;
  /** Streaming inline edit controls. */
  streaming?: StreamingInlineEditActions;
}

export const IDLE_STATE: InlineEditState = {
  phase: 'idle',
  instruction: '',
  originalCode: '',
  editedCode: null,
  selectionRange: null,
  error: null,
};

function captureSelection(
  editor: monaco.editor.IStandaloneCodeEditor,
): { originalCode: string; selectionRange: SelectionRange } | null {
  const selection = editor.getSelection();
  const model = editor.getModel();
  if (!selection || !model || selection.isEmpty()) return null;
  return {
    originalCode: model.getValueInRange(selection),
    selectionRange: {
      startLine: selection.startLineNumber,
      endLine: selection.endLineNumber,
    },
  };
}

export function applyEdit(
  editor: monaco.editor.IStandaloneCodeEditor,
  selectionRange: SelectionRange,
  editedCode: string,
): void {
  const model = editor.getModel();
  if (!model) return;
  const range = new monaco.Range(
    selectionRange.startLine,
    1,
    selectionRange.endLine,
    model.getLineMaxColumn(selectionRange.endLine),
  );
  editor.pushUndoStop();
  editor.executeEdits('inline-edit', [{ range, text: editedCode }]);
  editor.pushUndoStop();
}

function hasStreamingApi(): boolean {
  return typeof window !== 'undefined' &&
    !!(window.electronAPI?.config as unknown as Record<string, unknown> | undefined);
}

export function useInlineEdit(
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>,
  filePath: string,
  languageId: string,
): InlineEditActions {
  const [state, setState] = useState<InlineEditState>(IDLE_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const streaming = useStreamingInlineEdit(editorRef, filePath);

  const activate = useCallback((): void => {
    const editor = editorRef.current;
    if (!editor) return;
    const captured = captureSelection(editor);
    if (!captured) return;
    setState({ phase: 'input', instruction: '', originalCode: captured.originalCode, editedCode: null, selectionRange: captured.selectionRange, error: null });
  }, [editorRef]);

  const submit = useCallback((instruction: string): Promise<void> => {
    if (hasStreamingApi() && stateRef.current.selectionRange) {
      setState((s) => ({ ...s, phase: 'loading' as InlineEditPhase, instruction, error: null }));
      const { selectionRange, originalCode } = stateRef.current;
      return streaming.startStream(instruction, originalCode, selectionRange).then(() => {
        setState((s) => ({ ...s, phase: 'preview' as InlineEditPhase }));
      });
    }
    return Promise.resolve();
  }, [editorRef, filePath, languageId, streaming]);

  const accept = useCallback((): void => {
    const current = stateRef.current;
    if (current.phase !== 'preview' || !current.selectionRange || !current.editedCode) return;
    if (editorRef.current) applyEdit(editorRef.current, current.selectionRange, current.editedCode);
    setState(IDLE_STATE);
  }, [editorRef]);

  const reject = useCallback((): void => { setState(IDLE_STATE); }, []);

  const cancel = useCallback((): void => {
    if (streaming.isStreaming) { void streaming.cancel(); }
    setState(IDLE_STATE);
  }, [streaming]);

  return { state, activate, submit, accept, reject, cancel, streaming };
}
