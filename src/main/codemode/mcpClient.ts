/**
 * MCP client — connects to upstream MCP servers over stdio using the
 * `@modelcontextprotocol/sdk` Client + StdioClientTransport.
 *
 * Wave 53k Phase D: replaces the hand-rolled JSON-RPC implementation that
 * accumulated three classes of bug across the night (Content-Length framing
 * instead of NDJSON, hand-rolled timeout handling, ad-hoc handshake). The
 * SDK owns wire format, request/response correlation, the initialize
 * handshake, and tools/list / tools/call request shapes. Mirrors
 * `internalMcpStdioTransport.ts` post-Wave-53j.
 *
 * Public surface kept stable for `proxyServer.ts`:
 *   - `connectUpstream(name, config)` returns an `UpstreamServer`.
 *   - `McpServerConfig` shape is unchanged.
 *
 * The `parseMessages` / `encodeMessage` helpers and `TIMEOUT_MS` constant are
 * gone — proxyServer.ts shouldn't import them anymore (the SDK owns the wire
 * for the downstream side too).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import log from '../logger';
import { McpToolSchema, UpstreamServer } from './types';

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

type LogFn = (...args: unknown[]) => void;

function createLogger(name: string): LogFn {
  return (...args) => log.info(`[codemode:${name}]`, ...args);
}

function getCommand(name: string, config: McpServerConfig): string {
  if (config.url) {
    throw new Error(
      `[codemode:${name}] HTTP/SSE transport is not supported by the codemode proxy — ` +
        `HTTP-only servers should be filtered out at the resolveProxiedServerNames boundary`,
    );
  }
  if (!config.command) {
    throw new Error(`[codemode:${name}] No command specified in server config`);
  }
  return config.command;
}

function buildTransport(name: string, config: McpServerConfig): StdioClientTransport {
  const command = getCommand(name, config);
  return new StdioClientTransport({
    command,
    args: config.args ?? [],
    env: { ...(process.env as Record<string, string>), ...(config.env ?? {}) },
    // Capture child stderr so SDK forwards it to ours rather than discarding it.
    stderr: 'pipe',
  });
}

async function listTools(client: Client): Promise<McpToolSchema[]> {
  const result = await client.listTools();
  return (result.tools ?? []) as McpToolSchema[];
}

function createUpstreamServer(
  name: string,
  client: Client,
  tools: McpToolSchema[],
): UpstreamServer {
  return {
    name,
    tools,
    async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
      const result = await client.callTool({ name: toolName, arguments: args });
      // SDK normalizes the response shape to { content, isError, ... }.
      // Pre-Wave-53k-D the hand-roll returned `result.content` directly;
      // preserve that contract so executor.ts and the proxy callers don't
      // need to be aware of the shape change.
      return result.content;
    },
    dispose: () => {
      client.close().catch((err: unknown) => {
        log.warn(`[codemode:${name}] dispose error (ignored):`, err);
      });
    },
  };
}

export async function connectUpstream(
  name: string,
  config: McpServerConfig,
): Promise<UpstreamServer> {
  const logFn = createLogger(name);
  const transport = buildTransport(name, config);

  // Forward upstream stderr to our logger so failures during initialize
  // surface in the proxy log rather than being silently discarded.
  transport.stderr?.on('data', (chunk: Buffer) => {
    logFn('stderr:', chunk.toString('utf-8').trimEnd());
  });

  const client = new Client({ name: 'codemode-proxy', version: '1.0.0' });

  logFn('connecting via SDK StdioClientTransport');
  await client.connect(transport);
  logFn('initialized');

  const tools = await listTools(client);
  logFn(`discovered ${tools.length} tool(s)`);

  return createUpstreamServer(name, client, tools);
}
