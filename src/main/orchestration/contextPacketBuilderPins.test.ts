/**
 * contextPacketBuilderPins.test.ts — Unit tests for pinned context injection
 * (Wave 25 Phase D).
 *
 * Mocks pinnedContextStore so tests run without an initialised sessionStore.
 */

// ─── Mock pinnedContextStore ──────────────────────────────────────────────────
import type { PinnedContextItem } from '@shared/types/pinnedContext';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockList = vi.fn<(sessionId: string) => PinnedContextItem[]>(() => []);

vi.mock('./pinnedContextStore', () => ({
  getPinnedContextStore: () => ({ list: mockList }),
}));

import { injectPinnedContext } from './contextPacketBuilderPins';
import type { ContextBudgetSummary, ContextPacket } from './types';

// ─── Factories ────────────────────────────────────────────────────────────────

function makePacket(overrides: Partial<ContextPacket> = {}): ContextPacket {
  return {
    version: 1,
    id: 'pkt-1',
    createdAt: Date.now(),
    task: { taskId: 't1', goal: 'test', mode: 'edit', provider: 'claude-code', verificationProfile: 'default' },
    repoFacts: {
      workspaceRoots: [],
      roots: [],
      gitDiff: { changedFiles: [], totalAdditions: 0, totalDeletions: 0, changedFileCount: 0, generatedAt: Date.now() },
      diagnostics: { files: [], totalErrors: 0, totalWarnings: 0, totalInfos: 0, totalHints: 0, generatedAt: Date.now() },
      recentEdits: { files: [], generatedAt: Date.now() },
    },
    liveIdeState: { selectedFiles: [], openFiles: [], dirtyFiles: [], dirtyBuffers: [], collectedAt: Date.now() },
    files: [],
    omittedCandidates: [],
    budget: makeBudget(),
    ...overrides,
  };
}

function makeBudget(overrides: Partial<ContextBudgetSummary> = {}): ContextBudgetSummary {
  return {
    estimatedBytes: 0,
    estimatedTokens: 0,
    droppedContentNotes: [],
    ...overrides,
  };
}

function makePin(overrides: Partial<PinnedContextItem> = {}): PinnedContextItem {
  return {
    id: 'pin-1',
    type: 'research-artifact',
    source: 'react',
    title: 'React Hooks',
    content: 'Use useState for local state.',
    tokens: 10,
    addedAt: Date.now(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('injectPinnedContext', () => {
  beforeEach(() => {
    mockList.mockReset();
    mockList.mockReturnValue([]);
  });

  it('returns the original packet unchanged when there are no pins', () => {
    const packet = makePacket();
    const budget = makeBudget();
    const result = injectPinnedContext(packet, 'sess-1', budget);
    expect(result).toBe(packet); // same reference — no mutation
    expect(result.pinnedContext).toBeUndefined();
  });

  it('injects a pinnedContext string when pins are present', () => {
    mockList.mockReturnValue([makePin()]);
    const packet = makePacket();
    const budget = makeBudget();
    const result = injectPinnedContext(packet, 'sess-1', budget);
    expect(result).not.toBe(packet); // new object
    expect(typeof result.pinnedContext).toBe('string');
    expect(result.pinnedContext).toContain('=== [Pin: React Hooks] ===');
    expect(result.pinnedContext).toContain('Use useState for local state.');
  });

  it('does not mutate the original packet', () => {
    mockList.mockReturnValue([makePin()]);
    const packet = makePacket();
    const budget = makeBudget();
    injectPinnedContext(packet, 'sess-1', budget);
    expect(packet.pinnedContext).toBeUndefined();
  });

  it('charges token cost against the budget', () => {
    mockList.mockReturnValue([makePin({ tokens: 15 })]);
    const budget = makeBudget({ estimatedTokens: 100 });
    injectPinnedContext(makePacket(), 'sess-1', budget);
    expect(budget.estimatedTokens).toBe(115);
  });

  it('falls back to chars/4 token estimate when pin.tokens is 0', () => {
    const content = 'a'.repeat(400); // 400 chars → 100 tokens
    mockList.mockReturnValue([makePin({ tokens: 0, content })]);
    const budget = makeBudget({ estimatedTokens: 0 });
    injectPinnedContext(makePacket(), 'sess-1', budget);
    // rendered = "=== [Pin: React Hooks] ===\n<content>\n" — chars/4, at least > 0
    expect(budget.estimatedTokens).toBeGreaterThan(0);
  });

  it('skips a pin that would exceed the token limit and records a dropped note', () => {
    mockList.mockReturnValue([makePin({ tokens: 500 })]);
    const budget = makeBudget({ estimatedTokens: 900, tokenLimit: 1000 });
    const result = injectPinnedContext(makePacket(), 'sess-1', budget);
    expect(result.pinnedContext).toBeUndefined();
    expect(budget.droppedContentNotes.length).toBeGreaterThan(0);
    expect(budget.estimatedTokens).toBe(900); // unchanged
  });

  it('injects multiple pins as concatenated sections', () => {
    mockList.mockReturnValue([
      makePin({ id: 'p1', title: 'Pin A', content: 'Content A', tokens: 5 }),
      makePin({ id: 'p2', title: 'Pin B', content: 'Content B', tokens: 5 }),
    ]);
    const budget = makeBudget();
    const result = injectPinnedContext(makePacket(), 'sess-1', budget);
    expect(result.pinnedContext).toContain('Pin A');
    expect(result.pinnedContext).toContain('Pin B');
    expect(budget.estimatedTokens).toBe(10);
  });

  it('passes the correct sessionId to the store list call', () => {
    injectPinnedContext(makePacket(), 'my-session', makeBudget());
    expect(mockList).toHaveBeenCalledWith('my-session');
  });
});
