/**
 * Minimal MCP client - connects to upstream MCP servers over stdio.
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

const HEADER_SEP = Buffer.from('\r\n\r\n')
const TIMEOUT_MS = 30_000

type LogFn = (...args: unknown[]) => void
type SendRequest = (method: string, params?: object) => Promise<unknown>
type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}
type JsonRpcResponse = {
  id?: number
  result?: unknown
  error?: { code: number; message: string }
}

interface ConnectionState {
  dead: boolean
  readBuffer: Buffer
}

interface DisposeUpstreamOptions {
  name: string
  child: ChildProcess
  log: LogFn
  pending: Map<number, PendingRequest>
  state: ConnectionState
}

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
      buf = buf.subarray(sepIdx + HEADER_SEP.length)
      continue
    }

    const contentLen = parseInt(match[1], 10)
    const bodyStart = sepIdx + HEADER_SEP.length
    if (buf.length < bodyStart + contentLen) break

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

function createLogger(name: string): LogFn {
  return (...args) => console.log(`[codemode:${name}]`, ...args)
}

function getCommand(name: string, config: McpServerConfig): string {
  if (config.url) {
    throw new Error('SSE transport not yet implemented')
  }
  if (!config.command) {
    throw new Error(`[codemode:${name}] No command specified in server config`)
  }
  return config.command
}

function requirePipe<T>(pipe: T | null | undefined, name: string, label: string): T {
  if (!pipe) {
    throw new Error(`[codemode:${name}] Missing ${label} pipe`)
  }
  return pipe
}

function spawnUpstreamProcess(
  name: string,
  config: McpServerConfig,
  log: LogFn,
): ChildProcess {
  const command = getCommand(name, config)
  log('spawning', command, config.args ?? [])
  const child = spawn(command, config.args ?? [], {
    env: { ...process.env, ...config.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stderr?.on('data', (data: Buffer) => log('stderr:', data.toString().trimEnd()))
  return child
}

function settlePendingResponse(
  pending: Map<number, PendingRequest>,
  message: JsonRpcResponse,
): void {
  if (message.id == null) return
  const request = pending.get(message.id)
  if (!request) return

  pending.delete(message.id)
  if (message.error) {
    request.reject(new Error(`MCP error ${message.error.code}: ${message.error.message}`))
    return
  }

  request.resolve(message.result)
}

function attachOutputReader(
  stdout: NodeJS.ReadableStream,
  pending: Map<number, PendingRequest>,
  state: ConnectionState,
): void {
  stdout.on('data', (chunk: Buffer) => {
    const { messages, remaining } = parseMessages(chunk, state.readBuffer)
    state.readBuffer = remaining
    for (const message of messages) {
      settlePendingResponse(pending, message as JsonRpcResponse)
    }
  })
}

function attachExitLogger(child: ChildProcess, log: LogFn, state: ConnectionState): void {
  child.on('exit', (code) => {
    state.dead = true
    log('exited with code', code)
  })
}

function createSendRequest(
  name: string,
  stdin: NodeJS.WritableStream,
  pending: Map<number, PendingRequest>,
  isDead: () => boolean,
): SendRequest {
  return (method, params) => {
    if (isDead()) {
      return Promise.reject(new Error(`[codemode:${name}] Server process is dead`))
    }

    const { id, buf } = makeRequest(method, params)
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`[codemode:${name}] Request '${method}' timed out after ${TIMEOUT_MS}ms`))
      }, TIMEOUT_MS)

      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })

      stdin.write(buf)
    })
  }
}

async function initializeUpstream(
  log: LogFn,
  stdin: NodeJS.WritableStream,
  sendRequest: SendRequest,
): Promise<McpToolSchema[]> {
  log('initializing...')
  const initResult = await sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'codemode-proxy', version: '1.0.0' },
  }) as { serverInfo?: { name?: string } }
  log('initialized, server:', initResult?.serverInfo?.name ?? 'unknown')
  stdin.write(makeNotification('notifications/initialized'))
  return listTools(log, sendRequest)
}

async function listTools(log: LogFn, sendRequest: SendRequest): Promise<McpToolSchema[]> {
  log('listing tools...')
  const result = await sendRequest('tools/list', {}) as { tools?: McpToolSchema[] }
  const tools = result?.tools ?? []
  log(`discovered ${tools.length} tool(s):`, tools.map((tool) => tool.name).join(', '))
  return tools
}

function disposeUpstream({
  name,
  child,
  log,
  pending,
  state,
}: DisposeUpstreamOptions): void {
  log('disposing')
  state.dead = true
  for (const [, request] of pending) {
    request.reject(new Error(`[codemode:${name}] Server disposed`))
  }
  pending.clear()
  try {
    child.kill()
  } catch {
    // already dead
  }
}

function createUpstreamServer(
  name: string,
  tools: McpToolSchema[],
  sendRequest: SendRequest,
  dispose: () => void,
): UpstreamServer {
  return {
    name,
    tools,
    async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
      const result = await sendRequest('tools/call', { name: toolName, arguments: args }) as {
        content?: unknown
      }
      return result?.content
    },
    dispose,
  }
}

export async function connectUpstream(
  name: string,
  config: McpServerConfig,
): Promise<UpstreamServer> {
  const log = createLogger(name)
  const child = spawnUpstreamProcess(name, config, log)
  const stdin = requirePipe(child.stdin, name, 'stdin')
  const stdout = requirePipe(child.stdout, name, 'stdout')
  const pending = new Map<number, PendingRequest>()
  const state: ConnectionState = { dead: false, readBuffer: Buffer.alloc(0) }

  attachExitLogger(child, log, state)
  attachOutputReader(stdout, pending, state)

  const sendRequest = createSendRequest(name, stdin, pending, () => state.dead)
  const tools = await initializeUpstream(log, stdin, sendRequest)

  return createUpstreamServer(
    name,
    tools,
    sendRequest,
    () => disposeUpstream({ name, child, log, pending, state }),
  )
}
