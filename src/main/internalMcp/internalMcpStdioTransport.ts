/**
 * internalMcpStdioTransport.ts — Wave 53j: SDK-based stdio↔SSE proxy.
 *
 * Built as a standalone Node script (electron-vite entry name
 * `internalMcpStdioTransport`). Claude Code spawns it via
 *   node internalMcpStdioTransport.js <port>
 * when the project's `.mcp.json` declares stdio transport for `ouroboros`.
 *
 * Architecture:
 *
 *   ┌────────────────────┐   stdio JSON-RPC   ┌────────────────┐  HTTP+SSE  ┌────────────────────┐
 *   │ Claude Code (CLI)  │ ─────────────────→ │ this proxy     │ ─────────→ │ IDE main process   │
 *   │ MCP client         │                    │ (Server side)  │            │ internalMcpServer  │
 *   │                    │                    │ (Client side)  │            │ (SDK SSE server)   │
 *   └────────────────────┘                    └────────────────┘            └────────────────────┘
 *
 * Server side: receives stdio JSON-RPC from Claude Code via the SDK's
 *   `StdioServerTransport`. Registers two request handlers (`tools/list`
 *   and `tools/call`) that delegate to the Client side.
 *
 * Client side: connects to the IDE's HTTP+SSE MCP server via the SDK's
 *   `SSEClientTransport`. The SDK handles the endpoint event + sessionId
 *   routing automatically — no hand-rolled wire format.
 *
 * Pre-Wave-53j the bridge hand-rolled content-length JSON-RPC framing and
 * POSTed to `/message` directly. Post-Wave-53h+53i the IDE server requires
 * `?sessionId=...` on every POST and pushes responses on the SSE stream;
 * the hand-rolled bridge couldn't satisfy that contract. This rewrite uses
 * the SDK on both sides — the canonical implementation.
 *
 * stdout is the wire. Logging goes to stderr only; any write to stdout
 * outside the SDK transport corrupts the content-length-framed protocol.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import http from 'http';

import { readPortFileSync } from './internalMcpPortRegistry';

export function logStderr(message: string): void {
  // Always to stderr — stdout is reserved for the SDK's stdio transport.
  process.stderr.write(`[ouroboros-stdio-proxy] ${message}\n`);
}

export function parsePort(arg: string | undefined): number {
  const port = Number.parseInt(arg ?? '', 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`invalid port argument: ${arg}`);
  }
  return port;
}

/**
 * Wave 53l Phase A+ (Fix A): resolve the live internalMcp port. Prefers an
 * explicit `process.argv[2]` (back-compat with pre-Fix-A entries that baked
 * the port into args). Falls back to `~/.claude/internalMcp-port.json` —
 * the registry written by `setInternalMcpPort` on every IDE start. Throws
 * with a clear message when neither source is available so the codemode
 * proxy log shows exactly what's wrong instead of an opaque
 * CONNECTION_CLOSED.
 */
export function resolveLivePort(argv: readonly string[]): number {
  const argPort = argv[2];
  if (argPort !== undefined && argPort.length > 0) {
    return parsePort(argPort);
  }
  const filePort = readPortFileSync();
  if (filePort !== null) return filePort;
  throw new Error(
    'no live internalMcp port found — IDE not running, or ~/.claude/internalMcp-port.json missing. ' +
      'Start the Ouroboros IDE first; the codemode proxy resolves the port at bridge spawn time.',
  );
}

/**
 * Wave 53l Phase A+ (Fix C): probe the server's /health endpoint before
 * the SDK SSE handshake. If the port is bound but the server isn't ready
 * yet, the SSE connect will hang or fail with an opaque CONNECTION_CLOSED.
 * The probe replaces that with a clear stderr line that the codemode
 * proxy log surfaces verbatim.
 */
export function probeHealth(port: number, timeoutMs = 2000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/health',
        method: 'GET',
        timeout: timeoutMs,
      },
      (res) => {
        // Drain the response so the socket can close cleanly.
        res.resume();
        if (res.statusCode === 200) resolve();
        else reject(new Error(`health probe got status ${res.statusCode}`));
      },
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`health probe timed out after ${timeoutMs}ms`));
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

export async function connectClient(port: number): Promise<Client> {
  const client = new Client({ name: 'ouroboros-stdio-proxy', version: '1.0.0' });
  const transport = new SSEClientTransport(new URL(`http://127.0.0.1:${port}/sse`));
  await client.connect(transport);
  return client;
}

export function createProxyServer(client: Client): Server {
  const server = new Server(
    { name: 'ouroboros', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  // Forward tools/list to the SSE client. SDK's `Client.listTools` returns
  // the same `{tools: [...]}` shape the SDK protocol expects, so we pass it
  // through unchanged.
  server.setRequestHandler(ListToolsRequestSchema, async () => client.listTools());

  // Forward tools/call to the SSE client. Pass the request's params
  // straight through; the SDK Client validates the response shape against
  // `CallToolResultSchema` internally.
  server.setRequestHandler(CallToolRequestSchema, async (req) => client.callTool(req.params));

  return server;
}

/** Returns true when this module is the script entry point (CLI invocation),
 *  false when it is being imported (e.g., by vitest). Guards `main()` so tests
 *  that import the module do not auto-spawn the proxy. */
function isScriptEntry(): boolean {
  // process.argv[1] is the script path under both `node script.js` and
  // electron-vite's bundled output. Vitest's loader sets argv[1] to its own
  // worker path, so this check naturally distinguishes the two contexts.
  const entry = process.argv[1] ?? '';
  return entry.includes('internalMcpStdioTransport');
}

async function main(): Promise<void> {
  const port = resolveLivePort(process.argv);
  logStderr(`starting; forwarding stdio→SSE at http://127.0.0.1:${port}`);

  try {
    await probeHealth(port);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `internalMcp /health probe failed (port ${port}): ${msg}. ` +
        'The IDE may have restarted on a different port; relaunch it or check that internalMcpEnabled is true.',
    );
  }

  const client = await connectClient(port);
  const server = createProxyServer(client);

  // Connect server to stdio. After this, the SDK's StdioServerTransport
  // drives shutdown when the parent closes its end of the pipe.
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);

  stdioTransport.onclose = () => {
    logStderr('stdin closed; shutting down');
    void server.close().catch(() => undefined);
    void client.close().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    logStderr('SIGTERM; shutting down');
    process.exit(0);
  });
}

if (isScriptEntry()) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logStderr(`fatal: ${message}`);
    process.exit(1);
  });
}
