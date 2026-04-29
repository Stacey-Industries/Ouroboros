/**
 * Code Mode MCP proxy server — runs as a standalone Node script over stdio.
 *
 * Claude Code CLI spawns this as:  node proxyServer.js <config-path>
 *
 * It connects to upstream MCP servers defined in the config, then exposes a
 * single `execute_code` tool that lets the LLM run TypeScript against those
 * servers in a sandboxed VM.
 *
 * Wave 53k Phase D: replaced the hand-rolled JSON-RPC handling
 * (writeMessage / parseMessages / sendResult / handleMessage / etc.) with
 * `@modelcontextprotocol/sdk`'s `Server` + `StdioServerTransport`. The SDK
 * owns the wire format, request/response correlation, and the
 * initialize/notifications/initialized handshake. Mirrors
 * `internalMcpStdioTransport.ts` post-Wave-53j.
 *
 * What this module still owns (CodeMode-specific business logic):
 *   - Reading the proxy config from argv[2]
 *   - Connecting to upstream MCP servers via `mcpClient.connectUpstream`
 *   - Per-upstream startup deadline (`STARTUP_DEADLINE_MS`)
 *   - Aggregating upstream tools and exposing them via the `execute_code`
 *     sandbox (executor.ts) with generated type definitions (typeGenerator.ts)
 *   - Diagnostic logging to `~/.claude/codemode-proxy.log`
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';

import { executeCode } from './executor';
import { connectUpstream, McpServerConfig } from './mcpClient';
import { generateTypeDefinitions } from './typeGenerator';
import type { UpstreamServer } from './types';

// ─── Logging ──────────────────────────────────────────────────────────────────
//
// Always to stderr so stdout stays clean for the SDK's StdioServerTransport.
// ALSO append to `~/.claude/codemode-proxy.log` because Claude Code captures
// the proxy's stderr into a buffer that's not surfaced in the IDE log;
// the file gives us post-mortem visibility without IDE involvement.

const LOG_FILE_PATH = join(homedir(), '.claude', 'codemode-proxy.log');
let logFileReady = false;

function ensureLogFile(): void {
  if (logFileReady) return;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- module-local path under homedir()
    mkdirSync(join(homedir(), '.claude'), { recursive: true });
  } catch {
    /* ignore */
  }
  logFileReady = true;
}

function log(...args: unknown[]): void {
  const line = `[codemode-proxy] ${args.map(String).join(' ')}\n`;
  process.stderr.write(line);
  try {
    ensureLogFile();
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- LOG_FILE_PATH is a module constant under homedir()
    appendFileSync(LOG_FILE_PATH, `${new Date().toISOString()} ${line}`);
  } catch {
    /* swallow — diagnostic only, don't crash the proxy */
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ProxyConfig = { servers: Record<string, McpServerConfig> };
type ConnectedUpstream = { name: string; upstream: UpstreamServer };
type CodeExecutionResult = Awaited<ReturnType<typeof executeCode>>;
type ToolDispatchMap = Record<
  string,
  Record<string, (args: Record<string, unknown>) => Promise<unknown>>
>;

// ─── Tool dispatch map ────────────────────────────────────────────────────────

export function buildToolDispatchMap(upstreams: Map<string, UpstreamServer>): ToolDispatchMap {
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

// ─── execute_code tool descriptor ─────────────────────────────────────────────

export function buildExecuteCodeTool(typeDefs: string): {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
} {
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

// ─── execute_code result formatting ──────────────────────────────────────────

export interface ToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  // SDK's CallToolRequestSchema response is a union whose open-shape branch
  // is `{ [x: string]: unknown; ... }`. Adding the index signature lets our
  // strict shape satisfy that branch without an `as any` cast at the
  // setRequestHandler call site.
  [k: string]: unknown;
}

export function formatExecutionResult(execResult: CodeExecutionResult): ToolCallResult {
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
  return {
    content: [{ type: 'text', text }],
    ...(execResult.success ? {} : { isError: true }),
  };
}

export function formatExecutionFailure(err: unknown): ToolCallResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text', text: `Execution error: ${message}` }],
    isError: true,
  };
}

// ─── Upstream connection orchestration ────────────────────────────────────────

/**
 * Per-upstream startup deadline. Claude Code has its own ~30s timeout for MCP
 * server startup; if any single upstream hangs, our `Promise.allSettled`
 * delays the SDK's "ready" until the slowest one settles. 15s gives us
 * margin within Claude Code's window with room for the second tools/list
 * round-trip on healthy upstreams.
 */
const STARTUP_DEADLINE_MS = 15_000;

async function connectServerEntry([name, serverConfig]: [
  string,
  McpServerConfig,
]): Promise<ConnectedUpstream> {
  const start = Date.now();
  const connection = (async () => {
    const upstream = await connectUpstream(name, serverConfig);
    log(`connected: ${name} (${upstream.tools.length} tools, ${Date.now() - start}ms)`);
    return { name, upstream };
  })();
  const deadline = new Promise<ConnectedUpstream>((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          `[codemode:${name}] startup deadline (${STARTUP_DEADLINE_MS}ms) exceeded — skipping`,
        ),
      );
    }, STARTUP_DEADLINE_MS);
  });
  return Promise.race([connection, deadline]);
}

function collectConnectedUpstreams(
  results: PromiseSettledResult<ConnectedUpstream>[],
): Map<string, UpstreamServer> {
  const upstreams = new Map<string, UpstreamServer>();
  for (const result of results) {
    if (result.status === 'fulfilled') {
      upstreams.set(result.value.name, result.value.upstream);
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

// ─── Server construction ──────────────────────────────────────────────────────

function createProxyServer(upstreams: Map<string, UpstreamServer>, typeDefs: string): Server {
  const server = new Server(
    { name: 'codemode-proxy', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  const toolDispatchMap = buildToolDispatchMap(upstreams);
  const executeCodeTool = buildExecuteCodeTool(typeDefs);

  // tools/list: a single tool — execute_code — with the generated type defs
  // for `servers.<name>.<tool>(...)`.
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [executeCodeTool] }));

  // tools/call: execute_code only. Run the code in the VM sandbox, return
  // structured result content.
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== 'execute_code') {
      throw new Error(`Unknown tool: ${req.params.name}`);
    }
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    const code = args.code as string | undefined;
    if (!code) {
      return {
        content: [{ type: 'text' as const, text: 'Error: no code provided' }],
        isError: true,
      };
    }
    try {
      const execResult = await executeCode(code, toolDispatchMap);
      return formatExecutionResult(execResult);
    } catch (err) {
      return formatExecutionFailure(err);
    }
  });

  return server;
}

// ─── Config loading ───────────────────────────────────────────────────────────

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

// ─── Shutdown ────────────────────────────────────────────────────────────────

function disposeUpstreams(upstreams: Map<string, UpstreamServer>): void {
  log('disposing upstream connections');
  for (const [, server] of upstreams) {
    try {
      server.dispose();
    } catch {
      /* best-effort cleanup */
    }
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

function isScriptEntry(): boolean {
  // process.argv[1] is the script path under both `node script.js` and
  // electron-vite's bundled output. Vitest's loader sets argv[1] to its own
  // worker path, so this check naturally distinguishes the two contexts.
  const entry = process.argv[1] ?? '';
  return entry.includes('proxyServer');
}

async function main(): Promise<void> {
  const config = await readProxyConfig(getConfigPath());
  const upstreams = await connectConfiguredUpstreams(config.servers ?? {});
  const typeDefs = generateTypeDefinitions(upstreams);

  log(`ready — ${upstreams.size} server(s), type definitions generated`);

  const server = createProxyServer(upstreams, typeDefs);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // The SDK transport drives shutdown when Claude Code closes its end of
  // the stdio pipe.
  transport.onclose = (): void => {
    log('stdin closed, shutting down');
    disposeUpstreams(upstreams);
    void server.close().catch(() => undefined);
    process.exit(0);
  };

  const handleSignal = (signal: string): void => {
    log(`${signal}; shutting down`);
    disposeUpstreams(upstreams);
    process.exit(0);
  };
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));
}

if (isScriptEntry()) {
  main().catch((err: unknown) => {
    log('fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
