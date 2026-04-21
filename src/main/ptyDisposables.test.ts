/**
 * ptyDisposables.test.ts — smoke tests for disposeAll.
 */

import { describe, expect, it, vi } from 'vitest';

import { disposeAll } from './ptyDisposables';

describe('disposeAll', () => {
  it('calls dispose() on every entry', () => {
    const a = { dispose: vi.fn() };
    const b = { dispose: vi.fn() };
    const list = [a, b];
    disposeAll(list);
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(b.dispose).toHaveBeenCalledTimes(1);
  });

  it('empties the list after disposal so it cannot be disposed twice', () => {
    const a = { dispose: vi.fn() };
    const list = [a];
    disposeAll(list);
    expect(list.length).toBe(0);
    disposeAll(list);
    expect(a.dispose).toHaveBeenCalledTimes(1);
  });

  it('swallows errors thrown by dispose() and continues to the next entry', () => {
    const a = { dispose: vi.fn(() => { throw new Error('already disposed'); }) };
    const b = { dispose: vi.fn() };
    const list = [a, b];
    expect(() => disposeAll(list)).not.toThrow();
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(b.dispose).toHaveBeenCalledTimes(1);
    expect(list.length).toBe(0);
  });

  it('is a no-op when list is undefined', () => {
    expect(() => disposeAll(undefined)).not.toThrow();
  });

  it('is a no-op when list is empty', () => {
    const list: Array<{ dispose: () => void }> = [];
    expect(() => disposeAll(list)).not.toThrow();
    expect(list.length).toBe(0);
  });
});
