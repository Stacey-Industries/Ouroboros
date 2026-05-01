/**
 * indexingPipelineResult.test.ts — Tests for result building.
 */

import { describe, expect, it, vi } from 'vitest';

import { buildIndexResult, type IndexResultOpts } from './indexingPipelineResult';
import type { ParsedFileResult } from './treeSitterTypes';

// Helper to create a minimal parsed file result
function createParsedFile(
  definitions: number = 1,
  lineCount: number = 50,
  exportedNames: number = 0,
): ParsedFileResult {
  return {
    definitions: Array(definitions).fill({ name: 'dummy', kind: 'Function' }),
    lineCount,
    exportedNames: Array(exportedNames).fill('dummy'),
    imports: [],
  } as unknown as ParsedFileResult;
}

// Helper to create a mock database
function createMockDb() {
  return {
    setGraphMetadata: vi.fn(),
  };
}

describe('buildIndexResult', () => {
  it('builds a valid IndexingResult with parseAnomalies field', () => {
    const startTime = Date.now();
    const opts: IndexResultOpts = {
      db: createMockDb() as never,
      projectName: 'test-project',
      allFiles: [
        {
          absolutePath: '/test/src/a.ts',
          relativePath: 'src/a.ts',
          extension: 'ts',
          sizeBytes: 1024,
          mtimeMs: Date.now(),
        },
      ],
      filesToProcess: [
        {
          absolutePath: '/test/src/a.ts',
          relativePath: 'src/a.ts',
          extension: 'ts',
          sizeBytes: 1024,
          mtimeMs: Date.now(),
        },
      ],
      indexedFiles: [
        {
          absolutePath: '/test/src/a.ts',
          relativePath: 'src/a.ts',
          extension: 'ts',
          sizeBytes: 1024,
          mtimeMs: Date.now(),
          contentHash: 'abc123',
          parsed: createParsedFile(1, 50),
        },
      ],
      nodesCreated: 10,
      edgesCreated: 5,
      phaseTimingsMs: { discovery: 10, parsing: 20, definitions: 30 },
      progress: {
        phase: 'finalizing',
        filesTotal: 1,
        filesProcessed: 1,
        nodesCreated: 10,
        edgesCreated: 5,
        errors: [],
        startedAt: startTime,
        elapsedMs: 100,
      },
      isIncrementalRun: true,
      startTime,
    };

    const result = buildIndexResult(opts);

    expect(result.projectName).toBe('test-project');
    expect(result.success).toBe(true);
    expect(result.filesIndexed).toBe(1);
    expect(result.filesSkipped).toBe(0);
    expect(result.nodesCreated).toBe(10);
    expect(result.edgesCreated).toBe(5);
    expect(result.errors).toEqual([]);
    expect(result.incremental).toBe(true);
    expect(result.phaseTimingsMs).toEqual({
      discovery: 10,
      parsing: 20,
      definitions: 30,
    });
    expect(result.parseAnomalies).toBeDefined();
    expect(result.parseAnomalies!.count).toBe(0);
    expect(result.parseAnomalies!.samples).toEqual([]);
  });

  it('includes parseAnomalies count when anomalies exist', () => {
    const startTime = Date.now();
    const opts: IndexResultOpts = {
      db: createMockDb() as never,
      projectName: 'test-project',
      allFiles: [
        {
          absolutePath: '/test/src/anomaly.ts',
          relativePath: 'src/anomaly.ts',
          extension: 'ts',
          sizeBytes: 1024,
          mtimeMs: Date.now(),
        },
      ],
      filesToProcess: [
        {
          absolutePath: '/test/src/anomaly.ts',
          relativePath: 'src/anomaly.ts',
          extension: 'ts',
          sizeBytes: 1024,
          mtimeMs: Date.now(),
        },
      ],
      indexedFiles: [
        {
          absolutePath: '/test/src/anomaly.ts',
          relativePath: 'src/anomaly.ts',
          extension: 'ts',
          sizeBytes: 1024,
          mtimeMs: Date.now(),
          contentHash: 'abc123',
          parsed: createParsedFile(0, 50, 0), // anomaly: zero definitions
        },
      ],
      nodesCreated: 0,
      edgesCreated: 0,
      phaseTimingsMs: {},
      progress: {
        phase: 'finalizing',
        filesTotal: 1,
        filesProcessed: 1,
        nodesCreated: 0,
        edgesCreated: 0,
        errors: [],
        startedAt: startTime,
        elapsedMs: 100,
      },
      isIncrementalRun: false,
      startTime,
    };

    const result = buildIndexResult(opts);

    expect(result.parseAnomalies).toBeDefined();
    expect(result.parseAnomalies!.count).toBe(1);
    expect(result.parseAnomalies!.samples).toContain('src/anomaly.ts');
  });

  it('calculates filesSkipped correctly', () => {
    const startTime = Date.now();
    const opts: IndexResultOpts = {
      db: createMockDb() as never,
      projectName: 'test-project',
      allFiles: Array(10)
        .fill(null)
        .map((_, i) => ({
          absolutePath: `/test/src/f${i}.ts`,
          relativePath: `src/f${i}.ts`,
          extension: 'ts',
          sizeBytes: 1024,
          mtimeMs: Date.now(),
        })),
      filesToProcess: Array(3)
        .fill(null)
        .map((_, i) => ({
          absolutePath: `/test/src/f${i}.ts`,
          relativePath: `src/f${i}.ts`,
          extension: 'ts',
          sizeBytes: 1024,
          mtimeMs: Date.now(),
        })),
      indexedFiles: Array(3)
        .fill(null)
        .map((_, i) => ({
          absolutePath: `/test/src/f${i}.ts`,
          relativePath: `src/f${i}.ts`,
          extension: 'ts',
          sizeBytes: 1024,
          mtimeMs: Date.now(),
          contentHash: 'abc123',
          parsed: createParsedFile(1, 50),
        })),
      nodesCreated: 5,
      edgesCreated: 2,
      phaseTimingsMs: {},
      progress: {
        phase: 'finalizing',
        filesTotal: 10,
        filesProcessed: 3,
        nodesCreated: 5,
        edgesCreated: 2,
        errors: [],
        startedAt: startTime,
        elapsedMs: 100,
      },
      isIncrementalRun: true,
      startTime,
    };

    const result = buildIndexResult(opts);

    expect(result.filesIndexed).toBe(3);
    expect(result.filesSkipped).toBe(7);
  });
});
