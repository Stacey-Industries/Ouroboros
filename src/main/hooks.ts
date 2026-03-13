/**
 * hooks.ts - Named pipe / TCP server for Claude Code hook events.
 *
 * Claude Code hook scripts write NDJSON events to this server.
 * Each connected socket represents one Claude Code session (or hook invocation).
 */

import { BrowserWindow } from 'electron'
import net from 'net'
import { clearSessionRules, requestApproval, respondToApproval, toolRequiresApproval } from './approvalManager'
import { getConfigValue } from './config'
import { dispatchActivationEvent } from './extensions'
import { getAllActiveWindows } from './windowManager'

export type HookEventType =
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'agent_start'
  | 'agent_stop'
  | 'agent_end'
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
  requestId?: string
  parentSessionId?: string
  prompt?: string
  model?: string
}

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

const PIPE_NAME = '\\\\.\\pipe\\agent-ide-hooks'
const MAX_BUFFER_BYTES = 1_048_576
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

let connectionCounter = 0
let server: net.Server | null = null
let mainWindow: BrowserWindow | null = null

const pendingQueue: HookPayload[] = []

function isValidPayload(obj: unknown): obj is HookPayload {
  if (!obj || typeof obj !== 'object') {
    return false
  }

  const payload = obj as Record<string, unknown>
  if (typeof payload.sessionId !== 'string' || !payload.sessionId) {
    return false
  }
  if (typeof payload.timestamp !== 'number') {
    return false
  }
  if (typeof payload.type !== 'string' || !VALID_TYPES.has(payload.type)) {
    return false
  }

  return true
}

function isRenderableWindow(window: BrowserWindow | null): window is BrowserWindow {
  return Boolean(window && !window.isDestroyed())
}

function queuePendingPayload(payload: HookPayload): void {
  console.log(`[hooks] queuing event (no window): ${payload.type} session=${payload.sessionId}`)
  if (pendingQueue.length < MAX_PENDING_QUEUE) {
    pendingQueue.push(payload)
  }
}

function getDispatchWindows(): BrowserWindow[] {
  const activeWindows = getAllActiveWindows().filter((window) => !window.isDestroyed())
  if (activeWindows.length > 0) {
    return activeWindows
  }
  return isRenderableWindow(mainWindow) ? [mainWindow] : []
}

function sendPayload(windows: BrowserWindow[], payload: HookPayload): void {
  for (const window of windows) {
    window.webContents.send('hooks:event', payload)
  }
}

function flushPendingQueue(windows: BrowserWindow[]): void {
  if (pendingQueue.length === 0) {
    return
  }

  const flushing = pendingQueue.splice(0)
  for (const payload of flushing) {
    sendPayload(windows, payload)
  }
}

function dispatchLifecycleEvent(payload: HookPayload): void {
  if (payload.type === 'session_start') {
    dispatchActivationEvent('onSessionStart', { sessionId: payload.sessionId }).catch(() => {})
    return
  }

  if (payload.type === 'session_stop' || payload.type === 'agent_stop' || payload.type === 'agent_end') {
    dispatchActivationEvent('onSessionEnd', { sessionId: payload.sessionId }).catch(() => {})
  }
}

function handleApprovalRequest(payload: HookPayload): void {
  if (payload.type !== 'pre_tool_use' || !payload.toolName || !payload.requestId) {
    return
  }

  if (!toolRequiresApproval(payload.toolName, payload.sessionId)) {
    respondToApproval(payload.requestId, { decision: 'approve' })
    return
  }

  requestApproval({
    requestId: payload.requestId,
    toolName: payload.toolName,
    toolInput: (payload.input ?? {}) as Record<string, unknown>,
    sessionId: payload.sessionId,
    timestamp: payload.timestamp,
  })
}

function clearApprovalRulesForEndedSession(payload: HookPayload): void {
  if (payload.type === 'agent_stop' || payload.type === 'agent_end') {
    clearSessionRules(payload.sessionId)
  }
}

function dispatchToRenderer(payload: HookPayload): void {
  const windows = getDispatchWindows()
  if (windows.length === 0) {
    queuePendingPayload(payload)
    return
  }

  flushPendingQueue(windows)
  console.log(`[hooks] dispatching to ${windows.length} renderer(s): ${payload.type} session=${payload.sessionId} tool=${payload.toolName ?? ''}`)
  sendPayload(windows, payload)
  dispatchLifecycleEvent(payload)
  handleApprovalRequest(payload)
  clearApprovalRulesForEndedSession(payload)
}

function parseHookLine(line: string, connId: number): HookPayload | null {
  try {
    const parsed = JSON.parse(line)
    if (!isValidPayload(parsed)) {
      console.warn(`[hooks] #${connId} invalid payload shape - skipping`, JSON.stringify(parsed))
      return null
    }

    console.log(`[hooks] #${connId} valid payload: type=${parsed.type} session=${parsed.sessionId}`)
    return parsed
  } catch {
    console.warn(`[hooks] #${connId} malformed JSON - skipping line`)
    return null
  }
}

function processSocketChunk(socket: net.Socket, connId: number, rawBuffer: string, chunk: string): string {
  const nextBuffer = rawBuffer + chunk
  if (Buffer.byteLength(nextBuffer, 'utf8') > MAX_BUFFER_BYTES) {
    console.warn(`[hooks] #${connId} buffer overflow - dropping connection`)
    socket.destroy()
    return ''
  }

  let buffer = nextBuffer
  let newlineIndex = buffer.indexOf('\n')
  while (newlineIndex !== -1) {
    const line = buffer.slice(0, newlineIndex).trim()
    buffer = buffer.slice(newlineIndex + 1)

    if (line) {
      const payload = parseHookLine(line, connId)
      if (payload) {
        dispatchToRenderer(payload)
      }
    }

    newlineIndex = buffer.indexOf('\n')
  }

  return buffer
}

function handleSocket(socket: net.Socket, connId: number): void {
  console.log(`[hooks] connection #${connId} opened`)

  let rawBuffer = ''
  socket.setEncoding('utf8')
  socket.setTimeout(60_000)

  socket.on('data', (chunk: string) => {
    rawBuffer = processSocketChunk(socket, connId, rawBuffer, chunk)
  })
  socket.on('timeout', () => {
    socket.end()
  })
  socket.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EPIPE' && error.code !== 'ECONNRESET') {
      console.error(`[hooks] #${connId} socket error: ${error.message}`)
    }
  })
  socket.on('close', () => {
    console.log(`[hooks] connection #${connId} closed`)
  })
}

function createNetServer(): net.Server {
  const nextServer = net.createServer((socket) => handleSocket(socket, ++connectionCounter))
  nextServer.maxConnections = 64
  return nextServer
}

function listenPipe(nextServer: net.Server, pipePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    nextServer.once('error', reject)
    nextServer.listen(pipePath, () => {
      nextServer.removeListener('error', reject)
      resolve()
    })
  })
}

function listenTcp(nextServer: net.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    nextServer.once('error', reject)
    nextServer.listen(port, '127.0.0.1', () => {
      nextServer.removeListener('error', reject)
      resolve()
    })
  })
}

function flushPendingQueueToWindow(window: BrowserWindow): void {
  if (pendingQueue.length === 0 || window.isDestroyed()) {
    return
  }

  const flushing = pendingQueue.splice(0)
  for (const payload of flushing) {
    window.webContents.send('hooks:event', payload)
  }
}

export async function startHooksServer(window: BrowserWindow): Promise<{ port: number | string }> {
  mainWindow = window
  window.webContents.on('did-finish-load', () => {
    flushPendingQueueToWindow(window)
  })

  if (server) {
    const address = server.address()
    const port = typeof address === 'string' ? address : (address as net.AddressInfo).port
    return { port }
  }

  if (process.platform === 'win32') {
    const pipeServer = createNetServer()
    try {
      await listenPipe(pipeServer, PIPE_NAME)
      server = pipeServer
      console.log(`[hooks] listening on named pipe ${PIPE_NAME}`)
      return { port: PIPE_NAME }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      console.warn(`[hooks] named pipe unavailable (${nodeError.code ?? 'unknown'}) - falling back to TCP`)
      pipeServer.close()
    }
  }

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

export function getHooksAddress(): string | null {
  if (!server) {
    return null
  }

  const address = server.address()
  if (!address) {
    return null
  }
  if (typeof address === 'string') {
    return address
  }
  return `127.0.0.1:${address.port}`
}
