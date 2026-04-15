/**
 * editProvenance.test.ts — Unit tests for the edit provenance store.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { closeEditProvenance, createEditProvenanceStore, getEditProvenanceStore, initEditProvenance } from './editProvenance'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-test-'))
}

function cleanDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
}

// ─── createEditProvenanceStore ────────────────────────────────────────────────

describe('createEditProvenanceStore', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { cleanDir(tmpDir) })

  it('returns null provenance for an unknown path', () => {
    const store = createEditProvenanceStore(tmpDir)
    expect(store.getEditProvenance('/some/unknown/file.ts')).toBeNull()
    store.close()
  })

  it('markAgentEdit records a timestamp', () => {
    const before = Date.now()
    const store = createEditProvenanceStore(tmpDir)
    store.markAgentEdit('/repo/src/foo.ts')
    const prov = store.getEditProvenance('/repo/src/foo.ts')
    expect(prov).not.toBeNull()
    expect(prov!.lastAgentEditAt).toBeGreaterThanOrEqual(before)
    expect(prov!.lastUserEditAt).toBe(0)
    store.close()
  })

  it('markUserEdit records a timestamp when no recent agent edit', () => {
    const before = Date.now()
    const store = createEditProvenanceStore(tmpDir)
    store.markUserEdit('/repo/src/bar.ts')
    const prov = store.getEditProvenance('/repo/src/bar.ts')
    expect(prov).not.toBeNull()
    expect(prov!.lastUserEditAt).toBeGreaterThanOrEqual(before)
    expect(prov!.lastAgentEditAt).toBe(0)
    store.close()
  })

  it('markUserEdit is suppressed when agent edited within 2s', () => {
    vi.useFakeTimers()
    try {
      const store = createEditProvenanceStore(tmpDir)
      vi.setSystemTime(1_000_000)
      store.markAgentEdit('/repo/src/baz.ts')

      // 1s later — still within window
      vi.setSystemTime(1_001_000)
      store.markUserEdit('/repo/src/baz.ts')

      const prov = store.getEditProvenance('/repo/src/baz.ts')
      expect(prov!.lastUserEditAt).toBe(0)
      store.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('markUserEdit fires after the 2s window has elapsed', () => {
    vi.useFakeTimers()
    try {
      const store = createEditProvenanceStore(tmpDir)
      vi.setSystemTime(1_000_000)
      store.markAgentEdit('/repo/src/qux.ts')

      // 3s later — outside window
      vi.setSystemTime(1_003_001)
      store.markUserEdit('/repo/src/qux.ts')

      const prov = store.getEditProvenance('/repo/src/qux.ts')
      expect(prov!.lastUserEditAt).toBe(1_003_001)
      store.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('compacts JSONL on load — latest timestamps win per role', () => {
    const jsonlPath = path.join(tmpDir, 'edit-provenance.jsonl')
    // Write two agent edits for the same path — second timestamp should win
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test tmp dir, not user input
    fs.writeFileSync(jsonlPath, [
      JSON.stringify({ path: '/f/a.ts', role: 'agent', ts: 100 }),
      JSON.stringify({ path: '/f/a.ts', role: 'agent', ts: 200 }),
      JSON.stringify({ path: '/f/a.ts', role: 'user',  ts: 150 }),
    ].join('\n') + '\n', 'utf-8')

    const store = createEditProvenanceStore(tmpDir)
    const prov = store.getEditProvenance('/f/a.ts')
    expect(prov!.lastAgentEditAt).toBe(200)
    expect(prov!.lastUserEditAt).toBe(150)
    store.close()
  })

  it('appends new entries to the JSONL file', () => {
    const store = createEditProvenanceStore(tmpDir)
    store.markAgentEdit('/repo/mod.ts')
    store.close()

    const jsonlPath = path.join(tmpDir, 'edit-provenance.jsonl')
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test tmp dir, not user input
    const lines = fs.readFileSync(jsonlPath, 'utf-8').trim().split('\n')
    expect(lines.length).toBe(1)
    const parsed = JSON.parse(lines[0]!) as { path: string; role: string; ts: number }
    expect(parsed.role).toBe('agent')
    expect(parsed.path).toContain('mod.ts')
  })

  it('persists across store re-creation (simulates app restart)', () => {
    const store1 = createEditProvenanceStore(tmpDir)
    store1.markAgentEdit('/repo/persistent.ts')
    store1.close()

    // New store instance reads the same JSONL
    const store2 = createEditProvenanceStore(tmpDir)
    const prov = store2.getEditProvenance('/repo/persistent.ts')
    expect(prov).not.toBeNull()
    expect(prov!.lastAgentEditAt).toBeGreaterThan(0)
    store2.close()
  })

  it('handles malformed JSONL lines gracefully', () => {
    const jsonlPath = path.join(tmpDir, 'edit-provenance.jsonl')
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test tmp dir, not user input
    fs.writeFileSync(jsonlPath, 'not-json\n{"path":"/f/ok.ts","role":"agent","ts":42}\n', 'utf-8')

    const store = createEditProvenanceStore(tmpDir)
    const prov = store.getEditProvenance('/f/ok.ts')
    expect(prov!.lastAgentEditAt).toBe(42)
    store.close()
  })
})

// ─── Module-level singleton ───────────────────────────────────────────────────

describe('singleton (initEditProvenance / getEditProvenanceStore / closeEditProvenance)', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => {
    closeEditProvenance()
    cleanDir(tmpDir)
  })

  it('getEditProvenanceStore returns null before init', () => {
    closeEditProvenance() // ensure clean state
    expect(getEditProvenanceStore()).toBeNull()
  })

  it('returns store after initEditProvenance', () => {
    initEditProvenance(tmpDir)
    expect(getEditProvenanceStore()).not.toBeNull()
  })

  it('returns null after closeEditProvenance', () => {
    initEditProvenance(tmpDir)
    closeEditProvenance()
    expect(getEditProvenanceStore()).toBeNull()
  })
})
