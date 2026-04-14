/**
 * indexingPipelineSupport.test.ts — Tests for ignore constants and walker helpers.
 */

import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  ALWAYS_IGNORE_DIRS,
  ALWAYS_IGNORE_EXTENSIONS,
  ALWAYS_IGNORE_FILES,
  hashFileContent,
} from './indexingPipelineSupport'

// ─── hashFileContent (xxhash3-128) ────────────────────────────────────────────

describe('hashFileContent', () => {
  let tmpDir: string
  let tmpFile: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xxhash-test-'))
    tmpFile = path.join(tmpDir, 'test.txt')
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('returns a 32-char hex string for known content (regression vector)', async () => {
    await fs.writeFile(tmpFile, 'hello', 'utf-8')
    const hash = await hashFileContent(tmpFile)
    // Deterministic xxh3-128 result for "hello" — lock regression value
    expect(hash).toBe('b5e9c1ad071b3e7fc779cfaa5e523818')
    expect(hash).toHaveLength(32)
  })

  it('returns the same hash for identical content on repeated calls', async () => {
    await fs.writeFile(tmpFile, 'deterministic content', 'utf-8')
    const h1 = await hashFileContent(tmpFile)
    const h2 = await hashFileContent(tmpFile)
    expect(h1).toBe(h2)
  })

  it('returns different hashes for different content', async () => {
    const fileA = path.join(tmpDir, 'a.txt')
    const fileB = path.join(tmpDir, 'b.txt')
    await fs.writeFile(fileA, 'content A', 'utf-8')
    await fs.writeFile(fileB, 'content B', 'utf-8')
    const hA = await hashFileContent(fileA)
    const hB = await hashFileContent(fileB)
    expect(hA).not.toBe(hB)
  })
})

// ─── ALWAYS_IGNORE_DIRS ───────────────────────────────────────────────────────

describe('ALWAYS_IGNORE_DIRS', () => {
  it('contains the baseline dirs', () => {
    expect(ALWAYS_IGNORE_DIRS.has('node_modules')).toBe(true)
    expect(ALWAYS_IGNORE_DIRS.has('.git')).toBe(true)
    expect(ALWAYS_IGNORE_DIRS.has('dist')).toBe(true)
    expect(ALWAYS_IGNORE_DIRS.has('build')).toBe(true)
    expect(ALWAYS_IGNORE_DIRS.has('out')).toBe(true)
  })

  it('contains .next (Next.js output)', () => {
    expect(ALWAYS_IGNORE_DIRS.has('.next')).toBe(true)
  })

  it('contains .turbo (Turborepo cache)', () => {
    expect(ALWAYS_IGNORE_DIRS.has('.turbo')).toBe(true)
  })

  it('contains coverage (test coverage output)', () => {
    expect(ALWAYS_IGNORE_DIRS.has('coverage')).toBe(true)
  })

  it('contains .nuxt', () => {
    expect(ALWAYS_IGNORE_DIRS.has('.nuxt')).toBe(true)
  })

  it('contains __pycache__', () => {
    expect(ALWAYS_IGNORE_DIRS.has('__pycache__')).toBe(true)
  })
})

// ─── ALWAYS_IGNORE_FILES ──────────────────────────────────────────────────────

describe('ALWAYS_IGNORE_FILES', () => {
  it('ignores lock files', () => {
    expect(ALWAYS_IGNORE_FILES.has('package-lock.json')).toBe(true)
    expect(ALWAYS_IGNORE_FILES.has('yarn.lock')).toBe(true)
    expect(ALWAYS_IGNORE_FILES.has('pnpm-lock.yaml')).toBe(true)
  })

  it('ignores OS metadata files', () => {
    expect(ALWAYS_IGNORE_FILES.has('.DS_Store')).toBe(true)
    expect(ALWAYS_IGNORE_FILES.has('Thumbs.db')).toBe(true)
  })
})

// ─── ALWAYS_IGNORE_EXTENSIONS ─────────────────────────────────────────────────

describe('ALWAYS_IGNORE_EXTENSIONS', () => {
  it('ignores image formats', () => {
    expect(ALWAYS_IGNORE_EXTENSIONS.has('png')).toBe(true)
    expect(ALWAYS_IGNORE_EXTENSIONS.has('jpg')).toBe(true)
    expect(ALWAYS_IGNORE_EXTENSIONS.has('svg')).toBe(true)
  })

  it('ignores binary/compiled formats', () => {
    expect(ALWAYS_IGNORE_EXTENSIONS.has('exe')).toBe(true)
    expect(ALWAYS_IGNORE_EXTENSIONS.has('wasm')).toBe(true)
    expect(ALWAYS_IGNORE_EXTENSIONS.has('dll')).toBe(true)
  })

  it('ignores source maps', () => {
    expect(ALWAYS_IGNORE_EXTENSIONS.has('map')).toBe(true)
  })
})
