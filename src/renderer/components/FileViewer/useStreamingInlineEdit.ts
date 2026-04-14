/**
 * useStreamingInlineEdit — streaming inline edit via ai:inlineEditStream IPC.
 *
 * Subscribes to token events via aiStream.onStream, batches deltas over a
 * ~50ms window and flushes with editor.executeEdits. A pushUndoStop() call
 * between batches makes the entire streamed edit revert as one Ctrl+Z step.
 *
 * Editor is set readOnly during streaming to prevent cursor anchor drift.
 */
import type { InlineEditStreamEvent, InlineEditStreamRequest } from '@shared/types/inlineEditStream';
import * as monaco from 'monaco-editor';
import type { MutableRefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { SelectionRange } from './useInlineEdit';

// ── Constants ─────────────────────────────────────────────────────────────────

const FLUSH_INTERVAL_MS = 50;
const EDIT_SOURCE = 'inline-edit-stream';
const REQUEST_ID_PREFIX = 'ies-';

// ── Public surface ────────────────────────────────────────────────────────────

export interface StreamingInlineEditState {
  isStreaming: boolean;
  streamedText: string;
  error: string | null;
}

export interface StreamingInlineEditActions extends StreamingInlineEditState {
  startStream: (
    instruction: string,
    selectedText: string,
    selectionRange: SelectionRange,
  ) => Promise<void>;
  cancel: () => Promise<void>;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function generateRequestId(): string {
  return `${REQUEST_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function hasAiStreamApi(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.aiStream;
}

// ── Flush context ─────────────────────────────────────────────────────────────

interface FlushContext {
  editor: monaco.editor.IStandaloneCodeEditor;
  model: monaco.editor.ITextModel;
  selectionRange: SelectionRange;
  pendingRef: MutableRefObject<string>;
  replacedRef: MutableRefObject<boolean>;
  endLineRef: MutableRefObject<number>;
}

function flushPendingTokens(ctx: FlushContext): void {
  const { editor, model, selectionRange, pendingRef, replacedRef, endLineRef } = ctx;
  if (!pendingRef.current) return;
  const delta = pendingRef.current;
  pendingRef.current = '';
  editor.pushUndoStop();
  if (!replacedRef.current) {
    const range = new monaco.Range(
      selectionRange.startLine, 1,
      selectionRange.endLine, model.getLineMaxColumn(selectionRange.endLine),
    );
    editor.executeEdits(EDIT_SOURCE, [{ range, text: delta }]);
    replacedRef.current = true;
    endLineRef.current = selectionRange.startLine + delta.split('\n').length - 1;
    return;
  }
  const endLine = endLineRef.current;
  const endCol = model.getLineMaxColumn(endLine);
  const appendRange = new monaco.Range(endLine, endCol, endLine, endCol);
  editor.executeEdits(EDIT_SOURCE, [{ range: appendRange, text: delta }]);
  endLineRef.current = endLine + delta.split('\n').length - 1;
}

// ── Stream refs bundle ────────────────────────────────────────────────────────

interface StreamRefs {
  currentRequestId: MutableRefObject<string | null>;
  cleanup: MutableRefObject<(() => void) | null>;
  timer: MutableRefObject<ReturnType<typeof setInterval> | null>;
  pending: MutableRefObject<string>;
  replaced: MutableRefObject<boolean>;
  endLine: MutableRefObject<number>;
  editor: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
}

function stopStream(refs: StreamRefs, setIsStreaming: (v: boolean) => void): void {
  if (refs.timer.current) { clearInterval(refs.timer.current); refs.timer.current = null; }
  refs.cleanup.current?.();
  refs.cleanup.current = null;
  refs.currentRequestId.current = null;
  refs.pending.current = '';
  refs.replaced.current = false;
  refs.editor.current?.updateOptions({ readOnly: false });
  setIsStreaming(false);
}

// ── IPC request builder ───────────────────────────────────────────────────────

interface BuildRequestParams {
  requestId: string;
  filePath: string;
  instruction: string;
  selectedText: string;
  selectionRange: SelectionRange;
  model: monaco.editor.ITextModel;
}

function buildStreamRequest(params: BuildRequestParams): InlineEditStreamRequest {
  const { requestId, filePath, instruction, selectedText, selectionRange, model } = params;
  return {
    requestId, filePath, instruction, selectedText,
    range: {
      startLine: selectionRange.startLine, startColumn: 1,
      endLine: selectionRange.endLine,
      endColumn: model.getLineMaxColumn(selectionRange.endLine),
    },
    prefix: model.getValue(),
    suffix: '',
  };
}

// ── Event handler ─────────────────────────────────────────────────────────────

interface EventHandlerDeps {
  flushCtx: FlushContext;
  refs: StreamRefs;
  setIsStreaming: (v: boolean) => void;
  setStreamedText: React.Dispatch<React.SetStateAction<string>>;
  setError: (e: string | null) => void;
}

function handleStreamEvent(ev: InlineEditStreamEvent, deps: EventHandlerDeps): void {
  const { flushCtx, refs, setIsStreaming, setStreamedText, setError } = deps;
  if (ev.type === 'token') {
    refs.pending.current += ev.delta;
    setStreamedText((prev) => prev + ev.delta);
  } else if (ev.type === 'done') {
    flushPendingTokens(flushCtx);
    flushCtx.editor.pushUndoStop();
    stopStream(refs, setIsStreaming);
  } else if (ev.type === 'error') {
    setError(ev.message);
    setStreamedText('');
    stopStream(refs, setIsStreaming);
  }
}

// ── Start stream setup (extracted to keep hook body under limit) ──────────────

interface StartStreamSetup {
  requestId: string;
  editor: monaco.editor.IStandaloneCodeEditor;
  model: monaco.editor.ITextModel;
  selectionRange: SelectionRange;
  refs: StreamRefs;
  setIsStreaming: (v: boolean) => void;
  setStreamedText: React.Dispatch<React.SetStateAction<string>>;
  setError: (e: string | null) => void;
}

function setupStreamListeners(setup: StartStreamSetup): FlushContext {
  const { requestId, editor, model, selectionRange, refs, setIsStreaming, setStreamedText, setError } = setup;
  const flushCtx: FlushContext = {
    editor, model, selectionRange,
    pendingRef: refs.pending, replacedRef: refs.replaced, endLineRef: refs.endLine,
  };
  refs.timer.current = setInterval(() => flushPendingTokens(flushCtx), FLUSH_INTERVAL_MS);
  const evDeps: EventHandlerDeps = { flushCtx, refs, setIsStreaming, setStreamedText, setError };
  refs.cleanup.current = window.electronAPI.aiStream.onStream(
    requestId,
    (ev: InlineEditStreamEvent) => handleStreamEvent(ev, evDeps),
  );
  return flushCtx;
}

// ── Hooks: refs bundle ────────────────────────────────────────────────────────

function useStreamRefs(
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>,
): StreamRefs {
  const refs = useRef<StreamRefs | null>(null);
  if (!refs.current) {
    refs.current = {
      currentRequestId: { current: null },
      cleanup: { current: null },
      timer: { current: null },
      pending: { current: '' },
      replaced: { current: false },
      endLine: { current: 0 },
      editor: editorRef,
    };
  }
  refs.current.editor = editorRef;
  return refs.current;
}

// ── Hooks: startStream callback ───────────────────────────────────────────────

interface UseStartStreamParams {
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  filePath: string;
  refs: StreamRefs;
  setIsStreaming: (v: boolean) => void;
  setStreamedText: React.Dispatch<React.SetStateAction<string>>;
  setError: (e: string | null) => void;
}

function useStartStream(p: UseStartStreamParams) {
  return useCallback(async (
    instruction: string,
    selectedText: string,
    selectionRange: SelectionRange,
  ): Promise<void> => {
    if (!hasAiStreamApi()) return;
    const editor = p.editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;
    const requestId = generateRequestId();
    const refs = p.refs;
    // eslint-disable-next-line react-compiler/react-compiler -- intentional ref mutation
    refs.currentRequestId.current = requestId;
    refs.replaced.current = false;
    refs.pending.current = '';
    p.setStreamedText('');
    p.setError(null);
    p.setIsStreaming(true);
    editor.updateOptions({ readOnly: true });
    setupStreamListeners({
      requestId, editor, model, selectionRange, refs,
      setIsStreaming: p.setIsStreaming, setStreamedText: p.setStreamedText, setError: p.setError,
    });
    const req = buildStreamRequest({ requestId, filePath: p.filePath, instruction, selectedText, selectionRange, model });
    const result = await window.electronAPI.aiStream.startInlineEdit(req);
    if (!result.success) {
      p.setError(result.error ?? 'Failed to start streaming edit');
      stopStream(refs, p.setIsStreaming);
    }
  }, [p.editorRef, p.filePath, p.refs, p.setError, p.setIsStreaming, p.setStreamedText]);
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useStreamingInlineEdit(
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>,
  filePath: string,
): StreamingInlineEditActions {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refs = useStreamRefs(editorRef);

  const startStream = useStartStream({ editorRef, filePath, refs, setIsStreaming, setStreamedText, setError });

  useEffect(() => {
    return () => {
      stopStream(refs, setIsStreaming);
    };
  }, [refs]);

  const cancel = useCallback(async (): Promise<void> => {
    const requestId = refs.currentRequestId.current;
    stopStream(refs, setIsStreaming);
    setStreamedText('');
    if (requestId && hasAiStreamApi()) {
      await window.electronAPI.aiStream.cancelInlineEdit({ requestId });
    }
  }, [refs]);

  return { isStreaming, streamedText, error, startStream, cancel };
}
