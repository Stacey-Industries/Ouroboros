/**
 * mcpSpawnCostTelemetry.test.ts — Wave 51 Phase D
 *
 * Covers the per-spawn MCP cost telemetry emitter:
 *   - happy-path emit appends a JSONL line with the right shape
 *   - write failures (mkdir / appendFile) are tolerated, never thrown
 *   - computeMcpCostFields produces the byte/token approximation contract
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockMkdirSync, mockAppendFile, logWarn } = vi.hoisted(() => ({
  mockMkdirSync: vi.fn(),
  mockAppendFile: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    mkdirSync: mockMkdirSync,
    appendFile: mockAppendFile,
  },
  mkdirSync: mockMkdirSync,
  appendFile: mockAppendFile,
}));

vi.mock('../../logger', () => ({
  default: { info: vi.fn(), warn: logWarn, error: vi.fn() },
}));

import {
  computeMcpCostFields,
  emitMcpSpawnCost,
  type McpSpawnCostRecord,
} from './mcpSpawnCostTelemetry';

function sampleRecord(overrides: Partial<McpSpawnCostRecord> = {}): McpSpawnCostRecord {
  return {
    ts: 1_700_000_000_000,
    spawnId: 'spawn-1',
    routingDecision: 'direct-inject',
    internalMcpScope: 'task-gated',
    transport: 'sse',
    codemodeEnabled: false,
    mcpConfigBytes: 480,
    serverCount: 2,
    tokenEstimate: 120,
    serversIncluded: ['ouroboros', 'github'],
    ...overrides,
  };
}

describe('emitMcpSpawnCost', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockAppendFile.mockReset();
    logWarn.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('appends a JSONL line on the happy path', () => {
    mockMkdirSync.mockReturnValue(undefined);
    mockAppendFile.mockImplementation((_path: string, _data: string, cb: (err?: unknown) => void) =>
      cb(null),
    );

    const record = sampleRecord();
    expect(() => emitMcpSpawnCost(record)).not.toThrow();

    expect(mockAppendFile).toHaveBeenCalledTimes(1);
    const args = mockAppendFile.mock.calls[0];
    expect(args[0]).toMatch(/mcp-spawn-cost\.jsonl$/);
    const line = args[1] as string;
    expect(line.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(line.trimEnd()) as McpSpawnCostRecord;
    expect(parsed).toEqual(record);
  });

  it('logs warn but does not throw when mkdir fails', () => {
    mockMkdirSync.mockImplementation(() => {
      throw new Error('eacces');
    });

    expect(() => emitMcpSpawnCost(sampleRecord())).not.toThrow();
    expect(mockAppendFile).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalled();
  });

  it('logs warn but does not throw when appendFile callback errors', () => {
    mockMkdirSync.mockReturnValue(undefined);
    mockAppendFile.mockImplementation((_p: string, _d: string, cb: (err?: unknown) => void) =>
      cb(new Error('disk full')),
    );

    expect(() => emitMcpSpawnCost(sampleRecord())).not.toThrow();
    expect(logWarn).toHaveBeenCalled();
  });

  it('logs warn but does not throw when appendFile throws synchronously', () => {
    mockMkdirSync.mockReturnValue(undefined);
    mockAppendFile.mockImplementation(() => {
      throw new Error('sync boom');
    });

    expect(() => emitMcpSpawnCost(sampleRecord())).not.toThrow();
    expect(logWarn).toHaveBeenCalled();
  });

  it('preserves all routing-decision values in the serialized record', () => {
    mockMkdirSync.mockReturnValue(undefined);
    mockAppendFile.mockImplementation((_p: string, _d: string, cb: (err?: unknown) => void) =>
      cb(null),
    );

    for (const decision of ['direct-inject', 'route-through-codemode', 'omit'] as const) {
      mockAppendFile.mockClear();
      emitMcpSpawnCost(sampleRecord({ routingDecision: decision }));
      const line = mockAppendFile.mock.calls[0][1] as string;
      const parsed = JSON.parse(line.trimEnd()) as McpSpawnCostRecord;
      expect(parsed.routingDecision).toBe(decision);
    }
  });
});

describe('computeMcpCostFields', () => {
  it('computes byte length, server count, and token estimate (bytes/4)', () => {
    const servers = {
      ouroboros: { url: 'http://127.0.0.1:54321/sse' },
      github: { command: 'npx', args: ['github-mcp'] },
    };
    const result = computeMcpCostFields(servers);
    const expectedBytes = Buffer.byteLength(JSON.stringify(servers), 'utf8');
    expect(result.mcpConfigBytes).toBe(expectedBytes);
    expect(result.serverCount).toBe(2);
    expect(result.tokenEstimate).toBe(Math.round(expectedBytes / 4));
    expect(result.serversIncluded.sort()).toEqual(['github', 'ouroboros']);
  });

  it('handles an empty server map', () => {
    const result = computeMcpCostFields({});
    expect(result.serverCount).toBe(0);
    expect(result.serversIncluded).toEqual([]);
    expect(result.mcpConfigBytes).toBe(2); // "{}"
    expect(result.tokenEstimate).toBe(1); // round(2/4) = 1
  });
});
