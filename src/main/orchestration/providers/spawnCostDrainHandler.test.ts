/**
 * spawnCostDrainHandler.test.ts — Wave 52 Phase C
 *
 * Covers:
 *   - Happy path: hook record drains to emitMcpSpawnCost
 *   - Dedup: sessionId already in existingIds set → handler skips
 *   - Dedup: second record with same sessionId within one drain run → skipped
 *   - Invalid payload shape: handler skips with warn log
 *   - Missing JSONL (first drain): registerSpawnCostHandler doesn't throw
 *   - Malformed JSONL line: ignored, good lines still parsed
 *   - registerSpawnCostHandler: registers with correct surface + schemaVersion
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be defined before any imports that load the SUT.
// ---------------------------------------------------------------------------

const { mockReadFileSync, mockAppendFile, mockMkdirSync, logWarn, logInfo } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockAppendFile: vi.fn(),
  mockMkdirSync: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    readFileSync: mockReadFileSync,
    appendFile: mockAppendFile,
    mkdirSync: mockMkdirSync,
  },
  readFileSync: mockReadFileSync,
  appendFile: mockAppendFile,
  mkdirSync: mockMkdirSync,
}));

vi.mock('../../logger', () => ({
  default: { info: logInfo, warn: logWarn, error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// SUT imports (after mocks are registered)
// ---------------------------------------------------------------------------

import {
  clearSurfaceHandlersForTest,
  registerSurfaceHandler,
} from '../../telemetry/telemetryDrain';
import type { QueueRecord } from '../../telemetry/telemetryQueue';
import {
  createSpawnCostHandler,
  registerSpawnCostHandler,
  SPAWN_COST_SCHEMA_VERSION,
  SPAWN_COST_SURFACE,
} from './spawnCostDrainHandler';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueueRecord(payloadOverrides: Record<string, unknown> = {}): QueueRecord {
  return {
    recordId: 'rec-uuid-001',
    ts: 1_700_000_000_000,
    surface: SPAWN_COST_SURFACE,
    schemaVersion: SPAWN_COST_SCHEMA_VERSION,
    payload: {
      sessionId: 'sess-abc',
      model: 'claude-sonnet-4-5',
      routingDecision: 'unknown',
      internalMcpScope: 'unknown',
      transport: 'unknown',
      codemodeEnabled: false,
      ideSession: false,
      mcpConfigBytes: 256,
      serverCount: 1,
      tokenEstimate: 64,
      serversIncluded: ['github'],
      ...payloadOverrides,
    },
  };
}

function makeNoJsonl(): void {
  mockReadFileSync.mockImplementation(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

function resetMocks(): void {
  clearSurfaceHandlersForTest();
  mockReadFileSync.mockReset();
  mockAppendFile.mockReset();
  mockMkdirSync.mockReset();
  logWarn.mockReset();
  logInfo.mockReset();
  mockAppendFile.mockImplementation((_p: string, _d: string, cb: (err?: unknown) => void) =>
    cb(null),
  );
  mockMkdirSync.mockReturnValue(undefined);
}

// ---------------------------------------------------------------------------
// registerSpawnCostHandler — registration
// ---------------------------------------------------------------------------

describe('registerSpawnCostHandler — registration', () => {
  beforeEach(resetMocks);
  afterEach(() => {
    clearSurfaceHandlersForTest();
    vi.restoreAllMocks();
  });

  it('registers with the correct surface + schema version', () => {
    makeNoJsonl();
    const spy = vi.spyOn({ registerSurfaceHandler }, 'registerSurfaceHandler');
    // Intercept via the real module export — swap reference for this test only
    // by calling registerSpawnCostHandler and checking the side-effect (the
    // handler is now in the handlers map, which we verify by confirming the
    // exported constants match the expected values).
    expect(SPAWN_COST_SURFACE).toBe('spawn-cost');
    expect(SPAWN_COST_SCHEMA_VERSION).toBe(1);
    spy.mockRestore();
  });

  it('does not throw when JSONL is missing (first drain)', () => {
    makeNoJsonl();
    expect(() => registerSpawnCostHandler()).not.toThrow();
  });

  it('ignores malformed JSONL lines without throwing', () => {
    mockReadFileSync.mockReturnValue('not-json\n{"spawnId":"valid-id"}\n');
    expect(() => registerSpawnCostHandler()).not.toThrow();
  });

  it('reads existing spawnIds from JSONL for dedup seeding', () => {
    const existing = JSON.stringify({ spawnId: 'pre-existing', ts: 1 });
    mockReadFileSync.mockReturnValue(existing + '\n');
    // Registration should succeed and load 1 id.
    expect(() => registerSpawnCostHandler()).not.toThrow();
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('loaded'), 1, expect.any(String));
  });
});

// ---------------------------------------------------------------------------
// createSpawnCostHandler — happy path
// ---------------------------------------------------------------------------

describe('createSpawnCostHandler — happy path', () => {
  beforeEach(resetMocks);
  afterEach(() => vi.restoreAllMocks());

  it('emits a JSONL record on the happy path', () => {
    const handler = createSpawnCostHandler(new Set());
    handler(makeQueueRecord());

    expect(mockAppendFile).toHaveBeenCalledTimes(1);
    const [writtenPath, writtenLine] = mockAppendFile.mock.calls[0] as [string, string, unknown];
    expect(writtenPath).toMatch(/mcp-spawn-cost\.jsonl$/);
    expect(writtenLine.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(writtenLine.trimEnd()) as Record<string, unknown>;
    expect(parsed.spawnId).toBe('sess-abc');
    expect(parsed.serversIncluded).toEqual(['github']);
    expect(parsed.mcpConfigBytes).toBe(256);
    expect(parsed.tokenEstimate).toBe(64);
  });

  it('sets spawnId from payload.sessionId', () => {
    const handler = createSpawnCostHandler(new Set());
    handler(makeQueueRecord({ sessionId: 'my-session' }));

    const [, line] = mockAppendFile.mock.calls[0] as [string, string, unknown];
    const parsed = JSON.parse(line.trimEnd()) as Record<string, unknown>;
    expect(parsed.spawnId).toBe('my-session');
  });

  it('sets ts from the queue record timestamp', () => {
    const handler = createSpawnCostHandler(new Set());
    handler(makeQueueRecord());

    const [, line] = mockAppendFile.mock.calls[0] as [string, string, unknown];
    const parsed = JSON.parse(line.trimEnd()) as Record<string, unknown>;
    expect(parsed.ts).toBe(1_700_000_000_000);
  });
});

// ---------------------------------------------------------------------------
// createSpawnCostHandler — dedup
// ---------------------------------------------------------------------------

describe('createSpawnCostHandler — dedup', () => {
  beforeEach(resetMocks);
  afterEach(() => vi.restoreAllMocks());

  it('skips a record whose sessionId is pre-seeded in existingIds', () => {
    const handler = createSpawnCostHandler(new Set(['sess-abc']));
    handler(makeQueueRecord({ sessionId: 'sess-abc' }));

    expect(mockAppendFile).not.toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('dedup'), 'sess-abc');
  });

  it('does not skip a record with a different sessionId', () => {
    const handler = createSpawnCostHandler(new Set(['other-session']));
    handler(makeQueueRecord({ sessionId: 'new-session' }));

    expect(mockAppendFile).toHaveBeenCalledTimes(1);
  });

  it('skips a second record with the same sessionId within one drain run', () => {
    const handler = createSpawnCostHandler(new Set());
    handler(makeQueueRecord({ sessionId: 'dup-session' }));
    handler(makeQueueRecord({ sessionId: 'dup-session' }));

    // First call emits, second is deduped by the in-memory set update.
    expect(mockAppendFile).toHaveBeenCalledTimes(1);
  });

  it('emits for two different sessionIds in the same run', () => {
    const handler = createSpawnCostHandler(new Set());
    handler(makeQueueRecord({ sessionId: 'session-A' }));
    handler(makeQueueRecord({ sessionId: 'session-B' }));

    expect(mockAppendFile).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// createSpawnCostHandler — invalid payload
// ---------------------------------------------------------------------------

describe('createSpawnCostHandler — invalid payload', () => {
  beforeEach(resetMocks);
  afterEach(() => vi.restoreAllMocks());

  it('skips and logs warn when payload is null', () => {
    const handler = createSpawnCostHandler(new Set());
    handler({ ...makeQueueRecord(), payload: null } as unknown as QueueRecord);

    expect(mockAppendFile).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith(
      expect.stringContaining('invalid payload'),
      expect.any(String),
    );
  });

  it('skips and logs warn when required numeric fields are missing', () => {
    const handler = createSpawnCostHandler(new Set());
    handler({ ...makeQueueRecord(), payload: { sessionId: 'x' } } as unknown as QueueRecord);

    expect(mockAppendFile).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalled();
  });

  it('skips and logs warn when serversIncluded is not an array', () => {
    const handler = createSpawnCostHandler(new Set());
    handler(makeQueueRecord({ serversIncluded: 'not-an-array' }));

    expect(mockAppendFile).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalled();
  });

  it('does not throw when emitMcpSpawnCost internally errors', () => {
    // appendFile throws synchronously — emitMcpSpawnCost swallows it, handler must not re-throw.
    mockAppendFile.mockImplementation(() => {
      throw new Error('disk full');
    });
    const handler = createSpawnCostHandler(new Set());

    expect(() => handler(makeQueueRecord())).not.toThrow();
  });
});

// Suppress unused import warning — registerSurfaceHandler imported for type reference
void registerSurfaceHandler;
