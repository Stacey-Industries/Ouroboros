/**
 * useInlineEdit — State machine for the Ctrl+K inline edit flow.
 *
 * Phases: idle → input → loading → preview → idle
 * Accepts / reject / cancel return to idle.
 */
import * as monaco from 'monaco-editor';
import type { MutableRefObject } from 'react';
import { useCallback, useRef, useState } from 'react';

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
}

export const IDLE_STATE: InlineEditState = {
  phase: 'idle',
  instruction: '',
  originalCode: '',
  editedCode: null,
  selectionRange: null,
  error: null,
};

function hasAiApi(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.ai;
}

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

interface SubmitDeps {
  stateRef: MutableRefObject<InlineEditState>;
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  filePath: string;
  languageId: string;
  setState: React.Dispatch<React.SetStateAction<InlineEditState>>;
}

async function runSubmit(instruction: string, deps: SubmitDeps): Promise<void> {
  const { stateRef, editorRef, filePath, languageId, setState } = deps;
  const current = stateRef.current;
  if (current.phase !== 'input' || !current.selectionRange) return;
  if (!hasAiApi()) {
    setState((s) => ({ ...s, phase: 'input' as InlineEditPhase, error: 'AI API unavailable' }));
    return;
  }
  setState((s) => ({ ...s, phase: 'loading' as InlineEditPhase, instruction, error: null }));
  const fullFileContent = editorRef.current?.getModel()?.getValue() ?? '';
  try {
    const response = await window.electronAPI.ai.inlineEdit({
      filePath, languageId,
      selectedCode: current.originalCode,
      fullFileContent,
      selectionRange: current.selectionRange,
      instruction,
    });
    if (!response.success || !response.editedCode) {
      setState((s) => ({ ...s, phase: 'input' as InlineEditPhase, error: response.error ?? 'Edit generation failed' }));
      return;
    }
    setState((s) => ({ ...s, phase: 'preview' as InlineEditPhase, editedCode: response.editedCode ?? null, error: null }));
  } catch (err) {
    setState((s) => ({ ...s, phase: 'input' as InlineEditPhase, error: err instanceof Error ? err.message : 'Unknown error' }));
  }
}

export function useInlineEdit(
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>,
  filePath: string,
  languageId: string,
): InlineEditActions {
  const [state, setState] = useState<InlineEditState>(IDLE_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const activate = useCallback((): void => {
    const editor = editorRef.current;
    if (!editor) return;
    const captured = captureSelection(editor);
    if (!captured) return;
    setState({ phase: 'input', instruction: '', originalCode: captured.originalCode, editedCode: null, selectionRange: captured.selectionRange, error: null });
  }, [editorRef]);

  const submit = useCallback((instruction: string): Promise<void> => {
    return runSubmit(instruction, { stateRef, editorRef, filePath, languageId, setState });
  }, [editorRef, filePath, languageId]);

  const accept = useCallback((): void => {
    const current = stateRef.current;
    if (current.phase !== 'preview' || !current.selectionRange || !current.editedCode) return;
    if (editorRef.current) applyEdit(editorRef.current, current.selectionRange, current.editedCode);
    setState(IDLE_STATE);
  }, [editorRef]);

  const reject = useCallback((): void => { setState(IDLE_STATE); }, []);
  const cancel = useCallback((): void => { setState(IDLE_STATE); }, []);

  return { state, activate, submit, accept, reject, cancel };
}
