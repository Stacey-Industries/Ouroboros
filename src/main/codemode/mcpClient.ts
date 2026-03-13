/**
 * Minimal MCP client — connects to upstream MCP servers over stdio.
 * Uses JSON-RPC 2.0 with content-length framing (no external deps).
 */

import { spawn, ChildProcess } from 'child_process'
import { McpToolSchema, UpstreamServer } from './types'

export interface McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

// ---------------------------------------------------------------------------
// Content-length framed message parser
// ---------------------------------------------------------------------------

const HEADER_SEP = Buffer.from('\r\n\r\n')

export function parseMessages(
  data: Buffer,
  buffer: Buffer,
): { messages: object[]; remaining: Buffer } {
  let buf = Buffer.concat([buffer, data])
  const messages: object[] = []

  while (true) {
    const sepIdx = buf.indexOf(HEADER_SEP)
    if (sepIdx === -1) break

    const header = buf.subarray(0, sepIdx).toString('utf-8')
    const match = /Content-Length:\s*(\d+)/i.exec(header)
    if (!match) {
      // Malformed header — skip past separator and retry
      buf = buf.subarray(sepIdx + HEADER_SEP.length)
      continue
    }

    const contentLen = parseInt(match[1], 10)
    const bodyStart = sepIdx + HEADER_SEP.length

    if (buf.length < bodyStart + contentLen) {
      // Not enough data yet — wait for more
      break
    }

    const body = buf.subarray(bodyStart, bodyStart + contentLen).toString('utf-8')
    buf = buf.subarray(bodyStart + contentLen)

    try {
      messages.push(JSON.parse(body))
    } catch {
      // Skip unparseable payloads
    }
  }

  return { messages, remaining: buf }
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

let nextId = 1

function encodeMessage(msg: object): Buffer {
  const json = JSON.stringify(msg)
  const body = Buffer.from(json, 'utf-8')
  const header = `Content-Length: ${body.byteLength}\r\n\r\n`
  return Buffer.concat([Buffer.from(header, 'ascii'), body])
}

function makeRequest(method: string, params?: object): { id: number; buf: Buffer } {
  const id = nextId++
  const msg = { jsonrpc: '2.0' as const, id, method, ...(params !== undefined ? { params } : {}) }
  return { id, buf: encodeMessage(msg) }
}

function makeNotification(method: string, params?: object): Buffer {
  const msg = { jsonrpc: '2.0' as const, method, ...(params !== undefined ? { params } : {}) }
  return encodeMessage(msg)
}

// ---------------------------------------------------------------------------
// connectUpstream — spawn an MCP server and handshake
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 30_000

export async function connectUpstream(
  name: string,
  config: McpServerConfig,
): Promise<UpstreamServer> {
  const log = (...args: unknown[]) => console.log(`[codemode:${name}]`, ...args)

  if (config.url) {
    throw new Error('SSE transport not yet implemented')
  }

  if (!config.command) {
    throw new Error(`[codemode:${name}] No command specified in server config`)
  }

  log('spawning', config.command, config.args ?? [])

  const child: ChildProcess = spawn(config.command, config.args ?? [], {
    env: { ...process.env, ...config.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  // Forward stderr for debugging
  child.stderr?.on('data', (d: Buffer) => log('stderr:', d.toString().trimEnd()))

  let dead = false
  child.on('exit', (code) => {
    dead = true
    log('exited with code', code)
  })

  // Pending response callbacks keyed by request id
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  let readBuf = Buffer.alloc(0)

  child.stdout!.on('data', (chunk: Buffer) => {
    const { messages, remaining } = parseMessages(chunk, readBuf)
    readBuf = remaining

    for (const msg of messages) {
      const m = msg as { id?: number; result?: unknown; error?: { code: number; message: string } }
      if (m.id != null && pending.has(m.id)) {
        const p = pending.get(m.id)!
        pending.delete(m.id)
        if (m.error) {
          p.reject(new Error(`MCP error ${m.error.code}: ${m.error.message}`))
        } else {
          p.resolve(m.result)
        }
      }
    }
  })

  function sendRequest(method: string, params?: object): Promise<unknown> {
    if (dead) return Promise.reject(new Error(`[codemode:${name}] Server process is dead`))

    const { id, buf } = makeRequest(method, params)
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`[codemode:${name}] Request '${method}' timed out after ${TIMEOUT_MS}ms`))
      }, TIMEOUT_MS)

      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v) },
        reject: (e) => { clearTimeout(timer); reject(e) },
      })

      child.stdin!.write(buf)
    })
  }

  // --- Handshake ---

  log('initializing…')
  const initResult = await sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'codemode-proxy', version: '1.0.0' },
  }) as { capabilities?: object; serverInfo?: { name?: string } }
  log('initialized, server:', initResult?.serverInfo?.name ?? 'unknown')

  // Send initialized notification (no id, no response expected)
  child.stdin!.write(makeNotification('notifications/initialized'))

  // Discover tools
  log('listing tools…')
  const toolsResult = (await sendRequest('tools/list', {})) as { tools?: McpToolSchema[] }
  const tools: McpToolSchema[] = toolsResult?.tools ?? []
  log(`discovered ${tools.length} tool(s):`, tools.map((t) => t.name).join(', '))

  // --- Build UpstreamServer ---

  return {
    name,
    tools,

    async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
      const result = (await sendRequest('tools/call', { name: toolName, arguments: args })) as {
        content?: unknown
      }
      return result?.content
    },

    dispose() {
      log('disposing')
      dead = true
      for (const [, p] of pending) {
        p.reject(new Error(`[codemode:${name}] Server disposed`))
      }
      pending.clear()
      try { child.kill() } catch { /* already dead */ }
    },
  }
}
