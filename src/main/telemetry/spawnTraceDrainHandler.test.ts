/**
 * spawnTraceDrainHandler.test.ts — Wave 53a Phase B
 *
 * Mocks:
 *   - `./traceBatcher` so `enqueueTrace` is observable and `redactArgv` is the
 *     real canonical implementation (we want to assert it's actually being
 *     applied to the argv).
 *   - `node:fs` is not used by the drain handler directly, but we mock it
 *     defensively at the suite level to ensure no test pollutes the disk.
 *   - The DB dedup check is injected via the `dbCheck` parameter; tests pass a
 *     stub. No `getTelemetryStore` calls happen in these tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the canonical traceBatcher: real redactArgv, spy enqueueTrace.
vi.mock('./traceBatcher', async () => {
  const actual = await vi.importActual<typeof import('./traceBatcher')>('./traceBatcher');
  return {
    ...actual,
    enqueueTrace: vi.fn(),
  };
});

// Defensive fs mock — drain handler doesn't use fs, but other imports might.
vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => false),
  },
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

import { createSpawnTraceHandler } from './spawnTraceDrainHandler';
import { SPAWN_TRACE_SCHEMA_VERSION } from './spawnTraceSchema';
import type { QueueRecord } from './telemetryQueue';
import { enqueueTrace } from './traceBatcher';

const enqueueTraceMock = vi.mocked(enqueueTrace);

function makeRecord(overrides: Partial<QueueRecord> = {}): QueueRecord {
  return {
    recordId: 'rec-1',
    ts: 1_700_000_000_000,
    surface: 'spawn-trace',
    schemaVersion: SPAWN_TRACE_SCHEMA_VERSION,
    payload: {
      sessionId: 'sess-A',
      argv: ['claude', '-p', '--output-format', 'stream-json'],
      cwdHash: 'abc123def456',
      ts: 1_700_000_000_000,
    },
    ...overrides,
  };
}

describe('createSpawnTraceHandler', () => {
  beforeEach(() => {
    enqueueTraceMock.mockClear();
  });

  // -------------------------------------------------------------------------
  // Happy path — argv redaction applied via canonical redactArgv
  // -------------------------------------------------------------------------

  it('enqueues a spawn trace with redacted argv on a valid record', () => {
    const handler = createSpawnTraceHandler(new Set(), () => false);
    handler(
      makeRecord({
        payload: {
          sessionId: 'sess-A',
          argv: ['claude', '--api-key', 'sk-supersecretvalue'],
          cwdHash: 'abc123def456',
          ts: 1_700_000_000_000,
        },
      }),
    );

    expect(enqueueTraceMock).toHaveBeenCalledTimes(1);
    const call = enqueueTraceMock.mock.calls[0][0];
    expect(call.kind).toBe('spawn');
    expect(call.sessionId).toBe('sess-A');
    expect(call.traceId).toBe('rec-1');
    // Real redactArgv: --api-key value is redacted to ***
    const argv = (call.payload as { argv: string[] }).argv;
    expect(argv).toEqual(['claude', '--api-key', '***']);
    expect((call.payload as { cwdHash: string }).cwdHash).toBe('abc123def456');
  });

  it('also redacts sk- patterns inside non-flag argv elements', () => {
    const handler = createSpawnTraceHandler(new Set(), () => false);
    handler(
      makeRecord({
        payload: {
          sessionId: 'sess-A',
          argv: ['claude', '--prompt=use sk-leakedtoken123 here'],
          cwdHash: 'abc123def456',
          ts: 1_700_000_000_000,
        },
      }),
    );

    const argv = (enqueueTraceMock.mock.calls[0][0].payload as { argv: string[] }).argv;
    expect(argv[1]).toBe('--prompt=use *** here');
  });

  // -------------------------------------------------------------------------
  // Schema validation
  // -------------------------------------------------------------------------

  it('skips records with mismatched schemaVersion', () => {
    const handler = createSpawnTraceHandler(new Set(), () => false);
    handler(makeRecord({ schemaVersion: 999 }));
    expect(enqueueTraceMock).not.toHaveBeenCalled();
  });

  it('skips records with missing sessionId', () => {
    const handler = createSpawnTraceHandler(new Set(), () => false);
    handler(makeRecord({ payload: { argv: [], cwdHash: 'x', ts: 0 } }));
    expect(enqueueTraceMock).not.toHaveBeenCalled();
  });

  it('skips records where argv is not an array', () => {
    const handler = createSpawnTraceHandler(new Set(), () => false);
    handler(
      makeRecord({
        payload: { sessionId: 's', argv: 'not-an-array', cwdHash: 'x', ts: 0 },
      }),
    );
    expect(enqueueTraceMock).not.toHaveBeenCalled();
  });

  it('skips records with non-object payload', () => {
    const handler = createSpawnTraceHandler(new Set(), () => false);
    handler(makeRecord({ payload: 'string-payload' }));
    expect(enqueueTraceMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Dedup
  // -------------------------------------------------------------------------

  it('skips a session that the DB already has a spawn trace for', () => {
    const handler = createSpawnTraceHandler(new Set(), (sid) => sid === 'sess-A');
    handler(makeRecord());
    expect(enqueueTraceMock).not.toHaveBeenCalled();
  });

  it('within a batch, skips a duplicate sessionId after the first record lands', () => {
    const handler = createSpawnTraceHandler(new Set(), () => false);
    handler(makeRecord({ recordId: 'rec-1' }));
    handler(makeRecord({ recordId: 'rec-2' }));
    // Same sessionId on both — only the first should enqueue.
    expect(enqueueTraceMock).toHaveBeenCalledTimes(1);
    expect(enqueueTraceMock.mock.calls[0][0].traceId).toBe('rec-1');
  });

  it('different sessionIds in the same batch each enqueue', () => {
    const handler = createSpawnTraceHandler(new Set(), () => false);
    handler(
      makeRecord({
        recordId: 'rec-1',
        payload: { sessionId: 'sess-A', argv: [], cwdHash: 'h', ts: 0 },
      }),
    );
    handler(
      makeRecord({
        recordId: 'rec-2',
        payload: { sessionId: 'sess-B', argv: [], cwdHash: 'h', ts: 0 },
      }),
    );
    expect(enqueueTraceMock).toHaveBeenCalledTimes(2);
  });

  it('once db-dedup hits, subsequent batch records for that sessionId are also skipped', () => {
    let dbHits = 0;
    const handler = createSpawnTraceHandler(new Set(), () => {
      dbHits += 1;
      return true;
    });
    handler(makeRecord({ recordId: 'rec-1' }));
    handler(makeRecord({ recordId: 'rec-2' }));
    expect(enqueueTraceMock).not.toHaveBeenCalled();
    // dbCheck only invoked the first time; second is caught by in-memory set.
    expect(dbHits).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Pre-seeded dedup set (simulating IDE-side traces from earlier the same run)
  // -------------------------------------------------------------------------

  it('honors a pre-seeded dedup set', () => {
    const seen = new Set<string>(['sess-A']);
    const handler = createSpawnTraceHandler(seen, () => false);
    handler(makeRecord());
    expect(enqueueTraceMock).not.toHaveBeenCalled();
  });
});
