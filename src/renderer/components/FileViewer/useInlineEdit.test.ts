/**
 * useInlineEdit — smoke tests.
 *
 * Tests the pure exported constants and the applyEdit helper directly.
 * The full hook (useInlineEdit) requires a React renderer + Monaco editor
 * instance; those paths are covered by the FileViewer integration tests.
 *
 * Note: monaco-editor is mocked — it is a native ESM module that fails
 * to load under vitest's Node environment without a DOM.
 */
import { describe, expect, it, vi } from 'vitest';

import { applyEdit, IDLE_STATE, type SelectionRange } from './useInlineEdit';

// ── Monaco mock ───────────────────────────────────────────────────────────────
// vi.mock is hoisted to the top of the file, so class definitions cannot be
// referenced inside the factory. Use a factory function returning a plain object.

vi.mock('monaco-editor', () => {
  function MockRange(sl: number, sc: number, el: number, ec: number) {
    return { startLineNumber: sl, startColumn: sc, endLineNumber: el, endColumn: ec };
  }
  return { Range: MockRange };
});

vi.mock('./useStreamingInlineEdit', () => ({
  useStreamingInlineEdit: vi.fn(() => ({
    isStreaming: false,
    startStream: vi.fn(() => Promise.resolve()),
    cancel: vi.fn(),
  })),
}));

// ── IDLE_STATE ────────────────────────────────────────────────────────────────

describe('IDLE_STATE', () => {
  it('has phase idle', () => {
    expect(IDLE_STATE.phase).toBe('idle');
  });

  it('has null editedCode and selectionRange', () => {
    expect(IDLE_STATE.editedCode).toBeNull();
    expect(IDLE_STATE.selectionRange).toBeNull();
    expect(IDLE_STATE.error).toBeNull();
  });

  it('has empty instruction and originalCode strings', () => {
    expect(IDLE_STATE.instruction).toBe('');
    expect(IDLE_STATE.originalCode).toBe('');
  });
});

// ── applyEdit ─────────────────────────────────────────────────────────────────

describe('applyEdit', () => {
  function makeEditor(lineMaxColumn = 80) {
    return {
      getModel: vi.fn(() => ({
        getLineMaxColumn: vi.fn(() => lineMaxColumn),
      })),
      pushUndoStop: vi.fn(),
      executeEdits: vi.fn(),
    };
  }

  const range: SelectionRange = { startLine: 3, endLine: 5 };

  it('calls executeEdits with the replacement text', () => {
    const editor = makeEditor();
    applyEdit(editor as never, range, 'const x = 1;');
    expect(editor.executeEdits).toHaveBeenCalledWith(
      'inline-edit',
      expect.arrayContaining([
        expect.objectContaining({ text: 'const x = 1;' }),
      ]),
    );
  });

  it('wraps the edit with pushUndoStop calls', () => {
    const editor = makeEditor();
    applyEdit(editor as never, range, 'hello');
    expect(editor.pushUndoStop).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when getModel returns null', () => {
    const editor = { getModel: vi.fn(() => null), pushUndoStop: vi.fn(), executeEdits: vi.fn() };
    applyEdit(editor as never, range, 'hello');
    expect(editor.executeEdits).not.toHaveBeenCalled();
  });

  it('constructs the Range spanning the selection lines', () => {
    const editor = makeEditor(40);
    applyEdit(editor as never, range, 'x');
    const [, edits] = editor.executeEdits.mock.calls[0] as [string, Array<{ range: Record<string, number> }>];
    const r = edits[0].range;
    expect(r['startLineNumber']).toBe(3);
    expect(r['endLineNumber']).toBe(5);
    expect(r['endColumn']).toBe(40);
  });
});

// ── module contract ───────────────────────────────────────────────────────────

describe('useInlineEdit module', () => {
  it('exports useInlineEdit as a function', async () => {
    const mod = await import('./useInlineEdit');
    expect(typeof mod.useInlineEdit).toBe('function');
  });

  it('exports applyEdit as a function', async () => {
    const mod = await import('./useInlineEdit');
    expect(typeof mod.applyEdit).toBe('function');
  });
});
