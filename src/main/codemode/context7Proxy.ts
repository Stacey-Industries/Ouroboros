/**
 * context7Proxy.ts — local stdio shim for the Context7 MCP server.
 *
 * Codemode only multiplexes stdio upstreams. This wrapper turns the hosted
 * Context7 Streamable HTTP MCP endpoint into a stdio server that Codemode can
 * treat like any other local MCP process.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import log from '../logger';
import type { McpToolSchema } from './types';

const CONTEXT7_URL = new URL(process.env.CONTEXT7_URL ?? 'https://mcp.context7.com/mcp');
const CONTEXT7_API_KEY = process.env.CONTEXT7_API_KEY;

function buildTransport(): StreamableHTTPClientTransport {
  if (!CONTEXT7_API_KEY) {
    throw new Error('CONTEXT7_API_KEY is not set');
  }
  return new StreamableHTTPClientTransport(CONTEXT7_URL, {
    requestInit: {
      headers: {
        CONTEXT7_API_KEY,
      },
    },
  });
}

async function connectUpstream(): Promise<{ client: Client; tools: McpToolSchema[] }> {
  const transport = buildTransport();
  const client = new Client({ name: 'context7-stdio-proxy', version: '1.0.0' });

  transport.onerror = (error) => {
    log.error('[context7-proxy] transport error:', error);
  };

  await client.connect(transport);
  const result = await client.listTools();
  return { client, tools: (result.tools ?? []) as McpToolSchema[] };
}

function buildServer(client: Client, tools: McpToolSchema[]): Server {
  const server = new Server(
    { name: 'context7-proxy', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    return client.callTool({ name, arguments: args });
  });

  return server;
}

async function main(): Promise<void> {
  const { client, tools } = await connectUpstream();
  const server = buildServer(client, tools);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  transport.onclose = (): void => {
    void client.close().catch(() => undefined);
    void server.close().catch(() => undefined);
    process.exit(0);
  };
}

void main().catch((err: unknown) => {
  log.error('[context7-proxy] fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
