/**
 * messageReactions.test.ts — unit tests for Wave 22 Phase A reaction helpers.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { Reaction } from '@shared/types/agentChat';
import {
  addReaction,
  addReactionToList,
  getReactions,
  removeReaction,
  removeReactionFromList,
  type ReactionStore,
} from './messageReactions';

// ── Stub store ────────────────────────────────────────────────────────────────

function makeStore(initial: Reaction[] = []): ReactionStore & { data: Reaction[] } {
  const store = {
    data: [...initial],
    async getMessageReactions(_id: string): Promise<Reaction[]> {
      return [...store.data];
    },
    async setMessageReactions(_id: string, reactions: Reaction[]): Promise<void> {
      store.data = [...reactions];
    },
  };
  return store;
}

// ── Pure helper tests ────────────────────────────────────────────────────────

describe('addReactionToList', () => {
  it('appends a new reaction', () => {
    const r: Reaction = { kind: '+1', at: 1000 };
    const result = addReactionToList([], r);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('+1');
  });

  it('is idempotent for same kind + by', () => {
    const r: Reaction = { kind: '+1', by: 'user1', at: 1000 };
    const list = addReactionToList([], r);
    const again = addReactionToList(list, { kind: '+1', by: 'user1', at: 2000 });
    expect(again).toHaveLength(1);
  });

  it('allows different kinds', () => {
    const list = addReactionToList(
      [{ kind: '+1', at: 1000 }],
      { kind: '-1', at: 2000 },
    );
    expect(list).toHaveLength(2);
  });

  it('allows same kind from different users', () => {
    const list = addReactionToList(
      [{ kind: '+1', by: 'user1', at: 1000 }],
      { kind: '+1', by: 'user2', at: 2000 },
    );
    expect(list).toHaveLength(2);
  });

  it('does not mutate the original array', () => {
    const original: Reaction[] = [{ kind: '+1', at: 1 }];
    addReactionToList(original, { kind: '-1', at: 2 });
    expect(original).toHaveLength(1);
  });
});

describe('removeReactionFromList', () => {
  it('removes a reaction by kind (no by — removes all)', () => {
    const list: Reaction[] = [
      { kind: '+1', by: 'user1', at: 1 },
      { kind: '+1', by: 'user2', at: 2 },
      { kind: '-1', by: 'user1', at: 3 },
    ];
    const result = removeReactionFromList(list, '+1', undefined);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('-1');
  });

  it('removes only the matching by when specified', () => {
    const list: Reaction[] = [
      { kind: '+1', by: 'user1', at: 1 },
      { kind: '+1', by: 'user2', at: 2 },
    ];
    const result = removeReactionFromList(list, '+1', 'user1');
    expect(result).toHaveLength(1);
    expect(result[0].by).toBe('user2');
  });

  it('returns same array when nothing matches', () => {
    const list: Reaction[] = [{ kind: '+1', at: 1 }];
    const result = removeReactionFromList(list, 'heart', undefined);
    expect(result).toHaveLength(1);
  });

  it('does not mutate the original array', () => {
    const original: Reaction[] = [{ kind: '+1', at: 1 }];
    removeReactionFromList(original, '+1', undefined);
    expect(original).toHaveLength(1);
  });
});

// ── Service function tests ────────────────────────────────────────────────────

describe('getReactions', () => {
  it('returns empty array for new message', async () => {
    const store = makeStore();
    const result = await getReactions(store, 'msg-1');
    expect(result).toEqual([]);
  });

  it('returns existing reactions', async () => {
    const store = makeStore([{ kind: '+1', at: 1000 }]);
    const result = await getReactions(store, 'msg-1');
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('+1');
  });
});

describe('addReaction', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
  });

  it('adds a +1 reaction', async () => {
    const result = await addReaction(store, 'msg-1', '+1');
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('+1');
    expect(result[0].at).toBeGreaterThan(0);
  });

  it('adds a -1 reaction', async () => {
    const result = await addReaction(store, 'msg-1', '-1', 'user1');
    expect(result[0].kind).toBe('-1');
    expect(result[0].by).toBe('user1');
  });

  it('persists via the store', async () => {
    await addReaction(store, 'msg-1', '+1');
    expect(store.data).toHaveLength(1);
  });

  it('is idempotent for same kind + by', async () => {
    await addReaction(store, 'msg-1', '+1', 'user1');
    const result = await addReaction(store, 'msg-1', '+1', 'user1');
    expect(result).toHaveLength(1);
  });

  it('returns updated list', async () => {
    await addReaction(store, 'msg-1', '+1', 'user1');
    const result = await addReaction(store, 'msg-1', '-1', 'user2');
    expect(result).toHaveLength(2);
  });
});

describe('removeReaction', () => {
  it('removes a reaction by kind', async () => {
    const store = makeStore([{ kind: '+1', by: 'user1', at: 1 }]);
    const result = await removeReaction(store, 'msg-1', '+1', 'user1');
    expect(result).toHaveLength(0);
  });

  it('persists the removal', async () => {
    const store = makeStore([{ kind: '+1', by: 'user1', at: 1 }]);
    await removeReaction(store, 'msg-1', '+1', 'user1');
    expect(store.data).toHaveLength(0);
  });

  it('leaves unrelated reactions intact', async () => {
    const store = makeStore([
      { kind: '+1', by: 'user1', at: 1 },
      { kind: '-1', by: 'user1', at: 2 },
    ]);
    const result = await removeReaction(store, 'msg-1', '+1', 'user1');
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('-1');
  });

  it('is a no-op when kind does not exist', async () => {
    const store = makeStore([{ kind: '+1', at: 1 }]);
    const result = await removeReaction(store, 'msg-1', 'heart');
    expect(result).toHaveLength(1);
  });
});
