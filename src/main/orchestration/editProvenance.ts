/**
 * editProvenance.ts — In-memory ring-buffer tracking agent vs user edit origins.
 *
 * Persisted to {userData}/edit-provenance.jsonl (append-only).
 * Compacted on load: one entry per path per role, latest timestamp wins.
 *
 * Feature flag: context.provenanceTracking (default true — additive).
 *
 * Wave 19 consumes getEditProvenance() to rebalance recent_edit weights.
 */

import fs from 'fs'
import path from 'path'

import log from '../logger'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditProvenance {
  lastAgentEditAt: number
  lastUserEditAt: number
}

export interface EditProvenanceStore {
  markAgentEdit(filePath: string, correlationId?: string): void
  markUserEdit(filePath: string): void
  getEditProvenance(filePath: string): EditProvenance | null
  close(): void
}

// ─── JSONL line format ────────────────────────────────────────────────────────

interface ProvenanceLine {
  path: string
  role: 'agent' | 'user'
  ts: number
  correlationId?: string
}

// ─── Agent-edit debounce window ───────────────────────────────────────────────

/** User edits within this window after an agent edit are suppressed (agent flush). */
const AGENT_EDIT_WINDOW_MS = 2_000

// ─── JSONL persistence ────────────────────────────────────────────────────────

function appendLine(filePath: string, line: ProvenanceLine): void {
  try {
    const text = JSON.stringify(line) + '\n'
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is app.getPath('userData') derived
    fs.appendFileSync(filePath, text, 'utf-8')
  } catch (err) {
    log.warn('[editProvenance] append failed:', err)
  }
}

function applyLine(result: Map<string, EditProvenance>, line: string): void {
  const parsed = JSON.parse(line) as ProvenanceLine
  const norm = path.normalize(parsed.path)
  const entry = result.get(norm) ?? { lastAgentEditAt: 0, lastUserEditAt: 0 }
  if (parsed.role === 'agent' && parsed.ts > entry.lastAgentEditAt) {
    entry.lastAgentEditAt = parsed.ts
  } else if (parsed.role !== 'agent' && parsed.ts > entry.lastUserEditAt) {
    entry.lastUserEditAt = parsed.ts
  }
  result.set(norm, entry)
}

function loadAndCompact(filePath: string): Map<string, EditProvenance> {
  const result = new Map<string, EditProvenance>()
  let raw = ''
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is app.getPath('userData') derived
    raw = fs.readFileSync(filePath, 'utf-8')
  } catch { return result }
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    try { applyLine(result, line) } catch { /* malformed line — skip */ }
  }
  return result
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createEditProvenanceStore(userDataDir: string): EditProvenanceStore {
  const jsonlPath = path.join(userDataDir, 'edit-provenance.jsonl')
  const memory = loadAndCompact(jsonlPath)

  function markAgentEdit(filePath: string, correlationId?: string): void {
    const norm = path.normalize(filePath)
    const entry = memory.get(norm) ?? { lastAgentEditAt: 0, lastUserEditAt: 0 }
    entry.lastAgentEditAt = Date.now()
    memory.set(norm, entry)
    appendLine(jsonlPath, { path: norm, role: 'agent', ts: entry.lastAgentEditAt, correlationId })
    log.info(`[editProvenance] agent edit: ${norm}`)
  }

  function markUserEdit(filePath: string): void {
    const norm = path.normalize(filePath)
    const entry = memory.get(norm) ?? { lastAgentEditAt: 0, lastUserEditAt: 0 }
    const age = Date.now() - entry.lastAgentEditAt
    if (entry.lastAgentEditAt > 0 && age < AGENT_EDIT_WINDOW_MS) {
      log.info(`[editProvenance] suppressed user edit (agent wrote ${age}ms ago): ${norm}`)
      return
    }
    entry.lastUserEditAt = Date.now()
    memory.set(norm, entry)
    appendLine(jsonlPath, { path: norm, role: 'user', ts: entry.lastUserEditAt })
    log.info(`[editProvenance] user edit: ${norm}`)
  }

  function getEditProvenance(filePath: string): EditProvenance | null {
    const norm = path.normalize(filePath)
    return memory.get(norm) ?? null
  }

  function close(): void {
    // JSONL is append-only; no explicit flush needed. Lifecycle hook for future use.
    log.info('[editProvenance] store closed')
  }

  return { markAgentEdit, markUserEdit, getEditProvenance, close }
}

// ─── Module-level singleton ───────────────────────────────────────────────────

let _store: EditProvenanceStore | null = null

export function initEditProvenance(userDataDir: string): void {
  _store = createEditProvenanceStore(userDataDir)
  log.info('[editProvenance] initialized')
}

export function getEditProvenanceStore(): EditProvenanceStore | null {
  return _store
}

export function closeEditProvenance(): void {
  _store?.close()
  _store = null
}
