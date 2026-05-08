/**
 * canonicalFlows.test.ts — Unit/integration tests for the canonical flow
 * gallery generator.
 *
 * Wave 85 Phase 5. mocks spawnClaude and the graph controller — no real CLI
 * calls or graph queries in tests.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanonicalFlow } from '../../shared/types/flowTracer';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../claudeMdGeneratorSupport', () => ({
  spawnClaude: vi.fn(),
}));

vi.mock('../config', () => ({
  getConfigValue: vi.fn(),
}));

vi.mock('../codebaseGraph/graphControllerSupport', () => ({
  getGraphController: vi.fn(),
}));

import { spawnClaude } from '../claudeMdGeneratorSupport';
import { getGraphController } from '../codebaseGraph/graphControllerSupport';
import { getConfigValue } from '../config';
import {
  extractEntryPointCandidates,
  FALLBACK_FLOWS,
  generateCanonicalFlows,
  getCanonicalFlows,
  getCircuitBreakerState,
  regenerateCanonicalFlows,
  resetCircuitBreaker,
} from './canonicalFlows';

const mockSpawnClaude = vi.mocked(spawnClaude);
const mockGetConfigValue = vi.mocked(getConfigValue);
const mockGetGraphController = vi.mocked(getGraphController);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function makeFlowJson(flows: CanonicalFlow[]): string {
  return JSON.stringify(flows);
}

function makeMockController(rows: Record<string, unknown>[] = []): any {
  return { queryGraph: vi.fn().mockReturnValue(rows) };
}

async function writeCacheFile(dir: string, flows: CanonicalFlow[]): Promise<void> {
  const ouroboros = path.join(dir, '.ouroboros');
  await fs.mkdir(ouroboros, { recursive: true }); // eslint-disable-line security/detect-non-literal-fs-filename -- tmpDir path in test helper
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- tmpDir path in test helper
  await fs.writeFile(
    path.join(ouroboros, 'canonical-flows.json'),
    JSON.stringify({ flows, generatedAt: Date.now() }),
    'utf-8',
  );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'canonical-flows-test-'));
  mockGetConfigValue.mockReturnValue(tmpDir);
  mockGetGraphController.mockReturnValue(null);
  mockSpawnClaude.mockResolvedValue('[]');
  resetCircuitBreaker();
});

afterEach(async () => {
  vi.clearAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// FALLBACK_FLOWS
// ---------------------------------------------------------------------------

describe('FALLBACK_FLOWS', () => {
  it('has at least one flow with valid CanonicalFlow shape', () => {
    expect(FALLBACK_FLOWS.length).toBeGreaterThanOrEqual(1);
    for (const flow of FALLBACK_FLOWS) {
      expect(typeof flow.title).toBe('string');
      expect(flow.title.length).toBeGreaterThan(0);
      expect(typeof flow.entryPoint.symbol).toBe('string');
      expect(typeof flow.entryPoint.file).toBe('string');
      expect(typeof flow.entryPoint.line).toBe('number');
      expect(typeof flow.estimatedSteps).toBe('number');
      expect(Array.isArray(flow.layers)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// getCanonicalFlows — cache hit
// ---------------------------------------------------------------------------

describe('getCanonicalFlows', () => {
  it('returns cached flows when cache file exists', async () => {
    const cached: CanonicalFlow[] = [
      {
        title: 'Cached flow',
        entryPoint: { symbol: 'handleFoo', file: 'src/main/foo.ts', line: 1 },
        estimatedSteps: 4,
        layers: ['renderer', 'main'],
      },
    ];
    await writeCacheFile(tmpDir, cached);

    const flows = await getCanonicalFlows();
    expect(flows).toHaveLength(1);
    expect(flows[0].title).toBe('Cached flow');
    expect(mockSpawnClaude).not.toHaveBeenCalled();
  });

  it('returns FALLBACK_FLOWS on cache miss (no workspace root)', async () => {
    mockGetConfigValue.mockReturnValue(undefined);
    const flows = await getCanonicalFlows();
    expect(flows).toEqual(FALLBACK_FLOWS);
  });

  it('returns FALLBACK_FLOWS on cache miss with workspace root (background generation triggered)', async () => {
    // No cache file written — cold start
    const flows = await getCanonicalFlows();
    expect(flows).toEqual(FALLBACK_FLOWS);
  });
});

// ---------------------------------------------------------------------------
// generateCanonicalFlows — CLI call + cache write
// ---------------------------------------------------------------------------

describe('generateCanonicalFlows', () => {
  it('returns FALLBACK_FLOWS when no workspace root is configured', async () => {
    mockGetConfigValue.mockReturnValue(undefined);
    const flows = await generateCanonicalFlows();
    expect(flows).toEqual(FALLBACK_FLOWS);
    expect(mockSpawnClaude).not.toHaveBeenCalled();
  });

  it('returns FALLBACK_FLOWS when graph has no candidates', async () => {
    // graph returns null (not ready)
    mockGetGraphController.mockReturnValue(null);
    const flows = await generateCanonicalFlows();
    expect(flows).toEqual(FALLBACK_FLOWS);
  });

  it('calls spawnClaude with candidates and writes cache on success', async () => {
    const generatedFlows: CanonicalFlow[] = [
      {
        title: 'When I open a file',
        entryPoint: { symbol: 'handleOpenFile', file: 'src/main/ipc-handlers/files.ts', line: 10 },
        estimatedSteps: 3,
        layers: ['renderer', 'preload', 'main'],
      },
    ];
    mockGetGraphController.mockReturnValue(
      makeMockController([
        {
          n_name: 'handleOpenFile',
          n_file_path: 'src/main/ipc-handlers/files.ts',
          n_start_line: 10,
        },
      ]),
    );
    mockSpawnClaude.mockResolvedValue(makeFlowJson(generatedFlows));

    const flows = await generateCanonicalFlows();
    expect(flows).toHaveLength(1);
    expect(flows[0].title).toBe('When I open a file');
    expect(mockSpawnClaude).toHaveBeenCalledOnce();

    // Cache file should exist
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- tmpDir path in test
    const cacheRaw = await fs.readFile(
      path.join(tmpDir, '.ouroboros', 'canonical-flows.json'),
      'utf-8',
    );
    const cacheData = JSON.parse(cacheRaw);
    expect(cacheData.flows).toHaveLength(1);
  });

  it('returns FALLBACK_FLOWS and records failure when spawnClaude fails twice', async () => {
    mockGetGraphController.mockReturnValue(
      makeMockController([
        { n_name: 'handleFoo', n_file_path: 'src/main/ipc-handlers/foo.ts', n_start_line: 5 },
      ]),
    );
    mockSpawnClaude.mockRejectedValue(new Error('CLI unavailable'));

    const flows = await generateCanonicalFlows();
    expect(flows).toEqual(FALLBACK_FLOWS);
    expect(mockSpawnClaude).toHaveBeenCalledTimes(2);
    expect(getCircuitBreakerState().failures).toBe(1);
  });

  it('circuit breaker skips generation after 3 failures', async () => {
    mockGetGraphController.mockReturnValue(
      makeMockController([
        { n_name: 'handleFoo', n_file_path: 'src/main/ipc-handlers/foo.ts', n_start_line: 5 },
      ]),
    );
    mockSpawnClaude.mockRejectedValue(new Error('CLI unavailable'));

    // 3 failures to open the circuit (each generateCanonicalFlows call = 1 failure tick)
    await generateCanonicalFlows();
    await generateCanonicalFlows();
    await generateCanonicalFlows();
    expect(getCircuitBreakerState().open).toBe(true);

    vi.clearAllMocks();
    mockGetConfigValue.mockReturnValue(tmpDir);
    const flows = await generateCanonicalFlows();
    expect(flows).toEqual(FALLBACK_FLOWS);
    expect(mockSpawnClaude).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// regenerateCanonicalFlows — bypasses cache
// ---------------------------------------------------------------------------

describe('regenerateCanonicalFlows', () => {
  it('deletes the cache file and re-generates', async () => {
    const oldFlows: CanonicalFlow[] = [
      {
        title: 'Old cached flow',
        entryPoint: { symbol: 'oldHandler', file: 'src/main/foo.ts', line: 1 },
        estimatedSteps: 2,
        layers: ['main'],
      },
    ];
    await writeCacheFile(tmpDir, oldFlows);

    const newFlows: CanonicalFlow[] = [
      {
        title: 'Regenerated flow',
        entryPoint: { symbol: 'handleOpenFile', file: 'src/main/ipc-handlers/files.ts', line: 10 },
        estimatedSteps: 4,
        layers: ['renderer', 'main'],
      },
    ];
    mockGetGraphController.mockReturnValue(
      makeMockController([
        {
          n_name: 'handleOpenFile',
          n_file_path: 'src/main/ipc-handlers/files.ts',
          n_start_line: 10,
        },
      ]),
    );
    mockSpawnClaude.mockResolvedValue(makeFlowJson(newFlows));

    const flows = await regenerateCanonicalFlows();
    expect(flows[0].title).toBe('Regenerated flow');
    expect(mockSpawnClaude).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// extractEntryPointCandidates
// ---------------------------------------------------------------------------

describe('extractEntryPointCandidates', () => {
  it('returns empty array when graph controller is null', async () => {
    mockGetGraphController.mockReturnValue(null);
    const candidates = await extractEntryPointCandidates();
    expect(candidates).toEqual([]);
  });

  it('deduplicates candidates with the same symbol+file', async () => {
    const row = {
      n_name: 'handleFoo',
      n_file_path: 'src/main/ipc-handlers/foo.ts',
      n_start_line: 5,
    };
    mockGetGraphController.mockReturnValue(makeMockController([row, row]));
    const candidates = await extractEntryPointCandidates();
    // Only one entry despite duplicate rows
    const unique = candidates.filter((c) => c.symbol === 'handleFoo');
    expect(unique).toHaveLength(1);
  });

  it('returns candidates from both ipc-handler and renderer queries', async () => {
    const ctrl = {
      queryGraph: vi
        .fn()
        .mockReturnValueOnce([
          { n_name: 'handleSend', n_file_path: 'src/main/ipc-handlers/chat.ts', n_start_line: 20 },
        ])
        .mockReturnValueOnce([
          {
            n_name: 'handleClick',
            n_file_path: 'src/renderer/components/Foo.tsx',
            n_start_line: 5,
          },
        ]),
    };
    mockGetGraphController.mockReturnValue(ctrl as any);
    const candidates = await extractEntryPointCandidates();
    const symbols = candidates.map((c) => c.symbol);
    expect(symbols).toContain('handleSend');
    expect(symbols).toContain('handleClick');
  });
});
