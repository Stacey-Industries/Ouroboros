/**
 * internalMcpStdioTransport.ts — stdio JSON-RPC adapter for the internal MCP server.
 *
 * Wave 51 Phase B (Option 2). This module is built as a standalone Node script
 * (see `internalMcpStdioTransport` entry in electron.vite.config.ts). Claude
 * Code spawns it with `node internalMcpStdioTransport.js <port>`; it speaks
 * MCP-over-stdio with content-length framing, and forwards every `tools/list`
 * and `tools/call` request to `http://127.0.0.1:<port>/message` — the same
 * endpoint the SSE server already serves.
 *
 * Design notes:
 *   - The graph state lives in the Electron main process, so the stdio wrapper
 *     cannot serve tool calls itself. It is a thin protocol bridge.
 *   - `initialize` is answered locally — the response is static and saves a
 *     round-trip on the hottest path of every spawn.
 *   - stdin close ⇒ exit 0. The wrapper holds no resources.
 *   - All logging goes to stderr; stdout is the wire and any stray write
 *     corrupts the content-length-framed protocol.
 *
 * The HTTP loopback target may be either `internalMcpServer` (default) or
 * `mcpHostMain` (when `useMcpHost === true`). Both register their port via
 * `setInternalMcpPort()`, so the wrapper is agnostic to which one is active.
 */

import { Buffer } from 'buffer';

const HEADER_SEP = Buffer.from('\r\n\r\n');
const REQUEST_TIMEOUT_MS = 30_000;

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

interface ParseResult {
  messages: JsonRpcMessage[];
  remaining: Buffer;
}

// ─── Framing ────────────────────────────────────────────────────────────────

export function parseFrames(data: Buffer, buffer: Buffer): ParseResult {
  let buf = Buffer.concat([buffer, data]);
  const messages: JsonRpcMessage[] = [];

  while (true) {
    const sepIdx = buf.indexOf(HEADER_SEP);
    if (sepIdx === -1) break;

    const header = buf.subarray(0, sepIdx).toString('utf-8');
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      buf = buf.subarray(sepIdx + HEADER_SEP.length);
      continue;
    }

    const contentLen = parseInt(match[1], 10);
    const bodyStart = sepIdx + HEADER_SEP.length;
    if (buf.length < bodyStart + contentLen) break;

    const body = buf.subarray(bodyStart, bodyStart + contentLen).toString('utf-8');
    buf = buf.subarray(bodyStart + contentLen);

    try {
      messages.push(JSON.parse(body) as JsonRpcMessage);
    } catch {
      // Skip unparseable payloads — the upstream peer will retry.
    }
  }

  return { messages, remaining: buf };
}

export function encodeFrame(msg: JsonRpcMessage): Buffer {
  const json = JSON.stringify(msg);
  const body = Buffer.from(json, 'utf-8');
  const header = `Content-Length: ${body.byteLength}\r\n\r\n`;
  return Buffer.concat([Buffer.from(header, 'ascii'), body]);
}

// ─── HTTP forwarding ─────────────────────────────────────────────────────────

export interface ForwardOptions {
  port: number;
  message: JsonRpcMessage;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function forwardToHttp(opts: ForwardOptions): Promise<JsonRpcMessage> {
  const url = `http://127.0.0.1:${opts.port}/message`;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts.message),
      signal: controller.signal,
    });
    const text = await response.text();
    return JSON.parse(text) as JsonRpcMessage;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Local handlers ──────────────────────────────────────────────────────────

function buildInitializeResult(id: string | number | null | undefined): JsonRpcMessage {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'ouroboros-stdio', version: '1.0.0' },
    },
  };
}

function buildErrorResponse(
  id: string | number | null | undefined,
  code: number,
  message: string,
): JsonRpcMessage {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

export interface DispatchDeps {
  port: number;
  fetchImpl?: typeof fetch;
  logErr?: (msg: string, err?: unknown) => void;
}

export async function dispatchMessage(
  msg: JsonRpcMessage,
  deps: DispatchDeps,
): Promise<JsonRpcMessage | null> {
  // Notifications carry no id and expect no response.
  if (msg.id === undefined || msg.id === null) {
    if (msg.method === undefined) return null;
    // Forward best-effort; ignore result.
    void forwardToHttp({ port: deps.port, message: msg, fetchImpl: deps.fetchImpl }).catch((err) =>
      deps.logErr?.('notification forward failed', err),
    );
    return null;
  }

  if (msg.method === 'initialize') return buildInitializeResult(msg.id);

  try {
    return await forwardToHttp({
      port: deps.port,
      message: msg,
      fetchImpl: deps.fetchImpl,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    deps.logErr?.('http forward failed', err);
    return buildErrorResponse(msg.id, -32603, `Internal error: ${errMsg}`);
  }
}

// ─── Loop driver ─────────────────────────────────────────────────────────────

export interface RunStdioTransportOptions {
  port: number;
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  fetchImpl?: typeof fetch;
  logErr?: (msg: string, err?: unknown) => void;
}

export interface StdioTransportHandle {
  /** Resolves when stdin closes. */
  done: Promise<void>;
}

function writeResponse(
  response: JsonRpcMessage,
  stdout: NodeJS.WritableStream,
  logErr: (m: string, e?: unknown) => void,
): void {
  try {
    stdout.write(encodeFrame(response));
  } catch (err) {
    logErr('stdout write failed', err);
  }
}

function makeMessageHandler(opts: RunStdioTransportOptions): (msg: JsonRpcMessage) => void {
  const logErr = opts.logErr ?? (() => undefined);
  return (msg) => {
    void dispatchMessage(msg, {
      port: opts.port,
      fetchImpl: opts.fetchImpl,
      logErr,
    }).then((response) => {
      if (response) writeResponse(response, opts.stdout, logErr);
    });
  };
}

export function runStdioTransport(opts: RunStdioTransportOptions): StdioTransportHandle {
  const handle = makeMessageHandler(opts);
  let buffer: Buffer = Buffer.alloc(0);

  const done = new Promise<void>((resolve) => {
    opts.stdin.on('data', (chunk: Buffer) => {
      const parsed = parseFrames(chunk, buffer);
      buffer = parsed.remaining as Buffer;
      for (const message of parsed.messages) handle(message);
    });
    opts.stdin.on('end', () => resolve());
    opts.stdin.on('close', () => resolve());
  });

  return { done };
}

// ─── Entrypoint (when executed as a Node script) ─────────────────────────────

function logStderr(msg: string, err?: unknown): void {
  const detail = err instanceof Error ? err.message : err !== undefined ? String(err) : '';
  process.stderr.write(`[ouroboros-stdio] ${msg}${detail ? `: ${detail}` : ''}\n`);
}

async function mainEntry(): Promise<void> {
  const portArg = process.argv[2];
  const port = portArg ? parseInt(portArg, 10) : NaN;
  if (!Number.isFinite(port) || port <= 0) {
    logStderr('missing or invalid port argument; usage: node internalMcpStdioTransport.js <port>');
    process.exit(2);
  }

  logStderr(`starting; forwarding to http://127.0.0.1:${port}/message`);

  const handle = runStdioTransport({
    port,
    stdin: process.stdin,
    stdout: process.stdout,
    logErr: logStderr,
  });

  await handle.done;
  logStderr('stdin closed; exiting');
  process.exit(0);
}

// Only run when invoked directly, not when imported by tests.
if (require.main === module) {
  void mainEntry();
}
