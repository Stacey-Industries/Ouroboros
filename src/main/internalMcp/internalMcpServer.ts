import type { IncomingMessage, ServerResponse } from 'http'
import http from 'http'
import type { AddressInfo } from 'net'

import { findTool,getActiveTools } from './internalMcpTools'
import type { InternalMcpServerHandle,InternalMcpServerOptions } from './internalMcpTypes'

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

function rpcSuccess(id: string | number | null | undefined, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id: id ?? null, result })
}

function rpcError(id: string | number | null | undefined, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
}

// ---------------------------------------------------------------------------
// Read full POST body
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// SSE handler
// ---------------------------------------------------------------------------

function handleSse(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })

  // Send initialized notification immediately
  res.write('data: {"jsonrpc":"2.0","method":"notifications/initialized"}\n\n')

  // Heartbeat every 30 seconds to keep the connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n')
    } catch {
      clearInterval(heartbeat)
    }
  }, 30_000)

  req.on('close', () => {
    clearInterval(heartbeat)
  })
}

// ---------------------------------------------------------------------------
// JSON-RPC handler
// ---------------------------------------------------------------------------

async function parseRpcRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<{ rpc: JsonRpcRequest; id: string | number | null } | null> {
  let body: string
  try {
    body = await readBody(req)
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(rpcError(null, -32700, 'Parse error: could not read request body'))
    return null
  }

  try {
    const rpc = JSON.parse(body) as JsonRpcRequest
    return { rpc, id: rpc.id ?? null }
  } catch {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(rpcError(null, -32700, 'Parse error: invalid JSON'))
    return null
  }
}

async function dispatchRpcMethod(
  rpc: JsonRpcRequest,
  id: string | number | null,
  workspaceRoot: string,
): Promise<string> {
  switch (rpc.method) {
    case 'initialize':
      return rpcSuccess(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'ouroboros', version: '1.0.0' },
      })

    case 'tools/list': {
      const tools = getActiveTools().map((t) => ({
        name: t.name, description: t.description, inputSchema: t.inputSchema,
      }))
      return rpcSuccess(id, { tools })
    }

    case 'tools/call':
      return handleToolCall(rpc, id, workspaceRoot)

    default:
      return rpcError(id, -32601, `Method not found: ${rpc.method}`)
  }
}

async function handleToolCall(
  rpc: JsonRpcRequest,
  id: string | number | null,
  workspaceRoot: string,
): Promise<string> {
  const params = (rpc.params ?? {}) as { name?: string; arguments?: Record<string, unknown> }
  const toolName = params.name
  const toolArgs = params.arguments ?? {}

  if (!toolName) return rpcError(id, -32602, 'Invalid params: missing tool name')

  const tool = findTool(toolName)
  if (!tool) {
    return rpcSuccess(id, { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true })
  }

  try {
    const text = await tool.handler(toolArgs, workspaceRoot)
    return rpcSuccess(id, { content: [{ type: 'text', text }], isError: false })
  } catch (toolErr) {
    const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr)
    return rpcSuccess(id, { content: [{ type: 'text', text: `Error: ${errMsg}` }], isError: true })
  }
}

async function handleJsonRpc(req: IncomingMessage, res: ServerResponse, workspaceRoot: string): Promise<void> {
  const parsed = await parseRpcRequest(req, res)
  if (!parsed) return

  const { rpc, id } = parsed

  try {
    const responseBody = await dispatchRpcMethod(rpc, id, workspaceRoot)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(responseBody)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(rpcError(id, -32603, `Internal error: ${errMsg}`))
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function createRequestHandler(
  workspaceRoot: string,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'GET' && req.url === '/sse') {
      handleSse(req, res)
      return
    }

    if (req.method === 'POST' && req.url === '/message') {
      await handleJsonRpc(req, res, workspaceRoot)
      return
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', server: 'ouroboros', workspaceRoot }))
      return
    }

    res.writeHead(404)
    res.end()
  }
}

export async function startInternalMcpServer(
  options: InternalMcpServerOptions,
): Promise<InternalMcpServerHandle> {
  const { workspaceRoot, port = 0 } = options

  return new Promise((resolve, reject) => {
    const server = http.createServer(createRequestHandler(workspaceRoot))

    server.on('error', (err) => {
      reject(err)
    })

    // Bind to localhost only — never expose to network
    server.listen(port, '127.0.0.1', () => {
      const address = server.address() as AddressInfo
      const actualPort = address.port

      const handle: InternalMcpServerHandle = {
        port: actualPort,
        stop: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => {
              if (err) rej(err)
              else res()
            })
          }),
      }

      resolve(handle)
    })
  })
}
