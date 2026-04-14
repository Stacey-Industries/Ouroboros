import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { watchRecursive } from './nativeWatcher'
import type { WatchEvent } from './nativeWatcher.types'

vi.mock('../logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now()
  while (!predicate() && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 25))
  }
}

async function makeTmpDir(): Promise<string> {
  const dir = path.join(
    os.tmpdir(),
    `nwtest-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path constructed from os.tmpdir()
  await fs.mkdir(dir, { recursive: true })
  // parcel's realpath normalization on macOS/Windows resolves symlinks; do the
  // same here so assertions on event.path match.
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path constructed from os.tmpdir()
  return await fs.realpath(dir)
}

describe('watchRecursive', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await makeTmpDir()
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  it('emits a create event when a file is added at the root', async () => {
    const events: WatchEvent[] = []
    const sub = await watchRecursive(testDir, {}, (e) => events.push(e))
    try {
      const target = path.join(testDir, 'hello.txt')
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path derived from beforeEach tmpdir
      await fs.writeFile(target, 'hi')
      await waitFor(() => events.some((e) => e.path === target), 3000)
      expect(events.some((e) => e.path === target && e.type === 'create')).toBe(
        true,
      )
    } finally {
      await sub.close()
    }
  })

  it('emits events for files added in nested subdirectories (recursive)', async () => {
    const events: WatchEvent[] = []
    const sub = await watchRecursive(testDir, {}, (e) => events.push(e))
    try {
      const deepDir = path.join(testDir, 'a', 'b', 'c')
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path derived from beforeEach tmpdir
      await fs.mkdir(deepDir, { recursive: true })
      const target = path.join(deepDir, 'deep.txt')
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path derived from beforeEach tmpdir
      await fs.writeFile(target, 'deep')
      await waitFor(() => events.some((e) => e.path === target), 3000)
      expect(events.some((e) => e.path === target)).toBe(true)
    } finally {
      await sub.close()
    }
  })

  it('respects ignore globs — matching paths produce no events', async () => {
    const ignoredDir = path.join(testDir, 'skipme')
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path derived from beforeEach tmpdir
    await fs.mkdir(ignoredDir, { recursive: true })
    const events: WatchEvent[] = []
    const sub = await watchRecursive(
      testDir,
      { ignore: ['**/skipme/**'] },
      (e) => events.push(e),
    )
    try {
      const hit = path.join(testDir, 'kept.txt')
      const miss = path.join(ignoredDir, 'ignored.txt')
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture paths derived from beforeEach tmpdir
      await fs.writeFile(miss, 'should not fire')
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture paths derived from beforeEach tmpdir
      await fs.writeFile(hit, 'should fire')
      await waitFor(() => events.some((e) => e.path === hit), 3000)
      expect(events.some((e) => e.path === hit)).toBe(true)
      expect(events.some((e) => e.path === miss)).toBe(false)
    } finally {
      await sub.close()
    }
  })

  it('emits a delete event when a watched file is removed', async () => {
    const target = path.join(testDir, 'doomed.txt')
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path derived from beforeEach tmpdir
    await fs.writeFile(target, 'bye')
    const events: WatchEvent[] = []
    const sub = await watchRecursive(testDir, {}, (e) => events.push(e))
    try {
      // parcel needs a moment to establish the watch before the delete.
      await new Promise((r) => setTimeout(r, 100))
      await fs.rm(target)
      await waitFor(
        () => events.some((e) => e.path === target && e.type === 'delete'),
        3000,
      )
      expect(
        events.some((e) => e.path === target && e.type === 'delete'),
      ).toBe(true)
    } finally {
      await sub.close()
    }
  })

  it('close() is idempotent and does not throw on double-call', async () => {
    const sub = await watchRecursive(testDir, {}, () => {})
    await sub.close()
    // Second close should be swallowed by the wrapper's try/catch.
    await expect(sub.close()).resolves.toBeUndefined()
  })
})
