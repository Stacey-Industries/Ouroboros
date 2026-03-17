/**
 * useTerminalPersistence — session save/restore via the SerializeAddon.
 *
 * Saves terminal buffer content to `.context/terminal-sessions/{sessionId}.txt`
 * on session exit or app quit. Restores content when a session with a saved
 * file is created (if saved recently, < 24 hours).
 */

import { useCallback, useEffect, useRef } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { SerializeAddon } from '@xterm/addon-serialize'

const MAX_SERIALIZED_LINES = 10_000
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours
const AUTO_SAVE_INTERVAL_MS = 30_000 // 30 seconds

interface SessionMetadata {
  sessionId: string
  cwd: string
  timestamp: number
  lineCount: number
}

interface PersistenceActions {
  saveSession: () => Promise<void>
  restoreSession: () => Promise<boolean>
}

function getSessionDir(projectRoot: string): string {
  return `${projectRoot}/.context/terminal-sessions`
}

function getSessionFilePath(projectRoot: string, sessionId: string): string {
  return `${getSessionDir(projectRoot)}/${sessionId}.txt`
}

function getMetadataFilePath(projectRoot: string, sessionId: string): string {
  return `${getSessionDir(projectRoot)}/${sessionId}.meta.json`
}

async function ensureSessionDir(projectRoot: string): Promise<boolean> {
  try {
    await window.electronAPI.files.mkdir(getSessionDir(projectRoot))
    return true
  } catch {
    return false
  }
}

async function saveSessionToFile(
  serializeAddon: SerializeAddon,
  sessionId: string,
  projectRoot: string,
  cwd: string,
): Promise<void> {
  const dirReady = await ensureSessionDir(projectRoot)
  if (!dirReady) return

  try {
    // Serialize with a scrollback cap to limit storage
    const content = serializeAddon.serialize({ scrollback: MAX_SERIALIZED_LINES })
    if (!content || content.length === 0) return

    const filePath = getSessionFilePath(projectRoot, sessionId)
    const result = await window.electronAPI.files.saveFile(filePath, content)
    if (!result.success) return

    // Save metadata
    const lineCount = content.split('\n').length
    const metadata: SessionMetadata = {
      sessionId,
      cwd,
      timestamp: Date.now(),
      lineCount,
    }
    const metaPath = getMetadataFilePath(projectRoot, sessionId)
    await window.electronAPI.files.saveFile(metaPath, JSON.stringify(metadata, null, 2))
  } catch {
    // Session persistence is best-effort — don't throw
  }
}

async function readSavedSession(
  sessionId: string,
  projectRoot: string,
): Promise<{ content: string; metadata: SessionMetadata } | null> {
  try {
    // Read metadata first to check age
    const metaPath = getMetadataFilePath(projectRoot, sessionId)
    const metaResult = await window.electronAPI.files.readFile(metaPath)
    if (!metaResult.success || !metaResult.content) return null

    const metadata: SessionMetadata = JSON.parse(metaResult.content)
    const age = Date.now() - metadata.timestamp
    if (age > SESSION_MAX_AGE_MS) return null

    // Read content
    const filePath = getSessionFilePath(projectRoot, sessionId)
    const fileResult = await window.electronAPI.files.readFile(filePath)
    if (!fileResult.success || !fileResult.content) return null

    return { content: fileResult.content, metadata }
  } catch {
    return null
  }
}

async function restoreSessionContent(
  terminal: Terminal,
  sessionId: string,
  projectRoot: string,
): Promise<boolean> {
  const saved = await readSavedSession(sessionId, projectRoot)
  if (!saved) return false

  try {
    terminal.write(saved.content)
    // Show a brief "Session restored" message
    terminal.write('\r\n\x1b[90m── Session restored ──\x1b[0m\r\n')
    return true
  } catch {
    return false
  }
}

export function useTerminalPersistence(
  sessionId: string,
  terminalRef: { current: Terminal | null },
  serializeAddonRef: { current: SerializeAddon | null },
  projectRoot: string | null,
  cwd?: string,
): PersistenceActions {
  const projectRootRef = useRef(projectRoot)
  const cwdRef = useRef(cwd ?? '')

  // Keep refs current
  useEffect(() => { projectRootRef.current = projectRoot }, [projectRoot])
  useEffect(() => { cwdRef.current = cwd ?? '' }, [cwd])

  const saveSession = useCallback(async () => {
    const addon = serializeAddonRef.current
    const root = projectRootRef.current
    if (!addon || !root) return

    await saveSessionToFile(addon, sessionId, root, cwdRef.current)
  }, [sessionId, serializeAddonRef])

  const restoreSession = useCallback(async (): Promise<boolean> => {
    const terminal = terminalRef.current
    const root = projectRootRef.current
    if (!terminal || !root) return false

    return restoreSessionContent(terminal, sessionId, root)
  }, [sessionId, terminalRef])

  // Auto-save on PTY exit
  useEffect(() => {
    const cleanup = window.electronAPI.pty.onExit(sessionId, () => {
      void saveSession()
    })
    return cleanup
  }, [sessionId, saveSession])

  // Auto-save on app beforeunload
  useEffect(() => {
    const handler = () => { void saveSession() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [saveSession])

  // Periodic auto-save every 30s — ensures disk is always reasonably current
  // even if beforeunload doesn't complete (async IPC race) or HMR unmount
  // happens without a page unload event.
  useEffect(() => {
    const id = setInterval(() => { void saveSession() }, AUTO_SAVE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [saveSession])

  // Save on React unmount — fires during HMR module replacement, which does
  // NOT trigger beforeunload. This is the only reliable save path for HMR.
  useEffect(() => {
    return () => { void saveSession() }
  }, [saveSession])

  return { saveSession, restoreSession }
}

/** List all saved terminal sessions for a project */
export async function listSavedSessions(projectRoot: string): Promise<SessionMetadata[]> {
  try {
    const dirPath = getSessionDir(projectRoot)
    const result = await window.electronAPI.files.readDir(dirPath)
    if (!result.success || !result.items) return []

    const metaFiles = result.items.filter((item) => item.name.endsWith('.meta.json'))
    const sessions: SessionMetadata[] = []

    for (const metaFile of metaFiles) {
      try {
        const content = await window.electronAPI.files.readFile(metaFile.path)
        if (content.success && content.content) {
          const metadata: SessionMetadata = JSON.parse(content.content)
          const age = Date.now() - metadata.timestamp
          if (age <= SESSION_MAX_AGE_MS) {
            sessions.push(metadata)
          }
        }
      } catch {
        // Skip corrupted metadata files
      }
    }

    return sessions.sort((a, b) => b.timestamp - a.timestamp)
  } catch {
    return []
  }
}
