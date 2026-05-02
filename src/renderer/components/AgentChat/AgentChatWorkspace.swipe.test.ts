import { describe, expect, it } from 'vitest';

import { cycleThread } from './AgentChatWorkspace.swipe';

const makeThread = (id: string) => ({ id } as Parameters<typeof cycleThread>[0][number]);

describe('cycleThread', () => {
  const threads = [makeThread('a'), makeThread('b'), makeThread('c')];

  it('returns null when fewer than 2 threads', () => {
    expect(cycleThread([makeThread('a')], 'a', 'left')).toBeNull();
    expect(cycleThread([], null, 'right')).toBeNull();
  });

  it('swipe left advances to next thread', () => {
    expect(cycleThread(threads, 'a', 'left')).toBe('b');
    expect(cycleThread(threads, 'b', 'left')).toBe('c');
  });

  it('swipe left wraps from last to first', () => {
    expect(cycleThread(threads, 'c', 'left')).toBe('a');
  });

  it('swipe right retreats to previous thread', () => {
    expect(cycleThread(threads, 'c', 'right')).toBe('b');
    expect(cycleThread(threads, 'b', 'right')).toBe('a');
  });

  it('swipe right wraps from first to last', () => {
    expect(cycleThread(threads, 'a', 'right')).toBe('c');
  });

  it('falls back to index 0 when activeThreadId not found', () => {
    expect(cycleThread(threads, 'unknown', 'left')).toBe('b');
    expect(cycleThread(threads, null, 'right')).toBe('c');
  });
});
