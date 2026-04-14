/**
 * useStreamingInlineEdit — unit tests
 *
 * Tests token batching, undo-stack management, error-path revert, and cancel.
 * Monaco editor is mocked to avoid DOM dependency.
 *
 * @vitest-environment jsdom
 */
import type { InlineEditStreamEvent } from '@shared/types/inlineEditStream';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockExecuteEdits = vi.fn();
const mockPushUndoStop = vi.fn();
const mockUpdateOptions = vi.fn();
const mockGetModel = vi.fn();
const mockGetValue = vi.fn(() => '');
const mockGetLineMaxColumn = vi.fn(() => 100);

const mockModel = {
  getLineMaxColumn: mockGetLineMaxColumn,
  getLineCount: vi.fn(() => 1),
  getLinesContent: vi.fn(() => ['']),
  getValue: mockGetValue,
};

const mockEditor = {
  executeEdits: mockExecuteEdits,
  pushUndoStop: mockPushUndoStop,
  updateOptions: mockUpdateOptions,
  getModel: mockGetModel,
};

let streamCallbacks: Map<string, (event: InlineEditStreamEvent) => void>;
let capturedStartReq: unknown;

vi.mock('monaco-editor', () => ({
  Range: class Range {
    constructor(
      public startLineNumber: number,
      public startColumn: number,
      public endLineNumber: number,
      public endColumn: number,
    ) {}
  },
}));

// Mock window.electronAPI — set up before module import
const mockStartInlineEdit = vi.fn();
const mockCancelInlineEdit = vi.fn();
const mockOnStream = vi.fn();

vi.stubGlobal('window', {
  electronAPI: {
    aiStream: {
      startInlineEdit: mockStartInlineEdit,
      cancelInlineEdit: mockCancelInlineEdit,
      onStream: mockOnStream,
    },
  },
});

// ── Import after mocks ────────────────────────────────────────────────────────

import { useStreamingInlineEdit } from './useStreamingInlineEdit';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEditorRef() {
  mockGetModel.mockReturnValue(mockModel);
  return { current: mockEditor as unknown as import('monaco-editor').editor.IStandaloneCodeEditor };
}

function setupMocks() {
  streamCallbacks = new Map();
  capturedStartReq = undefined;

  mockStartInlineEdit.mockImplementation(async (req: { requestId: string }) => {
    capturedStartReq = req;
    return { success: true, requestId: req.requestId };
  });

  mockOnStream.mockImplementation((requestId: string, callback: (ev: InlineEditStreamEvent) => void) => {
    streamCallbacks.set(requestId, callback);
    return () => streamCallbacks.delete(requestId);
  });

  mockCancelInlineEdit.mockImplementation(async () => ({ success: true }));
}

function emitEvent(requestId: string, event: InlineEditStreamEvent) {
  const cb = streamCallbacks.get(requestId);
  if (cb) act(() => cb(event));
}

function getRequestId(): string {
  return (capturedStartReq as { requestId: string }).requestId;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useStreamingInlineEdit', () => {
  beforeEach(() => {
    setupMocks();
    vi.clearAllMocks();
    mockGetModel.mockReturnValue(mockModel);
    // Re-setup after clearAllMocks
    setupMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in idle state', () => {
    const editorRef = makeEditorRef();
    const { result } = renderHook(() =>
      useStreamingInlineEdit(editorRef, '/test/file.ts'),
    );
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.streamedText).toBe('');
  });

  it('calls startInlineEdit with correct params', async () => {
    vi.useFakeTimers();
    const editorRef = makeEditorRef();
    const { result } = renderHook(() =>
      useStreamingInlineEdit(editorRef, '/test/file.ts'),
    );

    const selectionRange = { startLine: 1, endLine: 3 };
    const selectedText = 'const x = 1;';

    await act(async () => {
      await result.current.startStream('rename to y', selectedText, selectionRange);
    });

    expect(mockStartInlineEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/test/file.ts',
        instruction: 'rename to y',
        selectedText,
        range: expect.objectContaining({ startLine: 1, endLine: 3 }),
      }),
    );
  });

  it('accumulates streamed tokens in streamedText', async () => {
    vi.useFakeTimers();
    const editorRef = makeEditorRef();
    const { result } = renderHook(() =>
      useStreamingInlineEdit(editorRef, '/test/file.ts'),
    );

    await act(async () => {
      await result.current.startStream('edit', 'code', { startLine: 1, endLine: 1 });
    });

    const requestId = getRequestId();

    act(() => {
      emitEvent(requestId, { type: 'token', delta: 'hello' });
      emitEvent(requestId, { type: 'token', delta: ' world' });
    });

    expect(result.current.streamedText).toBe('hello world');
  });

  it('calls executeEdits after flush interval', async () => {
    vi.useFakeTimers();
    const editorRef = makeEditorRef();
    const { result } = renderHook(() =>
      useStreamingInlineEdit(editorRef, '/test/file.ts'),
    );

    await act(async () => {
      await result.current.startStream('edit', 'code', { startLine: 1, endLine: 1 });
    });

    const requestId = getRequestId();

    act(() => {
      emitEvent(requestId, { type: 'token', delta: 'hello world' });
    });

    act(() => { vi.advanceTimersByTime(60); });

    expect(mockExecuteEdits).toHaveBeenCalled();
  });

  it('calls pushUndoStop on each flush for single undo support', async () => {
    vi.useFakeTimers();
    const editorRef = makeEditorRef();
    const { result } = renderHook(() =>
      useStreamingInlineEdit(editorRef, '/test/file.ts'),
    );

    await act(async () => {
      await result.current.startStream('edit', 'code', { startLine: 1, endLine: 1 });
    });

    const requestId = getRequestId();

    act(() => { emitEvent(requestId, { type: 'token', delta: 'first' }); });
    act(() => { vi.advanceTimersByTime(60); });
    act(() => { emitEvent(requestId, { type: 'token', delta: 'second' }); });
    act(() => { vi.advanceTimersByTime(60); });

    expect(mockPushUndoStop).toHaveBeenCalled();
  });

  it('disables editor writability during streaming', async () => {
    vi.useFakeTimers();
    const editorRef = makeEditorRef();
    const { result } = renderHook(() =>
      useStreamingInlineEdit(editorRef, '/test/file.ts'),
    );

    await act(async () => {
      await result.current.startStream('edit', 'code', { startLine: 1, endLine: 1 });
    });

    expect(mockUpdateOptions).toHaveBeenCalledWith({ readOnly: true });
    expect(result.current.isStreaming).toBe(true);
  });

  it('re-enables editor and clears streaming on done event', async () => {
    vi.useFakeTimers();
    const editorRef = makeEditorRef();
    const { result } = renderHook(() =>
      useStreamingInlineEdit(editorRef, '/test/file.ts'),
    );

    await act(async () => {
      await result.current.startStream('edit', 'code', { startLine: 1, endLine: 1 });
    });

    const requestId = getRequestId();
    act(() => { emitEvent(requestId, { type: 'done', finalText: 'const y = 1;' }); });

    expect(mockUpdateOptions).toHaveBeenCalledWith({ readOnly: false });
    expect(result.current.isStreaming).toBe(false);
  });

  it('re-enables editor and resets streamedText on error event', async () => {
    vi.useFakeTimers();
    const editorRef = makeEditorRef();
    const { result } = renderHook(() =>
      useStreamingInlineEdit(editorRef, '/test/file.ts'),
    );

    await act(async () => {
      await result.current.startStream('edit', 'code', { startLine: 1, endLine: 1 });
    });

    const requestId = getRequestId();
    act(() => { emitEvent(requestId, { type: 'error', message: 'model error' }); });

    expect(mockUpdateOptions).toHaveBeenCalledWith({ readOnly: false });
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.streamedText).toBe('');
  });

  it('cancel sends cancelInlineEdit and re-enables editor', async () => {
    vi.useFakeTimers();
    const editorRef = makeEditorRef();
    const { result } = renderHook(() =>
      useStreamingInlineEdit(editorRef, '/test/file.ts'),
    );

    await act(async () => {
      await result.current.startStream('edit', 'code', { startLine: 1, endLine: 1 });
    });

    const requestId = getRequestId();

    await act(async () => {
      await result.current.cancel();
    });

    expect(mockCancelInlineEdit).toHaveBeenCalledWith({ requestId });
    expect(mockUpdateOptions).toHaveBeenCalledWith({ readOnly: false });
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.streamedText).toBe('');
  });
});
