/**
 * Code Mode MCP proxy server â€” runs as a standalone Node script over stdio.
 *
 * Claude Code CLI spawns this as:  node proxyServer.js <config-path>
 *
 * It connects to upstream MCP servers defined in the config, then exposes a
 * single `execute_code` tool that lets the LLM run TypeScript against those
 * servers in a sandboxed VM.
 */

import fs from 'fs/promises';

import { executeCode } from './executor';
import { connectUpstream, McpServerConfig, parseMessages } from './mcpClient';
import { generateTypeDefinitions } from './typeGenerator';
import type { UpstreamServer } from './types';

// ---------------------------------------------------------------------------
// Logging â€” always to stderr so stdout stays clean for MCP protocol
// ---------------------------------------------------------------------------

function log(...args: unknown[]): void {
  process.stderr.write(`[codemode-proxy] ${args.map(String).join(' ')}\n`);
}

// ---------------------------------------------------------------------------
// Content-length framed writer
// ---------------------------------------------------------------------------

type JsonRpcId = number | string;
type ProxyConfig = { servers: Record<string, McpServerConfig> };
type ConnectedUpstream = { name: string; upstream: UpstreamServer };
type CodeExecutionResult = Awaited<ReturnType<typeof executeCode>>;

function writeMessage(msg: object): void {
  const json = JSON.stringify(msg);
  const body = Buffer.from(json, 'utf-8');
  const frame = `Content-Length: ${body.byteLength}\r\n\r\n`;
  process.stdout.write(frame);
  process.stdout.write(body);
}

function sendResult(id: JsonRpcId, result: unknown): void {
  writeMessage({ jsonrpc: '2.0', id, result });
}

function sendError(id: JsonRpcId, code: number, message: string): void {
  writeMessage({ jsonrpc: '2.0', id, error: { code, message } });
}

// ---------------------------------------------------------------------------
// Tool dispatch map builder
// ---------------------------------------------------------------------------

type ToolDispatchMap = Record<
  string,
  Record<string, (args: Record<string, unknown>) => Promise<unknown>>
>;

function buildToolDispatchMap(upstreams: Map<string, UpstreamServer>): ToolDispatchMap {
  const map: ToolDispatchMap = {};
  for (const [name, server] of upstreams) {
    const serverFns: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {};
    for (const tool of server.tools) {
      serverFns[tool.name] = (args: Record<string, unknown>) => server.callTool(tool.name, args);
    }
    // eslint-disable-next-line security/detect-object-injection -- name is always a validated MCP server name from config
    map[name] = serverFns;
  }
  return map;
}

function sendInitializeResult(id: JsonRpcId): void {
  sendResult(id, {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    serverInfo: { name: 'codemode-proxy', version: '1.0.0' },
  });
}

function buildExecuteCodeTool(typeDefs: string): Record<string, unknown> {
  return {
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
  };
}

function sendToolsList(id: JsonRpcId, typeDefs: string): void {
  sendResult(id, { tools: [buildExecuteCodeTool(typeDefs)] });
}

function sendMissingCodeResult(id: JsonRpcId): void {
  sendResult(id, {
    content: [{ type: 'text', text: 'Error: no code provided' }],
    isError: true,
  });
}

function sendExecutionResult(id: JsonRpcId, execResult: CodeExecutionResult): void {
  const text = JSON.stringify(
    {
      success: execResult.success,
      result: execResult.result,
      logs: execResult.logs,
      error: execResult.error,
    },
    null,
    2,
  );

  sendResult(id, {
    content: [{ type: 'text', text }],
    ...(execResult.success ? {} : { isError: true }),
  });
}

function sendExecutionFailure(id: JsonRpcId, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  sendResult(id, {
    content: [{ type: 'text', text: `Execution error: ${message}` }],
    isError: true,
  });
}

function handleToolsCall(
  id: JsonRpcId,
  params: Record<string, unknown>,
  toolDispatchMap: ToolDispatchMap,
): void {
  const toolName = params.name as string | undefined;
  if (toolName !== 'execute_code') {
    sendError(id, -32601, `Unknown tool: ${toolName}`);
    return;
  }

  const args = (params.arguments ?? {}) as Record<string, unknown>;
  const code = args.code as string | undefined;
  if (!code) {
    sendMissingCodeResult(id);
    return;
  }

  executeCode(code, toolDispatchMap)
    .then((execResult) => {
      sendExecutionResult(id, execResult);
    })
    .catch((err: unknown) => {
      sendExecutionFailure(id, err);
    });
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

function handleMessage(
  msg: Record<string, unknown>,
  typeDefs: string,
  toolDispatchMap: ToolDispatchMap,
): void {
  const method = msg.method as string | undefined;
  const id = msg.id as JsonRpcId | undefined;
  const params = (msg.params ?? {}) as Record<string, unknown>;

  if (method === 'initialize') {
    if (id != null) sendInitializeResult(id);
    return;
  }

  if (method === 'notifications/initialized') {
    log('client initialized');
    return;
  }

  if (method === 'tools/list') {
    if (id != null) sendToolsList(id, typeDefs);
    return;
  }

  if (method === 'tools/call') {
    if (id != null) handleToolsCall(id, params, toolDispatchMap);
    return;
  }

  if (id != null) {
    sendError(id, -32601, `Method not found: ${method}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function getConfigPath(): string {
  const configPath = process.argv[2];
  if (configPath) return configPath;
  log('Usage: node proxyServer.js <config-path>');
  process.exit(1);
}

async function readProxyConfig(configPath: string): Promise<ProxyConfig> {
  log('reading config from', configPath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- configPath comes from process.argv (trusted startup argument)
  const configRaw = await fs.readFile(configPath, 'utf-8');
  return JSON.parse(configRaw) as ProxyConfig;
}

async function connectServerEntry([name, serverConfig]: [
  string,
  McpServerConfig,
]): Promise<ConnectedUpstream> {
  const upstream = await connectUpstream(name, serverConfig);
  return { name, upstream };
}

function collectConnectedUpstreams(
  results: PromiseSettledResult<ConnectedUpstream>[],
): Map<string, UpstreamServer> {
  const upstreams = new Map<string, UpstreamServer>();

  for (const result of results) {
    if (result.status === 'fulfilled') {
      upstreams.set(result.value.name, result.value.upstream);
      log(`connected: ${result.value.name} (${result.value.upstream.tools.length} tools)`);
      continue;
    }

    log('WARNING: failed to connect upstream:', result.reason);
  }

  return upstreams;
}

async function connectConfiguredUpstreams(
  servers: Record<string, McpServerConfig>,
): Promise<Map<string, UpstreamServer>> {
  const serverEntries = Object.entries(servers);
  log(`connecting to ${serverEntries.length} upstream server(s)`);
  const results = await Promise.allSettled(serverEntries.map(connectServerEntry));
  return collectConnectedUpstreams(results);
}

function registerMessageHandler(typeDefs: string, toolDispatchMap: ToolDispatchMap): void {
  let readBuffer: Buffer = Buffer.alloc(0);

  process.stdin.on('data', (chunk: Buffer) => {
    const { messages, remaining } = parseMessages(chunk, readBuffer);
    readBuffer = remaining;

    for (const msg of messages) {
      try {
        handleMessage(msg as Record<string, unknown>, typeDefs, toolDispatchMap);
      } catch (err: unknown) {
        log('error handling message:', err instanceof Error ? err.message : String(err));
      }
    }
  });
}

function createShutdown(upstreams: Map<string, UpstreamServer>): () => void {
  return () => {
    log('disposing upstream connections');
    for (const [, server] of upstreams) {
      try {
        server.dispose();
      } catch {
        // best-effort cleanup
      }
    }
    process.exit(0);
  };
}

function registerShutdownHandlers(shutdown: () => void): void {
  process.stdin.on('end', () => {
    log('stdin closed, shutting down');
    shutdown();
  });

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

async function main(): Promise<void> {
  const config = await readProxyConfig(getConfigPath());
  const upstreams = await connectConfiguredUpstreams(config.servers ?? {});
  const typeDefs = generateTypeDefinitions(upstreams);
  const toolDispatchMap = buildToolDispatchMap(upstreams);

  log(`ready â€” ${upstreams.size} server(s), type definitions generated`);

  registerMessageHandler(typeDefs, toolDispatchMap);
  registerShutdownHandlers(createShutdown(upstreams));
}

main().catch((err) => {
  log('fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
