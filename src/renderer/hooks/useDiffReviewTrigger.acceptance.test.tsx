/**
 * Wave 94 Phase E — orchestrator-owned acceptance test for the diff-review
 * producer wiring.
 *
 * AUTHORED BY THE ORCHESTRATOR. The Phase E implementer (subagent) MAY NOT
 * modify this file. The implementer's job is to make this test pass without
 * altering its assertions. Permitted orchestrator modifications during phase
 * execution: (a) un-skip the describe at phase start; (b) additive mock-surface
 * extension if a Phase 0 oversight is discovered.
 *
 * Status: shipped as describe.skip(...) so commits between now and Phase E
 * dispatch stay green. Orchestrator un-skips at Phase E dispatch.
 *
 * Acceptance criteria (the contract that bites):
 *
 *  1. When a write-class tool (`Write` | `Edit` | `MultiEdit`) completes in a
 *     terminal Claude session AND the corresponding pre/post_tool_use main-tap
 *     fires a synthetic `diff_review_ready` agent-event with shape
 *     { type: 'diff_review_ready', sessionId, snapshotHash, projectRoot, filePaths },
 *     the renderer hook `useDiffReviewTrigger()` calls
 *     `useDiffReview().openReview(sessionId, snapshotHash, projectRoot, filePaths)`
 *     EXACTLY ONCE with the unmodified shape from the event.
 *
 *  2. When the setting `enableTerminalDiffReview === false`, the same event
 *     MUST NOT trigger openReview (gate per ADR Decision 3 — 3b with default true).
 *
 *  3. When the sessionId on the event is not owned by this renderer window
 *     (i.e., not present in the per-window terminal-session set the renderer
 *     tracks), openReview MUST NOT be called. This prevents cross-window
 *     duplicate-open of the diff review.
 *
 *  4. Non-matching event types (anything other than 'diff_review_ready') MUST
 *     NOT call openReview.
 *
 * Spec sources:
 *   - roadmap/wave-94-chat-workbench-completion/waveplan-94.md (Phase E)
 *   - roadmap/wave-94-chat-workbench-completion/wave-94-decisions.md (Decision 3)
 *   - ~/.claude/rules/orchestrator-owned-acceptance-tests.md
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Module-under-test path is asserted by Phase E. The implementer creates this file.
import type {} from '../types/electron-agent-events';

// ── Mock surfaces (orchestrator-authored — implementer may not alter assertions) ──

const openReviewSpy = vi.fn();
const onAgentEventListeners: Array<(event: unknown) => void> = [];
const unsubscribeSpy = vi.fn();

vi.mock('../components/AgentChat/useDiffReview', () => ({
  useDiffReview: () => ({
    openReview: openReviewSpy,
    closeReview: vi.fn(),
    state: null,
  }),
}));

vi.mock('../components/DiffReview/DiffReviewManager', () => ({
  useDiffReview: () => ({
    openReview: openReviewSpy,
    closeReview: vi.fn(),
    state: null,
  }),
  DiffReviewProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Settings-gate mock. The implementer wires `enableTerminalDiffReview` from
// ClaudeCliSettings (ADR Decision 3). The hook MUST read it through whatever
// settings surface is available; this mock proxies a mutable value.
let enableTerminalDiffReview = true;
vi.mock('../hooks/useClaudeCliSettings', () => ({
  useClaudeCliSettings: () => ({
    enableTerminalDiffReview,
    // additive mock-surface extension permitted if Phase E discovers other
    // fields the hook reads from this settings surface.
  }),
}));

// Per-window owned session set. Implementer wires from useTerminalSessions /
// useProjectTerminals (Wave 94 Phase B) — whichever surface tracks
// "sessions this window owns". Mock returns a controllable set.
let ownedSessionIds = new Set<string>(['session-A']);
vi.mock('../hooks/useOwnedSessionIds', () => ({
  useOwnedSessionIds: () => ownedSessionIds,
}));

// IPC seam: `window.electronAPI.hooks.onAgentEvent(cb)` is the existing
// pattern (see src/renderer/hooks/useTerminalSessions.sync.ts:213). The
// implementer's main-tap (hooksDiffReview.ts) must emit the synthetic event
// through this channel so the renderer hook receives it via the same API.
function installIpcMock(): void {
  (globalThis as unknown as { window: Window }).window =
    (globalThis as unknown as { window?: Window }).window ?? ({} as Window);
  const w = (globalThis as unknown as { window: Record<string, unknown> }).window;
  w.electronAPI = {
    hooks: {
      onAgentEvent: (cb: (event: unknown) => void) => {
        onAgentEventListeners.push(cb);
        return unsubscribeSpy;
      },
    },
  } as unknown;
}

function fireAgentEvent(event: unknown): void {
  act(() => {
    for (const listener of onAgentEventListeners) listener(event);
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe.skip('Wave 94 Phase E — diff-review producer acceptance', () => {
  beforeEach(() => {
    openReviewSpy.mockReset();
    unsubscribeSpy.mockReset();
    onAgentEventListeners.length = 0;
    enableTerminalDiffReview = true;
    ownedSessionIds = new Set<string>(['session-A']);
    installIpcMock();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('Criterion 1 — diff_review_ready event triggers openReview with exact event shape', async () => {
    const { useDiffReviewTrigger } = await import('./useDiffReviewTrigger');
    renderHook(() => useDiffReviewTrigger());

    fireAgentEvent({
      type: 'diff_review_ready',
      sessionId: 'session-A',
      snapshotHash: 'abc123',
      projectRoot: 'C:/Web App/Agent IDE',
      filePaths: ['src/foo.ts', 'src/bar.ts'],
    });

    expect(openReviewSpy).toHaveBeenCalledTimes(1);
    expect(openReviewSpy).toHaveBeenCalledWith(
      'session-A',
      'abc123',
      'C:/Web App/Agent IDE',
      ['src/foo.ts', 'src/bar.ts'],
    );
  });

  it('Criterion 2 — settings gate (enableTerminalDiffReview = false) blocks openReview', async () => {
    enableTerminalDiffReview = false;
    const { useDiffReviewTrigger } = await import('./useDiffReviewTrigger');
    renderHook(() => useDiffReviewTrigger());

    fireAgentEvent({
      type: 'diff_review_ready',
      sessionId: 'session-A',
      snapshotHash: 'abc123',
      projectRoot: 'C:/Web App/Agent IDE',
      filePaths: ['src/foo.ts'],
    });

    expect(openReviewSpy).not.toHaveBeenCalled();
  });

  it('Criterion 3 — cross-window event (non-owned sessionId) does not trigger openReview', async () => {
    ownedSessionIds = new Set<string>(['session-A']); // window owns A
    const { useDiffReviewTrigger } = await import('./useDiffReviewTrigger');
    renderHook(() => useDiffReviewTrigger());

    fireAgentEvent({
      type: 'diff_review_ready',
      sessionId: 'session-B', // different window's session
      snapshotHash: 'abc123',
      projectRoot: 'C:/Web App/Agent IDE',
      filePaths: ['src/foo.ts'],
    });

    expect(openReviewSpy).not.toHaveBeenCalled();
  });

  it('Criterion 4 — unrelated agent event types do not trigger openReview', async () => {
    const { useDiffReviewTrigger } = await import('./useDiffReviewTrigger');
    renderHook(() => useDiffReviewTrigger());

    fireAgentEvent({ type: 'session_started', sessionId: 'session-A' });
    fireAgentEvent({ type: 'post_tool_use', sessionId: 'session-A', toolName: 'Read' });

    expect(openReviewSpy).not.toHaveBeenCalled();
  });

  it('Criterion 1 (regression) — multiple consecutive events each fire openReview once', async () => {
    const { useDiffReviewTrigger } = await import('./useDiffReviewTrigger');
    renderHook(() => useDiffReviewTrigger());

    fireAgentEvent({
      type: 'diff_review_ready',
      sessionId: 'session-A',
      snapshotHash: 'hash1',
      projectRoot: '/proj',
      filePaths: ['a.ts'],
    });
    fireAgentEvent({
      type: 'diff_review_ready',
      sessionId: 'session-A',
      snapshotHash: 'hash2',
      projectRoot: '/proj',
      filePaths: ['b.ts'],
    });

    expect(openReviewSpy).toHaveBeenCalledTimes(2);
    expect(openReviewSpy).toHaveBeenNthCalledWith(1, 'session-A', 'hash1', '/proj', ['a.ts']);
    expect(openReviewSpy).toHaveBeenNthCalledWith(2, 'session-A', 'hash2', '/proj', ['b.ts']);
  });
});
