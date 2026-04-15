/**
 * indexingPipelinePasses.test.ts — Unit tests for parsePass per-file error isolation.
 *
 * Verifies that a parse exception on one file does not abort the whole run:
 * the bad file gets parsed:null and the rest are unaffected.
 */

import { describe, expect, it, vi } from 'vitest'

import { parsePass } from './indexingPipelinePasses'
import type { DiscoveredFile } from './indexingPipelineTypes'
import type { TreeSitterParser } from './treeSitterParser'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFile(relativePath: string): DiscoveredFile {
  return {
    absolutePath: `/tmp/${relativePath}`,
    relativePath,
    extension: relativePath.split('.').pop() ?? 'ts',
    sizeBytes: 100,
    mtimeMs: Date.now(),
  }
}

function makeParsedResult(filePath: string) {
  return {
    filePath,
    language: 'typescript' as const,
    lineCount: 10,
    definitions: [],
    imports: [],
    calls: [],
    routes: [],
    exportedNames: [],
  }
}

// Mock fs/promises so no real disk I/O occurs
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn().mockResolvedValue('const x = 1'),
  },
  readFile: vi.fn().mockResolvedValue('const x = 1'),
}))

vi.mock('../logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('parsePass — per-file error isolation', () => {
  it('returns all files even when one throws during parsing', async () => {
    const files = [
      makeFile('src/good.ts'),
      makeFile('src/bad.ts'),
      makeFile('src/also-good.ts'),
    ]

    const parser = {
      parseFile: vi.fn().mockImplementation((relPath: string) => {
        if (relPath === 'src/bad.ts') throw new Error('WASM exploded')
        return Promise.resolve(makeParsedResult(relPath))
      }),
    } as unknown as TreeSitterParser

    const results = await parsePass(parser, files)

    expect(results).toHaveLength(3)
    expect(results[1].relativePath).toBe('src/bad.ts')
    expect(results[1].parsed).toBeNull()
    // contentHash is computed before parse — non-empty because the read succeeded
    expect(results[1].contentHash).not.toBe('')
  })

  it('good files adjacent to the bad file still have parsed results', async () => {
    const files = [makeFile('src/a.ts'), makeFile('src/b.ts')]

    const parser = {
      parseFile: vi.fn().mockImplementation((relPath: string) => {
        if (relPath === 'src/b.ts') throw new Error('parse error')
        return Promise.resolve(makeParsedResult(relPath))
      }),
    } as unknown as TreeSitterParser

    const results = await parsePass(parser, files)

    expect(results[0].parsed).not.toBeNull()
    expect(results[1].parsed).toBeNull()
  })

  it('invokes onProgress callback at completion', async () => {
    const files = [makeFile('src/x.ts')]
    const parser = {
      parseFile: vi.fn().mockResolvedValue(makeParsedResult('src/x.ts')),
    } as unknown as TreeSitterParser

    const onProgress = vi.fn()
    await parsePass(parser, files, onProgress)
    expect(onProgress).toHaveBeenCalledWith(1, 1)
  })

  it('handles empty file list', async () => {
    const parser = {
      parseFile: vi.fn(),
    } as unknown as TreeSitterParser

    const results = await parsePass(parser, [])
    expect(results).toHaveLength(0)
  })
})
