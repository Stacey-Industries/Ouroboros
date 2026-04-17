/**
 * researchSubagent.test.ts — Unit tests for runResearch.
 *
 * The `claude` CLI is never actually spawned — all spawn calls go through the
 * `deps.spawnFn` injection point so tests remain hermetic.
 */

import type { ResearchArtifact } from '@shared/types/research';
import { EventEmitter } from 'events';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetResearchCacheForTests } from './researchCache';
import { runResearch } from './researchSubagent';

// ─── Telemetry mock ───────────────────────────────────────────────────────────

const mockRecordInvocation = vi.fn();

vi.mock('../telemetry/telemetryStore', () => ({
  getTelemetryStore: () => ({ recordInvocation: mockRecordInvocation }),
}));

// ─── Spawn mock helpers ───────────────────────────────────────────────────────

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
}

function makeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: vi.fn((_d, _e, cb) => { if (cb) cb(); }), end: vi.fn() };
  child.kill = vi.fn();
  return child;
}

/** Returns a spawnFn that emits `output` on stdout and exits 0. */
function spawnSuccess(output: string): { spawnFn: typeof import('child_process').spawn; child: FakeChild } {
  const child = makeChild();
  const spawnFn = vi.fn(() => {
    setImmediate(() => {
      child.stdout.emit('data', Buffer.from(output));
      child.emit('close', 0);
    });
    return child;
  }) as unknown as typeof import('child_process').spawn;
  return { spawnFn, child };
}

/** Returns a spawnFn that exits with code 1 and an error message on stderr. */
function spawnFailure(stderr = 'some error'): typeof import('child_process').spawn {
  const child = makeChild();
  return vi.fn(() => {
    setImmediate(() => {
      child.stderr.emit('data', Buffer.from(stderr));
      child.emit('close', 1);
    });
    return child;
  }) as unknown as typeof import('child_process').spawn;
}

/** Returns a spawnFn that never calls close (simulates hang/timeout). */
function spawnHang(): typeof import('child_process').spawn {
  const child = makeChild();
  return vi.fn(() => child) as unknown as typeof import('child_process').spawn;
}

// ─── Shared test deps ─────────────────────────────────────────────────────────

function tmpPath(): string {
  return path.join(os.tmpdir(), `rs-test-${Date.now()}-${Math.random()}`);
}

function baseDeps(spawnFn: typeof import('child_process').spawn) {
  return { spawnFn, platform: 'linux', userDataPath: tmpPath() };
}

const VALID_JSON: ResearchArtifact = {
  id: 'ignored',
  topic: 'app router',
  library: 'next',
  version: '15.2.0',
  sources: [{ url: 'https://nextjs.org', title: 'Next.js Docs' }],
  summary: 'Use Server Components for data fetching.',
  relevantSnippets: [{ content: 'async function Page() {}', source: 'nextjs.org' }],
  confidenceHint: 'high',
  correlationId: 'ignored',
  createdAt: 0,
  cached: false,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => { resetResearchCacheForTests(); mockRecordInvocation.mockClear(); });
afterEach(() => { resetResearchCacheForTests(); vi.useRealTimers(); });

describe('runResearch — successful spawn', () => {
  it('returns an artifact with the correct topic', async () => {
    const { spawnFn } = spawnSuccess(JSON.stringify(VALID_JSON));
    const result = await runResearch(
      { topic: 'app router', library: 'next', version: '15.2.0' },
      baseDeps(spawnFn),
    );
    expect(result.topic).toBe('app router');
    expect(result.confidenceHint).toBe('high');
    expect(result.cached).toBe(false);
  });

  it('sets cached: false on a fresh spawn', async () => {
    const { spawnFn } = spawnSuccess(JSON.stringify(VALID_JSON));
    const result = await runResearch(
      { topic: 'app router', library: 'next', version: '15.2.0' },
      baseDeps(spawnFn),
    );
    expect(result.cached).toBe(false);
  });

  it('strips markdown fences before parsing', async () => {
    const fenced = '```json\n' + JSON.stringify(VALID_JSON) + '\n```';
    const { spawnFn } = spawnSuccess(fenced);
    const result = await runResearch(
      { topic: 'app router', library: 'next' },
      baseDeps(spawnFn),
    );
    expect(result.confidenceHint).toBe('high');
  });

  it('populates sources and snippets from the JSON', async () => {
    const { spawnFn } = spawnSuccess(JSON.stringify(VALID_JSON));
    const result = await runResearch(
      { topic: 'app router', library: 'next' },
      baseDeps(spawnFn),
    );
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].url).toBe('https://nextjs.org');
    expect(result.relevantSnippets).toHaveLength(1);
  });

  it('assigns a uuid correlationId', async () => {
    const { spawnFn } = spawnSuccess(JSON.stringify(VALID_JSON));
    const result = await runResearch(
      { topic: 'app router', library: 'next' },
      baseDeps(spawnFn),
    );
    expect(result.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe('runResearch — cache behaviour', () => {
  it('returns cached artifact with cached: true on second call', async () => {
    const { spawnFn } = spawnSuccess(JSON.stringify(VALID_JSON));
    const deps = baseDeps(spawnFn);
    await runResearch({ topic: 'app router', library: 'next', version: '15.2.0' }, deps);
    const second = await runResearch({ topic: 'app router', library: 'next', version: '15.2.0' }, deps);
    expect(second.cached).toBe(true);
    // spawn should only have been called once
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it('does not call spawn when cache hit occurs', async () => {
    const { spawnFn } = spawnSuccess(JSON.stringify(VALID_JSON));
    const deps = baseDeps(spawnFn);
    await runResearch({ topic: 'routing', library: 'next' }, deps);
    await runResearch({ topic: 'routing', library: 'next' }, deps);
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });
});

describe('runResearch — failure cases', () => {
  it('returns low-confidence failure artifact on non-zero exit', async () => {
    const deps = baseDeps(spawnFailure('cli error'));
    const result = await runResearch({ topic: 'routing', library: 'next' }, deps);
    expect(result.confidenceHint).toBe('low');
    expect(result.summary).toContain('Research failed');
    expect(result.cached).toBe(false);
  });

  it('returns failure artifact on malformed JSON output', async () => {
    const { spawnFn } = spawnSuccess('not valid json at all }{');
    const result = await runResearch(
      { topic: 'routing', library: 'next' },
      baseDeps(spawnFn),
    );
    expect(result.confidenceHint).toBe('low');
    expect(result.summary).toContain('Research failed');
  });

  it('returns failure artifact on empty stdout', async () => {
    const { spawnFn } = spawnSuccess('');
    const result = await runResearch(
      { topic: 'routing', library: 'next' },
      baseDeps(spawnFn),
    );
    expect(result.confidenceHint).toBe('low');
  });

  it('never throws — resolves even on spawn error', async () => {
    const child = makeChild();
    const spawnFn = vi.fn(() => {
      setImmediate(() => child.emit('error', new Error('ENOENT')));
      return child;
    }) as unknown as typeof import('child_process').spawn;
    await expect(
      runResearch({ topic: 'routing' }, baseDeps(spawnFn)),
    ).resolves.toBeDefined();
  });

  it('returns failure artifact on timeout (30 s)', async () => {
    vi.useFakeTimers();
    const hangSpawn = spawnHang();
    const resultPromise = runResearch(
      { topic: 'routing', library: 'next' },
      baseDeps(hangSpawn),
    );
    vi.advanceTimersByTime(31_000);
    const result = await resultPromise;
    expect(result.confidenceHint).toBe('low');
    expect(result.summary).toContain('Research failed');
  });
});

describe('runResearch — no library', () => {
  it('works without a library or version', async () => {
    const { spawnFn } = spawnSuccess(JSON.stringify({ ...VALID_JSON, library: undefined }));
    const result = await runResearch({ topic: 'general typescript tips' }, baseDeps(spawnFn));
    expect(result.topic).toBe('general typescript tips');
  });
});

describe('runResearch — telemetry recordInvocation', () => {
  it('calls recordInvocation with non-null artifactHash on successful spawn', async () => {
    const { spawnFn } = spawnSuccess(JSON.stringify(VALID_JSON));
    await runResearch(
      { topic: 'app router', library: 'next', sessionId: 'sess-telem', triggerReason: 'explicit' },
      baseDeps(spawnFn),
    );
    expect(mockRecordInvocation).toHaveBeenCalledTimes(1);
    const call = mockRecordInvocation.mock.calls[0][0];
    expect(call.sessionId).toBe('sess-telem');
    expect(call.topic).toBe('app router');
    expect(call.triggerReason).toBe('explicit');
    expect(call.hitCache).toBe(false);
    expect(call.latencyMs).toBeGreaterThanOrEqual(0);
    expect(call.artifactHash).toMatch(/^[0-9a-f]{40}$/);
  });

  it('calls recordInvocation with null artifactHash on spawn failure', async () => {
    const deps = baseDeps(spawnFailure('cli error'));
    await runResearch({ topic: 'routing', library: 'next' }, deps);
    expect(mockRecordInvocation).toHaveBeenCalledTimes(1);
    const call = mockRecordInvocation.mock.calls[0][0];
    expect(call.hitCache).toBe(false);
    expect(call.artifactHash).toBeNull();
  });

  it('calls recordInvocation with hitCache:true on cache hit', async () => {
    const { spawnFn } = spawnSuccess(JSON.stringify(VALID_JSON));
    const deps = baseDeps(spawnFn);
    // first call populates cache
    await runResearch({ topic: 'app router', library: 'next', version: '15.2.0' }, deps);
    mockRecordInvocation.mockClear();
    // second call is a cache hit
    await runResearch({ topic: 'app router', library: 'next', version: '15.2.0' }, deps);
    expect(mockRecordInvocation).toHaveBeenCalledTimes(1);
    const call = mockRecordInvocation.mock.calls[0][0];
    expect(call.hitCache).toBe(true);
    expect(call.latencyMs).toBe(0);
    expect(call.artifactHash).toMatch(/^[0-9a-f]{40}$/);
  });

  it('defaults triggerReason to "other" when omitted', async () => {
    const { spawnFn } = spawnSuccess(JSON.stringify(VALID_JSON));
    await runResearch({ topic: 'app router', library: 'next' }, baseDeps(spawnFn));
    const call = mockRecordInvocation.mock.calls[0][0];
    expect(call.triggerReason).toBe('other');
  });

  it('calls recordInvocation with null artifactHash on malformed JSON', async () => {
    const { spawnFn } = spawnSuccess('not valid json }{');
    await runResearch({ topic: 'routing', library: 'next' }, baseDeps(spawnFn));
    expect(mockRecordInvocation).toHaveBeenCalledTimes(1);
    const call = mockRecordInvocation.mock.calls[0][0];
    expect(call.artifactHash).toBeNull();
  });
});
