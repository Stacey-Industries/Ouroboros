/**
 * hooks.ts — Named pipe / TCP server for Claude Code hook events.
 *
 * Claude Code hook scripts write NDJSON events to this server.
 * Each connected socket represents one Claude Code session (or hook invocation).
 *
 * Protocol: newline-delimited JSON (NDJSON)
 * Windows primary:   named pipe  \\.\pipe\agent-ide-hooks
 * Fallback (any OS): TCP on localhost:<hooksServerPort> (default 3333)
 *
 * HookPayload schema:
 *   { type, sessionId, toolName?, input?, output?, taskLabel?, durationMs?, timestamp }
 */

import net from 'net'
import { BrowserWindow } from 'electron'
import { getConfigValue } from './config'
import { getAllActiveWindows } from './windowManager'

// ─── Public types ─────────────────────────────────────────────────────────────

export type HookEventType =
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'agent_start'
  | 'agent_stop'
  | 'session_start'
  | 'session_stop'

export interface HookPayload {
  type: HookEventType
  sessionId: string
  toolName?: string
  input?: unknown
  output?: unknown
  taskLabel?: string
  durationMs?: number
  timestamp: number
}

// Keep the old AgentEvent interface for any existing renderer code that references it.
export interface AgentEvent {
  type: 'tool_call' | 'tool_result' | 'message' | 'error' | 'status'
  sessionId?: string
  agentId?: string
  timestamp: number
  payload: unknown
}

export interface ToolCallEvent extends AgentEvent {
  type: 'tool_call'
  payload: {
    tool: string
    input: Record<string, unknown>
    callId: string
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PIPE_NAME = '\\\\.\\pipe\\agent-ide-hooks'
const MAX_BUFFER_BYTES = 1_048_576 // 1 MB per connection — drop if exceeded
const MAX_PENDING_QUEUE = 500

const VALID_TYPES = new Set<string>([
  'pre_tool_use',
  'post_tool_use',
  'agent_start',
  'agent_stop',
  'agent_end',
  'session_start',
  'session_stop'
])

// ─── Module state ─────────────────────────────────────────────────────────────

let connectionCounter = 0
let server: net.Server | null = null
let mainWindow: BrowserWindow | null = null

/** Events buffered while the renderer window is not yet ready. */
const pendingQueue: HookPayload[] = []

// ─── Validation ───────────────────────────────────────────────────────────────

function isValidPayload(obj: unknown): obj is HookPayload {
  if (!obj || typeof obj !== 'object') return false
  const p = obj as Record<string, unknown>

  if (typeof p.sessionId !== 'string' || !p.sessionId) return false
  if (typeof p.timestamp !== 'number') return false
  if (typeof p.type !== 'string' || !VALID_TYPES.has(p.type)) return false

  return true
}

// ─── Dispatch to renderer ─────────────────────────────────────────────────────

function dispatchToRenderer(payload: HookPayload): void {
  // Get all active windows from the window manager
  const activeWindows = getAllActiveWindows()

  if (activeWindows.length === 0) {
    // Fallback: check the mainWindow reference
    const win = mainWindow
    if (!win || win.isDestroyed()) {
      console.log(`[hooks] queuing event (no window): ${payload.type} session=${payload.sessionId}`)
      if (pendingQueue.length < MAX_PENDING_QUEUE) {
        pendingQueue.push(payload)
      }
      return
    }
  }

  // Flush buffered events first, in order
  if (pendingQueue.length > 0) {
    const flushing = pendingQueue.splice(0)
    for (const p of flushing) {
      for (const win of activeWindows) {
        if (!win.isDestroyed()) win.webContents.send('hooks:event', p)
      }
    }
  }

  console.log(`[hooks] dispatching to ${activeWindows.length} renderer(s): ${payload.type} session=${payload.sessionId} tool=${payload.toolName ?? ''}`)
  for (const win of activeWindows) {
    if (!win.isDestroyed()) win.webContents.send('hooks:event', payload)
  }
}

// ─── Per-connection NDJSON handler ────────────────────────────────────────────

function handleSocket(socket: net.Socket, connId: number): void {
  console.log(`[hooks] connection #${connId} opened`)

  let rawBuffer = ''

  socket.setEncoding('utf8')
  socket.setTimeout(60_000) // 60 s idle timeout — hook scripts are short-lived

  socket.on('data', (chunk: string) => {
    rawBuffer += chunk

    // Guard against runaway buffers
    if (Buffer.byteLength(rawBuffer, 'utf8') > MAX_BUFFER_BYTES) {
      console.warn(`[hooks] #${connId} buffer overflow — dropping connection`)
      socket.destroy()
      rawBuffer = ''
      return
    }

    // Process every complete (newline-terminated) line
    let nlIdx: number
    while ((nlIdx = rawBuffer.indexOf('\n')) !== -1) {
      const line = rawBuffer.slice(0, nlIdx).trim()
      rawBuffer = rawBuffer.slice(nlIdx + 1)

      if (!line) continue

      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        console.warn(`[hooks] #${connId} malformed JSON — skipping line`)
        continue
      }

      if (!isValidPayload(parsed)) {
        console.warn(`[hooks] #${connId} invalid payload shape — skipping`, JSON.stringify(parsed))
        continue
      }

      console.log(`[hooks] #${connId} valid payload: type=${(parsed as Record<string,unknown>)['type']} session=${(parsed as Record<string,unknown>)['sessionId']}`)
      dispatchToRenderer(parsed)
    }
  })

  socket.on('timeout', () => {
    socket.end()
  })

  socket.on('error', (err: NodeJS.ErrnoException) => {
    // EPIPE / ECONNRESET happen when Claude Code exits mid-hook — not errors we care about
    if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
      console.error(`[hooks] #${connId} socket error: ${err.message}`)
    }
  })

  socket.on('close', () => {
    console.log(`[hooks] connection #${connId} closed`)
  })
}

// ─── Server helpers ───────────────────────────────────────────────────────────

function createNetServer(): net.Server {
  const s = net.createServer((socket) => handleSocket(socket, ++connectionCounter))
  s.maxConnections = 64
  return s
}

function listenPipe(s: net.Server, pipePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    s.once('error', reject)
    s.listen(pipePath, () => {
      s.removeListener('error', reject)
      resolve()
    })
  })
}

function listenTcp(s: net.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    s.once('error', reject)
    s.listen(port, '127.0.0.1', () => {
      s.removeListener('error', reject)
      resolve()
    })
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startHooksServer(win: BrowserWindow): Promise<{ port: number | string }> {
  mainWindow = win

  // Flush the pending queue once the renderer finishes loading
  win.webContents.on('did-finish-load', () => {
    if (pendingQueue.length > 0) {
      const flushing = pendingQueue.splice(0)
      for (const p of flushing) {
        if (!win.isDestroyed()) win.webContents.send('hooks:event', p)
      }
    }
  })

  if (server) {
    const addr = server.address()
    const port = typeof addr === 'string' ? addr : (addr as net.AddressInfo).port
    return { port }
  }

  // 1. Try named pipe (Windows)
  if (process.platform === 'win32') {
    const pipeServer = createNetServer()
    try {
      await listenPipe(pipeServer, PIPE_NAME)
      server = pipeServer
      console.log(`[hooks] listening on named pipe ${PIPE_NAME}`)
      return { port: PIPE_NAME }
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException
      console.warn(`[hooks] named pipe unavailable (${nodeErr.code ?? 'unknown'}) — falling back to TCP`)
      pipeServer.close()
    }
  }

  // 2. TCP fallback (also used on macOS / Linux)
  const port = getConfigValue('hooksServerPort') as number
  const tcpServer = createNetServer()
  await listenTcp(tcpServer, port)
  server = tcpServer
  console.log(`[hooks] TCP server listening on 127.0.0.1:${port}`)
  return { port }
}

export function stopHooksServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve()
      return
    }
    server.close(() => {
      server = null
      console.log('[hooks] server stopped')
      resolve()
    })
  })
}

/** Returns the active server address string, or null if not yet started. */
export function getHooksAddress(): string | null {
  if (!server) return null
  const addr = server.address()
  if (!addr) return null
  if (typeof addr === 'string') return addr
  return `127.0.0.1:${(addr as net.AddressInfo).port}`
}
