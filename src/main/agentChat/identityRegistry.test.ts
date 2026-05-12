/**
 * identityRegistry.test.ts — Unit tests for IdentityRegistry.
 *
 * Coverage:
 * - registerTurn / getActiveTurn happy path
 * - assignProviderSession happy path + idempotent no-op
 * - assignProviderSession throws on duplicate-different-value
 * - retireTurn clears active turn
 * - threadIdForTurn: happy path + throw on miss
 * - threadIdForProviderSession: happy path + throw on miss
 * - getProviderSession forward lookup
 */

import type { ProviderSessionId, ThreadId, TurnId } from '@shared/types/canonicalChatEvent';
import { describe, expect, it, vi } from 'vitest';

import type { AliasRow } from './chatPersistenceLayer';
import { ChatStateError } from './chatStateError';
import { IdentityRegistry } from './identityRegistry';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const T1 = 'thread-1' as ThreadId;
const T2 = 'thread-2' as ThreadId;
const TURN1 = 'turn-1' as TurnId;
const TURN2 = 'turn-2' as TurnId;
const PSID1 = 'psid-1' as ProviderSessionId;
const PSID2 = 'psid-2' as ProviderSessionId;

function fresh(): IdentityRegistry {
  return new IdentityRegistry();
}

// ─── registerTurn ─────────────────────────────────────────────────────────────

describe('registerTurn', () => {
  it('makes the turn the active turn for the thread', () => {
    const reg = fresh();
    reg.registerTurn(T1, TURN1);
    expect(reg.getActiveTurn(T1)).toBe(TURN1);
  });

  it('replacing active turn updates the active pointer', () => {
    const reg = fresh();
    reg.registerTurn(T1, TURN1);
    reg.registerTurn(T1, TURN2);
    expect(reg.getActiveTurn(T1)).toBe(TURN2);
  });

  it('two threads track independently', () => {
    const reg = fresh();
    reg.registerTurn(T1, TURN1);
    reg.registerTurn(T2, TURN2);
    expect(reg.getActiveTurn(T1)).toBe(TURN1);
    expect(reg.getActiveTurn(T2)).toBe(TURN2);
  });
});

// ─── assignProviderSession ────────────────────────────────────────────────────

describe('assignProviderSession', () => {
  it('happy path: assigns PSID and makes it resolvable', () => {
    const reg = fresh();
    reg.registerTurn(T1, TURN1);
    reg.assignProviderSession(TURN1, PSID1);
    expect(reg.getProviderSession(T1)).toBe(PSID1);
  });

  it('idempotent: second call with same value is a no-op (no throw)', () => {
    const reg = fresh();
    reg.registerTurn(T1, TURN1);
    reg.assignProviderSession(TURN1, PSID1);
    expect(() => reg.assignProviderSession(TURN1, PSID1)).not.toThrow();
    expect(reg.getProviderSession(T1)).toBe(PSID1);
  });

  it('throws duplicate-provider-session-assignment on second call with different PSID', () => {
    const reg = fresh();
    reg.registerTurn(T1, TURN1);
    reg.assignProviderSession(TURN1, PSID1);
    expect(() => reg.assignProviderSession(TURN1, PSID2)).toThrow(ChatStateError);

    let caught: ChatStateError | undefined;
    try {
      reg.assignProviderSession(TURN1, PSID2);
    } catch (e) {
      caught = e as ChatStateError;
    }
    expect(caught?.kind).toBe('duplicate-provider-session-assignment');
  });

  it('throws unknown-turn when turnId was never registered', () => {
    const reg = fresh();
    let caught: ChatStateError | undefined;
    try {
      reg.assignProviderSession(TURN1, PSID1);
    } catch (e) {
      caught = e as ChatStateError;
    }
    expect(caught).toBeInstanceOf(ChatStateError);
    expect(caught?.kind).toBe('unknown-turn');
  });
});

// ─── retireTurn ──────────────────────────────────────────────────────────────

describe('retireTurn', () => {
  it('clears the active turn for the thread', () => {
    const reg = fresh();
    reg.registerTurn(T1, TURN1);
    reg.retireTurn(TURN1);
    expect(reg.getActiveTurn(T1)).toBeUndefined();
  });

  it('does not throw when called with unknown turnId', () => {
    const reg = fresh();
    expect(() => reg.retireTurn(TURN1)).not.toThrow();
  });

  it('does not clear active turn if a newer turn is already registered', () => {
    const reg = fresh();
    reg.registerTurn(T1, TURN1);
    reg.registerTurn(T1, TURN2); // TURN2 is now active
    reg.retireTurn(TURN1); // retiring old turn should not clear TURN2
    expect(reg.getActiveTurn(T1)).toBe(TURN2);
  });
});

// ─── threadIdForTurn ──────────────────────────────────────────────────────────

describe('threadIdForTurn', () => {
  it('returns the threadId for a registered turn', () => {
    const reg = fresh();
    reg.registerTurn(T1, TURN1);
    expect(reg.threadIdForTurn(TURN1)).toBe(T1);
  });

  it('still resolves after the turn is retired', () => {
    // Retire does not remove the record — events may arrive after completion.
    const reg = fresh();
    reg.registerTurn(T1, TURN1);
    reg.retireTurn(TURN1);
    expect(reg.threadIdForTurn(TURN1)).toBe(T1);
  });

  it('throws unknown-turn on miss', () => {
    const reg = fresh();
    let caught: ChatStateError | undefined;
    try {
      reg.threadIdForTurn(TURN1);
    } catch (e) {
      caught = e as ChatStateError;
    }
    expect(caught).toBeInstanceOf(ChatStateError);
    expect(caught?.kind).toBe('unknown-turn');
  });
});

// ─── threadIdForProviderSession ───────────────────────────────────────────────

describe('threadIdForProviderSession', () => {
  it('returns the threadId after PSID is assigned', () => {
    const reg = fresh();
    reg.registerTurn(T1, TURN1);
    reg.assignProviderSession(TURN1, PSID1);
    expect(reg.threadIdForProviderSession(PSID1)).toBe(T1);
  });

  it('throws unknown-provider-session when PSID was never assigned', () => {
    const reg = fresh();
    let caught: ChatStateError | undefined;
    try {
      reg.threadIdForProviderSession(PSID1);
    } catch (e) {
      caught = e as ChatStateError;
    }
    expect(caught).toBeInstanceOf(ChatStateError);
    expect(caught?.kind).toBe('unknown-provider-session');
  });

  it('resolves even after turn is retired', () => {
    // PSID → thread mapping persists; needed for late-arriving hook events.
    const reg = fresh();
    reg.registerTurn(T1, TURN1);
    reg.assignProviderSession(TURN1, PSID1);
    reg.retireTurn(TURN1);
    expect(reg.threadIdForProviderSession(PSID1)).toBe(T1);
  });
});

// ─── rebuildFromSQLite ────────────────────────────────────────────────────────

/** Minimal ChatPersistenceLayer mock — only loadAliases is needed here. */
function mockPersistence(
  aliases: AliasRow[],
): import('./chatPersistenceLayer').ChatPersistenceLayer {
  return {
    loadAliases: vi.fn().mockReturnValue(aliases),
    insertAlias: vi.fn(),
    assignProviderSessionToAlias: vi.fn(),
    retireAlias: vi.fn(),
    setLastProviderSession: vi.fn(),
    setLastInterruptedAt: vi.fn(),
    appendCanonicalEventLog: vi.fn(),
  } as unknown as import('./chatPersistenceLayer').ChatPersistenceLayer;
}

describe('rebuildFromSQLite', () => {
  it('populates forward lookups from non-retired aliases', () => {
    const reg = fresh();
    const persistence = mockPersistence([
      { threadId: T1, turnId: TURN1, providerSessionId: PSID1, createdAt: 100, retiredAt: null },
    ]);
    reg.rebuildFromSQLite(persistence);
    expect(reg.getActiveTurn(T1)).toBe(TURN1);
    expect(reg.getProviderSession(T1)).toBe(PSID1);
  });

  it('populates reverse lookup threadIdForTurn for retired aliases', () => {
    const reg = fresh();
    const persistence = mockPersistence([
      { threadId: T1, turnId: TURN1, providerSessionId: PSID1, createdAt: 100, retiredAt: 200 },
    ]);
    reg.rebuildFromSQLite(persistence);
    // Retired turn: reverse lookup must still work for late-arriving events.
    expect(reg.threadIdForTurn(TURN1)).toBe(T1);
    // But it must NOT be the active turn.
    expect(reg.getActiveTurn(T1)).toBeUndefined();
  });

  it('populates reverse lookup threadIdForProviderSession for retired aliases', () => {
    const reg = fresh();
    const persistence = mockPersistence([
      { threadId: T1, turnId: TURN1, providerSessionId: PSID1, createdAt: 100, retiredAt: 200 },
    ]);
    reg.rebuildFromSQLite(persistence);
    expect(reg.threadIdForProviderSession(PSID1)).toBe(T1);
  });

  it('handles aliases without a PSID (providerSessionId undefined)', () => {
    const reg = fresh();
    const persistence = mockPersistence([
      {
        threadId: T1,
        turnId: TURN1,
        providerSessionId: undefined,
        createdAt: 100,
        retiredAt: null,
      },
    ]);
    reg.rebuildFromSQLite(persistence);
    expect(reg.getActiveTurn(T1)).toBe(TURN1);
    expect(reg.getProviderSession(T1)).toBeUndefined();
  });

  it('is idempotent — calling twice produces the same final state', () => {
    const reg = fresh();
    const aliases: AliasRow[] = [
      { threadId: T1, turnId: TURN1, providerSessionId: PSID1, createdAt: 100, retiredAt: null },
    ];
    const persistence = mockPersistence(aliases);
    reg.rebuildFromSQLite(persistence);
    reg.rebuildFromSQLite(persistence);
    expect(reg.getActiveTurn(T1)).toBe(TURN1);
  });

  it('resets prior in-memory state on rebuild', () => {
    const reg = fresh();
    // Register a turn manually before rebuild.
    reg.registerTurn(T2, TURN2);
    expect(reg.getActiveTurn(T2)).toBe(TURN2);

    // Rebuild with aliases that only contain T1/TURN1.
    const persistence = mockPersistence([
      { threadId: T1, turnId: TURN1, providerSessionId: PSID1, createdAt: 100, retiredAt: null },
    ]);
    reg.rebuildFromSQLite(persistence);

    // T2/TURN2 should be gone after reset.
    expect(reg.getActiveTurn(T2)).toBeUndefined();
    expect(() => reg.threadIdForTurn(TURN2)).toThrow(ChatStateError);
  });

  it('handles empty alias list without error', () => {
    const reg = fresh();
    const persistence = mockPersistence([]);
    expect(() => reg.rebuildFromSQLite(persistence)).not.toThrow();
    expect(reg.getActiveTurn(T1)).toBeUndefined();
  });

  it('last non-retired alias wins when multiple non-retired rows exist for same thread', () => {
    // loadAliases is ordered by created_at ASC — second row should win.
    const reg = fresh();
    const persistence = mockPersistence([
      { threadId: T1, turnId: TURN1, providerSessionId: PSID1, createdAt: 100, retiredAt: null },
      { threadId: T1, turnId: TURN2, providerSessionId: PSID2, createdAt: 200, retiredAt: null },
    ]);
    reg.rebuildFromSQLite(persistence);
    expect(reg.getActiveTurn(T1)).toBe(TURN2);
    // Both turns' reverse lookups must still work.
    expect(reg.threadIdForTurn(TURN1)).toBe(T1);
    expect(reg.threadIdForTurn(TURN2)).toBe(T1);
  });
});
