/**
 * Code Mode MCP proxy server — runs as a standalone Node script over stdio.
 *
 * Claude Code CLI spawns this as:  node proxyServer.js <config-path>
 *
 * It connects to upstream MCP servers defined in the config, then exposes a
 * single `execute_code` tool that lets the LLM run TypeScript against those
 * servers in a sandboxed VM.
 */

import fs from 'fs/promises'
import { connectUpstream, parseMessages, McpServerConfig } from './mcpClient'
import { generateTypeDefinitions } from './typeGenerator'
import { executeCode } from './executor'
import type { UpstreamServer } from './types'

// ---------------------------------------------------------------------------
// Logging — always to stderr so stdout stays clean for MCP protocol
// ---------------------------------------------------------------------------

function log(...args: unknown[]): void {
  process.stderr.write(`[codemode-proxy] ${args.map(String).join(' ')}\n`)
}

// ---------------------------------------------------------------------------
// Content-length framed writer
// ---------------------------------------------------------------------------

function writeMessage(msg: object): void {
  const json = JSON.stringify(msg)
  const body = Buffer.from(json, 'utf-8')
  const frame = `Content-Length: ${body.byteLength}\r\n\r\n`
  process.stdout.write(frame)
  process.stdout.write(body)
}

function sendResult(id: number | string, result: unknown): void {
  writeMessage({ jsonrpc: '2.0', id, result })
}

function sendError(id: number | string, code: number, message: string): void {
  writeMessage({ jsonrpc: '2.0', id, error: { code, message } })
}

// ---------------------------------------------------------------------------
// Tool dispatch map builder
// ---------------------------------------------------------------------------

type ToolDispatchMap = Record<string, Record<string, (args: Record<string, unknown>) => Promise<unknown>>>

function buildToolDispatchMap(upstreams: Map<string, UpstreamServer>): ToolDispatchMap {
  const map: ToolDispatchMap = {}
  for (const [name, server] of upstreams) {
    const serverFns: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {}
    for (const tool of server.tools) {
      serverFns[tool.name] = (args: Record<string, unknown>) => server.callTool(tool.name, args)
    }
    map[name] = serverFns
  }
  return map
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

function handleMessage(
  msg: Record<string, unknown>,
  typeDefs: string,
  toolDispatchMap: ToolDispatchMap,
): void {
  const method = msg.method as string | undefined
  const id = msg.id as number | string | undefined
  const params = (msg.params ?? {}) as Record<string, unknown>

  switch (method) {
    case 'initialize': {
      if (id == null) return
      sendResult(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'codemode-proxy', version: '1.0.0' },
      })
      break
    }

    case 'notifications/initialized': {
      log('client initialized')
      break
    }

    case 'tools/list': {
      if (id == null) return
      sendResult(id, {
        tools: [
          {
            name: 'execute_code',
            description:
              'Execute TypeScript code against MCP server APIs.\n\nAvailable API:\n\n' +
              typeDefs +
              '\n\nExample: await servers.github.search_code({ query: "auth" })',
            inputSchema: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description:
                    'JavaScript/TypeScript code to execute. Use the `servers` namespace to call MCP tools.',
                },
              },
              required: ['code'],
            },
          },
        ],
      })
      break
    }

    case 'tools/call': {
      if (id == null) return
      const toolName = params.name as string | undefined
      if (toolName !== 'execute_code') {
        sendError(id, -32601, `Unknown tool: ${toolName}`)
        return
      }
      const args = (params.arguments ?? {}) as Record<string, unknown>
      const code = args.code as string | undefined
      if (!code) {
        sendResult(id, {
          content: [{ type: 'text', text: 'Error: no code provided' }],
          isError: true,
        })
        return
      }

      executeCode(code, toolDispatchMap)
        .then((execResult) => {
          const text = JSON.stringify(
            { success: execResult.success, result: execResult.result, logs: execResult.logs, error: execResult.error },
            null,
            2,
          )
          sendResult(id, {
            content: [{ type: 'text', text }],
            ...(execResult.success ? {} : { isError: true }),
          })
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)
          sendResult(id, {
            content: [{ type: 'text', text: `Execution error: ${message}` }],
            isError: true,
          })
        })
      break
    }

    default: {
      if (id != null) {
        sendError(id, -32601, `Method not found: ${method}`)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const configPath = process.argv[2]
  if (!configPath) {
    log('Usage: node proxyServer.js <config-path>')
    process.exit(1)
  }

  // Read and parse config
  log('reading config from', configPath)
  const configRaw = await fs.readFile(configPath, 'utf-8')
  const config = JSON.parse(configRaw) as {
    servers: Record<string, McpServerConfig>
  }

  const serverEntries = Object.entries(config.servers ?? {})
  log(`connecting to ${serverEntries.length} upstream server(s)`)

  // Connect to upstream servers (tolerate individual failures)
  const upstreams = new Map<string, UpstreamServer>()

  const connectResults = await Promise.allSettled(
    serverEntries.map(async ([name, serverConfig]) => {
      const upstream = await connectUpstream(name, serverConfig)
      return { name, upstream }
    }),
  )

  for (const result of connectResults) {
    if (result.status === 'fulfilled') {
      upstreams.set(result.value.name, result.value.upstream)
      log(`connected: ${result.value.name} (${result.value.upstream.tools.length} tools)`)
    } else {
      log(`WARNING: failed to connect upstream:`, result.reason)
    }
  }

  // Generate type definitions and dispatch map
  const typeDefs = generateTypeDefinitions(upstreams)
  const toolDispatchMap = buildToolDispatchMap(upstreams)

  log(`ready — ${upstreams.size} server(s), type definitions generated`)

  // Listen on stdin for MCP JSON-RPC messages
  let readBuffer = Buffer.alloc(0)

  process.stdin.on('data', (chunk: Buffer) => {
    const { messages, remaining } = parseMessages(chunk, readBuffer)
    readBuffer = remaining

    for (const msg of messages) {
      try {
        handleMessage(msg as Record<string, unknown>, typeDefs, toolDispatchMap)
      } catch (err: unknown) {
        log('error handling message:', err instanceof Error ? err.message : String(err))
      }
    }
  })

  process.stdin.on('end', () => {
    log('stdin closed, shutting down')
    shutdown()
  })

  // Graceful shutdown
  function shutdown(): void {
    log('disposing upstream connections')
    for (const [, server] of upstreams) {
      try {
        server.dispose()
      } catch {
        // best-effort cleanup
      }
    }
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  log('fatal error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
