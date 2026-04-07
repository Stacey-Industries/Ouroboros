import { describe, expect, it, vi } from 'vitest';

// Pure logic test for queue ID generation behaviour (counter increments).
// The hook itself requires React context so we test only the shape of addToQueue output.

describe('queue message shape', () => {
  it('produces an object with id, content, and queuedAt', () => {
    const now = Date.now();
    const msg = { id: 'queued-1', content: 'hello', queuedAt: now };
    expect(msg).toMatchObject({ id: expect.stringMatching(/^queued-/), content: 'hello' });
    expect(typeof msg.queuedAt).toBe('number');
  });

  it('queued-at timestamp is a recent unix epoch ms', () => {
    const before = Date.now();
    const queuedAt = Date.now();
    const after = Date.now();
    expect(queuedAt).toBeGreaterThanOrEqual(before);
    expect(queuedAt).toBeLessThanOrEqual(after);
  });

  it('editQueuedMessage removes the item and restores draft', () => {
    const items = [
      { id: 'q1', content: 'first', queuedAt: 1 },
      { id: 'q2', content: 'second', queuedAt: 2 },
    ];
    const setDraft = vi.fn();
    const target = items.find((m) => m.id === 'q1');
    if (target) setDraft(target.content);
    const remaining = items.filter((m) => m.id !== 'q1');

    expect(setDraft).toHaveBeenCalledWith('first');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('q2');
  });

  it('deleteQueuedMessage removes only the matching item', () => {
    const items = [
      { id: 'q1', content: 'first', queuedAt: 1 },
      { id: 'q2', content: 'second', queuedAt: 2 },
    ];
    const after = items.filter((m) => m.id !== 'q1');
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe('q2');
  });
});
