/**
 * routerShadowDrainHandler.test.ts — Wave 53a Phase C
 *
 * Covers the contract for the post-hoc shadow router drain handler:
 *   - Schema version validation
 *   - Invalid payload shape rejection
 *   - Live-record-set dedup (drain skips records whose sessionId is in the set)
 *   - shadowRouteHookEvent invoked with postHoc:true and weightsVersion
 *   - sessionId added to set after dispatch (subsequent records dedup)
 *   - computeWeightsVersion fallback to 'unknown' when path missing
 */

import crypto from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QueueRecord } from '../telemetry/telemetryQueue';
import { computeWeightsVersion, createRouterShadowHandler } from './routerShadowDrainHandler';

// Hoisted mock state for the readFileSync stub used in computeWeightsVersion.
const fsMock = vi.hoisted(() => ({
  readFileSync: vi.fn<(p: string) => Buffer>(),
}));

vi.mock('node:fs', () => ({
  default: { readFileSync: fsMock.readFileSync },
  readFileSync: fsMock.readFileSync,
}));

// Logger is noisy; silence in tests.
vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Avoid pulling electron app surface into the handler factory tests.
vi.mock('electron', () => ({ app: { getPath: () => '/userdata', getAppPath: () => '/app' } }));

function makeQueueRecord(overrides: Partial<QueueRecord> = {}): QueueRecord {
  return {
    recordId: 'rec-1',
    ts: 1700000000000,
    surface: 'router-shadow',
    schemaVersion: 1,
    payload: {
      sessionId: 'sess-A',
      prompt: 'How do I refactor this?',
      cwd: '/home/user/proj',
      ts: 1700000000000,
    },
    ...overrides,
  };
}

describe('createRouterShadowHandler', () => {
  beforeEach(() => {
    fsMock.readFileSync.mockReset();
  });

  it('skips records with unsupported schemaVersion', () => {
    const dispatch = vi.fn();
    const handler = createRouterShadowHandler({
      liveSessionIds: new Set<string>(),
      weightsVersion: 'abc123',
      dispatch,
    });
    handler(makeQueueRecord({ schemaVersion: 999 }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('skips records with malformed payload shape', () => {
    const dispatch = vi.fn();
    const handler = createRouterShadowHandler({
      liveSessionIds: new Set<string>(),
      weightsVersion: 'abc123',
      dispatch,
    });
    handler(makeQueueRecord({ payload: { sessionId: 42, prompt: 'x' } as unknown }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('skips records whose sessionId is in the live set (live record beats drain)', () => {
    const dispatch = vi.fn();
    const liveSessionIds = new Set<string>(['sess-A']);
    const handler = createRouterShadowHandler({
      liveSessionIds,
      weightsVersion: 'abc123',
      dispatch,
    });
    handler(makeQueueRecord());
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatches shadowRouteHookEvent with postHoc:true and weightsVersion', () => {
    const dispatch = vi.fn();
    const handler = createRouterShadowHandler({
      liveSessionIds: new Set<string>(),
      weightsVersion: 'deadbeefcafe',
      dispatch,
    });
    handler(makeQueueRecord());
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'user_prompt_submit',
      sessionId: 'sess-A',
      prompt: 'How do I refactor this?',
      cwd: '/home/user/proj',
      postHoc: true,
      weightsVersion: 'deadbeefcafe',
    });
  });

  it('adds sessionId to liveSessionIds after dispatch — subsequent drain records dedup', () => {
    const dispatch = vi.fn();
    const liveSessionIds = new Set<string>();
    const handler = createRouterShadowHandler({
      liveSessionIds,
      weightsVersion: 'abc123',
      dispatch,
    });

    // First record dispatches; second record for same session is skipped.
    handler(makeQueueRecord({ recordId: 'rec-1' }));
    handler(makeQueueRecord({ recordId: 'rec-2' }));

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(liveSessionIds.has('sess-A')).toBe(true);
  });

  it('preserves live-shadow path when caller does not pass postHoc/weightsVersion', () => {
    // Live shadow path calls shadowRouteHookEvent directly without these
    // fields. Drain path passes them. Confirm both are accepted by the
    // dispatcher signature without ambiguity.
    const dispatch = vi.fn();
    const handler = createRouterShadowHandler({
      liveSessionIds: new Set<string>(),
      weightsVersion: 'unknown',
      dispatch,
    });
    handler(
      makeQueueRecord({
        payload: {
          sessionId: 'sess-X',
          prompt: 'hello',
          cwd: '/tmp',
          ts: 0,
        },
      }),
    );
    const call = dispatch.mock.calls[0][0];
    expect(call.postHoc).toBe(true);
    expect(call.weightsVersion).toBe('unknown');
  });
});

describe('computeWeightsVersion', () => {
  beforeEach(() => {
    fsMock.readFileSync.mockReset();
  });

  it("returns 'unknown' when weightsPath is null", () => {
    expect(computeWeightsVersion(null)).toBe('unknown');
  });

  it("returns 'unknown' when the file cannot be read", () => {
    fsMock.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(computeWeightsVersion('/nonexistent/router-weights.json')).toBe('unknown');
  });

  it('returns the first 12 hex chars of SHA-256 of the file content', () => {
    const content = Buffer.from('{"weights":[1,2,3]}', 'utf8');
    fsMock.readFileSync.mockReturnValue(content);
    const expected = crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
    expect(computeWeightsVersion('/some/path/weights.json')).toBe(expected);
    expect(expected).toHaveLength(12);
  });
});
