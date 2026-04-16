/**
 * @vitest-environment jsdom
 *
 * useLayoutUndoStack.test.ts — Unit tests for layout undo stack (Wave 28 Phase D).
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SerializedSlotNode } from '../../types/electron-layout';
import { useLayoutUndoStack } from './useLayoutUndoStack';

const LEAF_A: SerializedSlotNode = { kind: 'leaf', slotName: 'editorContent', component: { componentKey: 'editorContent' } };
const LEAF_B: SerializedSlotNode = { kind: 'leaf', slotName: 'terminalContent', component: { componentKey: 'terminalContent' } };
const LEAF_C: SerializedSlotNode = { kind: 'leaf', slotName: 'agentCards', component: { componentKey: 'agentCards' } };

describe('useLayoutUndoStack', () => {
  it('canUndo is false initially', () => {
    const { result } = renderHook(() => useLayoutUndoStack());
    expect(result.current.canUndo).toBe(false);
  });

  it('push adds to stack and canUndo becomes true', () => {
    const { result } = renderHook(() => useLayoutUndoStack());
    act(() => { result.current.push(LEAF_A); });
    expect(result.current.canUndo).toBe(true);
  });

  it('pop returns the most recently pushed tree', () => {
    const { result } = renderHook(() => useLayoutUndoStack());
    act(() => { result.current.push(LEAF_A); });
    act(() => { result.current.push(LEAF_B); });
    let popped: SerializedSlotNode | null = null;
    act(() => { popped = result.current.pop(); });
    expect(popped).toEqual(LEAF_B);
  });

  it('pop() on empty stack returns null', () => {
    const { result } = renderHook(() => useLayoutUndoStack());
    let popped: unknown = 'sentinel';
    act(() => { popped = result.current.pop(); });
    expect(popped).toBeNull();
  });

  it('canUndo becomes false after popping the last entry', () => {
    const { result } = renderHook(() => useLayoutUndoStack());
    act(() => { result.current.push(LEAF_A); });
    act(() => { result.current.pop(); });
    expect(result.current.canUndo).toBe(false);
  });

  it('respects depth cap of 10 — oldest entry is dropped', () => {
    const { result } = renderHook(() => useLayoutUndoStack());
    act(() => {
      for (let i = 0; i < 12; i++) {
        result.current.push({ kind: 'leaf', slotName: `slot-${i}`, component: { componentKey: `slot-${i}` } });
      }
    });
    // Pop all 10 allowed entries — the 11th pop should return null
    act(() => {
      for (let i = 0; i < 10; i++) result.current.pop();
    });
    let eleventh: unknown = 'sentinel';
    act(() => { eleventh = result.current.pop(); });
    expect(eleventh).toBeNull();
    expect(result.current.canUndo).toBe(false);
  });

  it('pops in LIFO order across multiple pushes', () => {
    const { result } = renderHook(() => useLayoutUndoStack());
    act(() => {
      result.current.push(LEAF_A);
      result.current.push(LEAF_B);
      result.current.push(LEAF_C);
    });
    const results: unknown[] = [];
    act(() => {
      results.push(result.current.pop());
      results.push(result.current.pop());
      results.push(result.current.pop());
    });
    expect(results[0]).toEqual(LEAF_C);
    expect(results[1]).toEqual(LEAF_B);
    expect(results[2]).toEqual(LEAF_A);
  });
});
