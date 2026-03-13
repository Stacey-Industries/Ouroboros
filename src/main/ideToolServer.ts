/**
 * ideToolServer.ts — JSON-RPC-like tool server over named pipe / Unix socket.
 *
 * This is the REVERSE channel: Claude Code hook scripts can connect and query
 * the IDE for context (open files, editor state, git status, diagnostics, etc.).
 *
 * Protocol: newline-delimited JSON (NDJSON), one request per connection.
 *   Request:  { "id": "<uuid>", "method": "ide.getOpenFiles", "params": {} }
 *   Response: { "id": "<uuid>", "result": [...] }
 *             or { "id": "<uuid>", "error": { "code": -1, "message": "..." } }
 *
 * Windows:  \\.\pipe\ouroboros-tools
 * Unix:     /tmp/ouroboros-tools.sock
 */

import net from 'net'
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { BrowserWindow } from 'electron'
import { getAllActiveWindows } from './windowManager'
import { getDiagnostics } from './lsp'
import { getActiveSessions } from './pty'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ToolRequest {
  id: string
  method: string
  params?: Record<string, unknown>
}

export interface ToolResponse {
  id: string
  result?: unknown
  error?: { code: number; message: string }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PIPE_NAME = '\\\\.\\pipe\\ouroboros-tools'
const UNIX_SOCKET_PATH = '/tmp/ouroboros-tools.sock'
const MAX_BUFFER_BYTES = 1_048_576 // 1 MB per connection
const REQUEST_TIMEOUT_MS = 10_000  // 10 s timeout for renderer queries

// ─── Module state ────────────────────────────────────────────────────────────

let server: net.Server | null = null
let connectionCounter = 0

/** Pending renderer queries — resolved when the renderer responds via IPC. */
const pendingRendererQueries = new Map<string, {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}>()

// ─── Renderer query system ───────────────────────────────────────────────────

let queryIdCounter = 0

/**
 * Send a query to the renderer and await a response.
 * The renderer listens for `ide:query` events and responds via `ide:queryResponse`.
 */
function queryRenderer(method: string, params?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const windows = getAllActiveWindows()
    if (windows.length === 0) {
      reject(new Error('No active renderer window'))
      return
    }

    const queryId = `ideq_${++queryIdCounter}_${Date.now()}`
    const win = windows[0] // Query the first active window

    const timer = setTimeout(() => {
      pendingRendererQueries.delete(queryId)
      reject(new Error(`Renderer query timed out: ${method}`))
    }, REQUEST_TIMEOUT_MS)

    pendingRendererQueries.set(queryId, { resolve, reject, timer })

    if (!win.isDestroyed()) {
      win.webContents.send('ide:query', { queryId, method, params })
    } else {
      clearTimeout(timer)
      pendingRendererQueries.delete(queryId)
      reject(new Error('Renderer window is destroyed'))
    }
  })
}

/**
 * Called from IPC when the renderer responds to a query.
 */
export function handleRendererQueryResponse(
  queryId: string,
  result: unknown,
  error?: string
): void {
  const pending = pendingRendererQueries.get(queryId)
  if (!pending) return

  clearTimeout(pending.timer)
  pendingRendererQueries.delete(queryId)

  if (error) {
    pending.reject(new Error(error))
  } else {
    pending.resolve(result)
  }
}

// ─── Git status helper ───────────────────────────────────────────────────────

function execGitStatus(cwd?: string): Promise<Record<string, unknown>> {
  const workdir = cwd || process.cwd()
  return new Promise((resolve) => {
    execFile(
      'git',
      ['status', '--porcelain=v1', '-uall'],
      { cwd: workdir, timeout: 10_000, maxBuffer: 512 * 1024 },
      (err, stdout) => {
        if (err) {
          resolve({ error: err.message, files: {} })
          return
        }
        const files: Record<string, string> = {}
        for (const line of stdout.split('\n')) {
          if (!line.trim()) continue
          const status = line.substring(0, 2).trim()
          const filePath = line.substring(3).trim()
          if (filePath) files[filePath] = status
        }

        // Also get current branch
        execFile(
          'git',
          ['branch', '--show-current'],
          { cwd: workdir, timeout: 5_000 },
          (branchErr, branchOut) => {
            resolve({
              branch: branchErr ? 'unknown' : branchOut.trim(),
              files,
              cwd: workdir,
            })
          }
        )
      }
    )
  })
}

// ─── Tool handlers ───────────────────────────────────────────────────────────

const toolHandlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {

  'ide.getOpenFiles': async () => {
    return await queryRenderer('getOpenFiles')
  },

  'ide.getActiveFile': async () => {
    return await queryRenderer('getActiveFile')
  },

  'ide.getFileContent': async (params) => {
    const filePath = params.path as string
    if (!filePath) throw new Error('Missing required param: path')

    // Check renderer first for unsaved edits
    try {
      const unsaved = await queryRenderer('getUnsavedContent', { path: filePath })
      if (unsaved) return { path: filePath, content: unsaved, unsaved: true }
    } catch {
      // Renderer doesn't have unsaved content — read from disk
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return { path: filePath, content, unsaved: false }
    } catch (err) {
      throw new Error(`Cannot read file: ${(err as Error).message}`)
    }
  },

  'ide.getGitStatus': async (params) => {
    const cwd = params.cwd as string | undefined
    return await execGitStatus(cwd)
  },

  'ide.getSelection': async () => {
    return await queryRenderer('getSelection')
  },

  'ide.getProjectInfo': async () => {
    return await queryRenderer('getProjectInfo')
  },

  'ide.getDiagnostics': async (params) => {
    const filePath = params.path as string | undefined
    if (filePath) {
      // Get project root from renderer
      let root: string
      try {
        const info = await queryRenderer('getProjectInfo') as { root?: string }
        root = info?.root || path.dirname(filePath)
      } catch {
        root = path.dirname(filePath)
      }
      const result = getDiagnostics(root, filePath)
      return result
    }
    // No path — return all diagnostics from renderer
    return await queryRenderer('getAllDiagnostics')
  },

  'ide.getTerminalOutput': async (params) => {
    const sessionId = params.sessionId as string | undefined
    const lines = (params.lines as number) || 50
    return await queryRenderer('getTerminalOutput', { sessionId, lines })
  },

  'ide.getActiveSessions': async () => {
    return getActiveSessions()
  },

  'ide.ping': async () => {
    return { status: 'ok', timestamp: Date.now(), version: 'ouroboros-tools/1.0' }
  },
}

// ─── Request handler ─────────────────────────────────────────────────────────

async function handleRequest(request: ToolRequest): Promise<ToolResponse> {
  const { id, method, params } = request

  const handler = toolHandlers[method]
  if (!handler) {
    return {
      id,
      error: {
        code: -32601,
        message: `Unknown method: ${method}. Available: ${Object.keys(toolHandlers).join(', ')}`,
      },
    }
  }

  try {
    const result = await handler(params ?? {})
    return { id, result }
  } catch (err) {
    return {
      id,
      error: {
        code: -1,
        message: (err as Error).message || String(err),
      },
    }
  }
}

// ─── Per-connection handler ──────────────────────────────────────────────────

function handleSocket(socket: net.Socket, connId: number): void {
  console.log(`[ide-tools] connection #${connId} opened`)

  let rawBuffer = ''

  socket.setEncoding('utf8')
  socket.setTimeout(30_000) // 30s idle timeout

  socket.on('data', (chunk: string) => {
    rawBuffer += chunk

    if (Buffer.byteLength(rawBuffer, 'utf8') > MAX_BUFFER_BYTES) {
      console.warn(`[ide-tools] #${connId} buffer overflow — dropping connection`)
      socket.destroy()
      rawBuffer = ''
      return
    }

    // Process complete lines
    let nlIdx: number
    while ((nlIdx = rawBuffer.indexOf('\n')) !== -1) {
      const line = rawBuffer.slice(0, nlIdx).trim()
      rawBuffer = rawBuffer.slice(nlIdx + 1)

      if (!line) continue

      let parsed: ToolRequest
      try {
        parsed = JSON.parse(line) as ToolRequest
      } catch {
        const errResponse: ToolResponse = {
          id: 'unknown',
          error: { code: -32700, message: 'Parse error: invalid JSON' },
        }
        socket.write(JSON.stringify(errResponse) + '\n')
        continue
      }

      if (!parsed.id || !parsed.method) {
        const errResponse: ToolResponse = {
          id: parsed.id || 'unknown',
          error: { code: -32600, message: 'Invalid request: missing id or method' },
        }
        socket.write(JSON.stringify(errResponse) + '\n')
        continue
      }

      console.log(`[ide-tools] #${connId} request: ${parsed.method}`)

      // Handle request asynchronously, write response
      handleRequest(parsed)
        .then((response) => {
          if (!socket.destroyed) {
            socket.write(JSON.stringify(response) + '\n')
          }
        })
        .catch((err) => {
          if (!socket.destroyed) {
            const errResponse: ToolResponse = {
              id: parsed.id,
              error: { code: -1, message: (err as Error).message },
            }
            socket.write(JSON.stringify(errResponse) + '\n')
          }
        })
    }
  })

  socket.on('timeout', () => {
    socket.end()
  })

  socket.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
      console.error(`[ide-tools] #${connId} socket error: ${err.message}`)
    }
  })

  socket.on('close', () => {
    console.log(`[ide-tools] connection #${connId} closed`)
  })
}

// ─── Server helpers ──────────────────────────────────────────────────────────

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

function listenUnix(s: net.Server, socketPath: string): Promise<void> {
  // Remove stale socket file if it exists
  try {
    fs.unlinkSync(socketPath)
  } catch {
    // File doesn't exist — fine
  }
  return new Promise((resolve, reject) => {
    s.once('error', reject)
    s.listen(socketPath, () => {
      s.removeListener('error', reject)
      resolve()
    })
  })
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function startIdeToolServer(): Promise<{ address: string }> {
  if (server) {
    const addr = server.address()
    const address = typeof addr === 'string' ? addr : `${(addr as net.AddressInfo).address}:${(addr as net.AddressInfo).port}`
    return { address }
  }

  if (process.platform === 'win32') {
    // Windows: named pipe
    const pipeServer = createNetServer()
    try {
      await listenPipe(pipeServer, PIPE_NAME)
      server = pipeServer
      console.log(`[ide-tools] listening on named pipe ${PIPE_NAME}`)
      return { address: PIPE_NAME }
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException
      console.warn(`[ide-tools] named pipe unavailable (${nodeErr.code ?? 'unknown'})`)
      pipeServer.close()
      throw err
    }
  } else {
    // macOS/Linux: Unix socket
    const unixServer = createNetServer()
    try {
      await listenUnix(unixServer, UNIX_SOCKET_PATH)
      server = unixServer
      console.log(`[ide-tools] listening on Unix socket ${UNIX_SOCKET_PATH}`)
      return { address: UNIX_SOCKET_PATH }
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException
      console.warn(`[ide-tools] Unix socket unavailable (${nodeErr.code ?? 'unknown'})`)
      unixServer.close()
      throw err
    }
  }
}

export function stopIdeToolServer(): Promise<void> {
  return new Promise((resolve) => {
    // Clean up pending renderer queries
    for (const [, pending] of pendingRendererQueries) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Tool server shutting down'))
    }
    pendingRendererQueries.clear()

    if (!server) {
      resolve()
      return
    }
    server.close(() => {
      server = null
      console.log('[ide-tools] server stopped')

      // Clean up Unix socket file
      if (process.platform !== 'win32') {
        try {
          fs.unlinkSync(UNIX_SOCKET_PATH)
        } catch {
          // Already gone
        }
      }

      resolve()
    })
  })
}

/** Returns the address the tool server is listening on, or null if not started. */
export function getIdeToolServerAddress(): string | null {
  if (!server) return null
  const addr = server.address()
  if (!addr) return null
  if (typeof addr === 'string') return addr
  return `${(addr as net.AddressInfo).address}:${(addr as net.AddressInfo).port}`
}
