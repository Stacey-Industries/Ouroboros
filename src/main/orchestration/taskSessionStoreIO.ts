/**
 * taskSessionStoreIO.ts — File I/O primitives for taskSessionStore.
 *
 * Extracted from taskSessionStore.ts to keep that file under 300 lines.
 * All functions operate on a shared sessions directory and normalizer function.
 */
import fs from 'fs/promises'
import path from 'path'

import { hashSessionId, normalizeSessionRecord } from './taskSessionStoreHelpers'
import type { TaskSessionRecord } from './types'

export interface SessionIO {
  sessionsDir: string
  now: () => number
}

export function getSessionFilePath(sessionsDir: string, sessionId: string): string {
  return path.join(sessionsDir, `${hashSessionId(sessionId)}.json`)
}

export async function ensureSessionsDir(sessionsDir: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- sessionsDir is derived from app.getPath('userData') or test override
  await fs.mkdir(sessionsDir, { recursive: true })
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function readSessionFile(
  filePath: string,
  now: () => number,
): Promise<TaskSessionRecord | null> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is getSessionFilePath output; not user-controlled
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as TaskSessionRecord
    return normalizeSessionRecord(parsed, now)
  } catch {
    return null
  }
}

export async function loadAllSessions(
  sessionsDir: string,
  now: () => number,
): Promise<TaskSessionRecord[]> {
  await ensureSessionsDir(sessionsDir)
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- sessionsDir is trusted app directory
  const entries = await fs.readdir(sessionsDir)
  const sessions = await Promise.all(
    entries
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => readSessionFile(path.join(sessionsDir, entry), now)),
  )
  return sessions
    .filter((session): session is TaskSessionRecord => session !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

export interface WriteSessionOptions {
  sessionsDir: string
  maxSessions: number
  now: () => number
  getFilePath: (id: string) => string
}

async function pruneOldSessions(opts: WriteSessionOptions): Promise<void> {
  if (opts.maxSessions <= 0) return
  const sessions = await loadAllSessions(opts.sessionsDir, opts.now)
  if (sessions.length <= opts.maxSessions) return
  await Promise.all(
    sessions.slice(opts.maxSessions).map((session) =>
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- hash-derived path; not user-controlled
      fs.unlink(opts.getFilePath(session.id)).catch(() => undefined),
    ),
  )
}

export async function writeSessionFile(
  opts: WriteSessionOptions,
  session: TaskSessionRecord,
): Promise<TaskSessionRecord> {
  const normalizedSession = normalizeSessionRecord(session, opts.now)
  await ensureSessionsDir(opts.sessionsDir)
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- hash-derived path; not user-controlled
  await fs.writeFile(opts.getFilePath(normalizedSession.id), JSON.stringify(normalizedSession, null, 2), 'utf-8')
  await pruneOldSessions(opts)
  return normalizedSession
}
