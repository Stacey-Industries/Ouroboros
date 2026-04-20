/**
 * indexingPipelineIncremental.test.ts — Smoke tests for discoverFiles and filterChangedFiles.
 */

import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { discoverFiles, filterChangedFiles } from './indexingPipelineIncremental'
import type { DiscoveredFile } from './indexingPipelineTypes'

vi.mock('../logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Mock hashFileContent so filterChangedFiles tests don't require real files on disk.
vi.mock('./indexingPipelineSupport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./indexingPipelineSupport')>()
  return {
    ...actual,
    hashFileContent: vi.fn().mockResolvedValue('mockedhash000000000000000000000000'),
  }
})

// ─── discoverFiles ────────────────────────────────────────────────────────────

describe('discoverFiles', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'idx-incr-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('returns discovered .ts files in the project root', async () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture
    await fs.writeFile(path.join(tmpDir, 'index.ts'), 'export const x = 1', 'utf-8')
    const files = await discoverFiles(tmpDir, { projectRoot: tmpDir })
    expect(files.length).toBeGreaterThan(0)
    expect(files.some((f) => f.relativePath === 'index.ts')).toBe(true)
  })

  it('returns an empty array for an empty directory', async () => {
    const files = await discoverFiles(tmpDir, { projectRoot: tmpDir })
    expect(files).toEqual([])
  })

  it('caps results at maxFiles — stops recursing into subdirectories past cap', async () => {
    // Create two subdirectories each with one file.
    // With maxFiles=1, the second subdir should not be visited.
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture
    await fs.mkdir(path.join(tmpDir, 'a'))
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture
    await fs.mkdir(path.join(tmpDir, 'b'))
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture
    await fs.writeFile(path.join(tmpDir, 'a', 'file1.ts'), 'export const a = 1', 'utf-8')
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture
    await fs.writeFile(path.join(tmpDir, 'b', 'file2.ts'), 'export const b = 2', 'utf-8')
    const files = await discoverFiles(tmpDir, { projectRoot: tmpDir, maxFiles: 1 })
    // With cap=1, second subdir is skipped via the early-return guard.
    expect(files.length).toBeLessThanOrEqual(1)
  })

  it('sets absolutePath, relativePath, sizeBytes, and mtimeMs on each file', async () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture
    await fs.writeFile(path.join(tmpDir, 'hello.ts'), 'const z = 0', 'utf-8')
    const files = await discoverFiles(tmpDir, { projectRoot: tmpDir })
    const f = files.find((x) => x.relativePath === 'hello.ts')
    expect(f).toBeDefined()
    expect(f!.absolutePath).toContain('hello.ts')
    expect(f!.sizeBytes).toBeGreaterThan(0)
    expect(f!.mtimeMs).toBeGreaterThan(0)
  })
})

// ─── filterChangedFiles ───────────────────────────────────────────────────────

function makeFile(relativePath: string, override: Partial<DiscoveredFile> = {}): DiscoveredFile {
  return {
    absolutePath: `/tmp/${relativePath}`,
    relativePath,
    extension: relativePath.split('.').pop() ?? 'ts',
    sizeBytes: 100,
    mtimeMs: 1_000_000,
    ...override,
  }
}

describe('filterChangedFiles', () => {
  it('classifies all files as changed when the db has no records', async () => {
    const db = {
      getFileHash: vi.fn().mockReturnValue(null),
      upsertFileHash: vi.fn(),
    } as unknown as import('./graphDatabase').GraphDatabase

    const files = [makeFile('src/a.ts'), makeFile('src/b.ts')]
    const result = await filterChangedFiles(db, 'proj', files)
    expect(result.changed).toHaveLength(2)
    expect(result.unchanged).toHaveLength(0)
  })

  it('classifies file as unchanged-stat when mtime and size match', async () => {
    const file = makeFile('src/a.ts', { sizeBytes: 200, mtimeMs: 2_000_000 })
    const db = {
      getFileHash: vi.fn().mockReturnValue({
        mtime_ns: Math.floor(file.mtimeMs * 1e6),
        size: file.sizeBytes,
        content_hash: 'abc123',
      }),
      upsertFileHash: vi.fn(),
    } as unknown as import('./graphDatabase').GraphDatabase

    const result = await filterChangedFiles(db, 'proj', [file])
    expect(result.unchanged).toContain('src/a.ts')
    expect(result.changed).toHaveLength(0)
    // stat match — no hash computed, no upsert needed
    expect(db.upsertFileHash).not.toHaveBeenCalled()
  })

  it('returns changed files that have no prior hash record', async () => {
    const db = {
      getFileHash: vi.fn().mockReturnValue(null),
      upsertFileHash: vi.fn(),
    } as unknown as import('./graphDatabase').GraphDatabase

    const result = await filterChangedFiles(db, 'proj', [makeFile('src/new.ts')])
    expect(result.changed.map((f) => f.relativePath)).toContain('src/new.ts')
  })
})
