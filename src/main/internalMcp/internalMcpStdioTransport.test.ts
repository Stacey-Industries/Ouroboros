/**
 * internalMcpStdioTransport.test.ts — Wave 51 Phase B.
 *
 * Covers framing, the local `initialize` shortcut, HTTP forwarding for
 * `tools/list` and `tools/call`, error propagation, and stdin lifecycle.
 */

import { Buffer } from 'buffer';
import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';

import {
  dispatchMessage,
  encodeFrame,
  forwardToHttp,
  parseFrames,
  runStdioTransport,
} from './internalMcpStdioTransport';

// ─── Helpers ────────────────────────────────────────────────────────────────

function frameOf(obj: unknown): Buffer {
  const json = JSON.stringify(obj);
  const body = Buffer.from(json, 'utf-8');
  const header = `Content-Length: ${body.byteLength}\r\n\r\n`;
  return Buffer.concat([Buffer.from(header, 'ascii'), body]);
}

function makeStdin(): EventEmitter & { push: (b: Buffer) => void; end: () => void } {
  const ee = new EventEmitter() as EventEmitter & { push: (b: Buffer) => void; end: () => void };
  ee.push = (b: Buffer) => ee.emit('data', b);
  ee.end = () => ee.emit('end');
  return ee;
}

interface CapturedWrite {
  bytes: Buffer;
}

function makeStdout(): { stdout: NodeJS.WritableStream; writes: CapturedWrite[] } {
  const writes: CapturedWrite[] = [];
  const stdout = {
    write: (chunk: string | Buffer) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf-8') : chunk;
      writes.push({ bytes: buf });
      return true;
    },
  } as unknown as NodeJS.WritableStream;
  return { stdout, writes };
}

function decodeAllFrames(writes: CapturedWrite[]): unknown[] {
  const all = Buffer.concat(writes.map((w) => w.bytes));
  const out: unknown[] = [];
  let buf = all;
  while (true) {
    const sep = buf.indexOf(Buffer.from('\r\n\r\n'));
    if (sep === -1) break;
    const header = buf.subarray(0, sep).toString('utf-8');
    const m = /Content-Length:\s*(\d+)/i.exec(header);
    if (!m) break;
    const len = parseInt(m[1], 10);
    const start = sep + 4;
    if (buf.length < start + len) break;
    out.push(JSON.parse(buf.subarray(start, start + len).toString('utf-8')));
    buf = buf.subarray(start + len);
  }
  return out;
}

// ─── parseFrames / encodeFrame ──────────────────────────────────────────────

describe('framing', () => {
  it('round-trips a single message', () => {
    const msg = { jsonrpc: '2.0' as const, id: 1, method: 'ping' };
    const frame = encodeFrame(msg);
    const { messages, remaining } = parseFrames(frame, Buffer.alloc(0));
    expect(messages).toEqual([msg]);
    expect(remaining.length).toBe(0);
  });

  it('parses two messages in one chunk', () => {
    const a = { jsonrpc: '2.0' as const, id: 1, method: 'a' };
    const b = { jsonrpc: '2.0' as const, id: 2, method: 'b' };
    const data = Buffer.concat([encodeFrame(a), encodeFrame(b)]);
    const { messages, remaining } = parseFrames(data, Buffer.alloc(0));
    expect(messages).toEqual([a, b]);
    expect(remaining.length).toBe(0);
  });

  it('buffers a partial frame across chunks', () => {
    const msg = { jsonrpc: '2.0' as const, id: 7, method: 'split' };
    const frame = encodeFrame(msg);
    const half = Math.floor(frame.length / 2);
    const first = parseFrames(frame.subarray(0, half), Buffer.alloc(0));
    expect(first.messages).toEqual([]);
    const second = parseFrames(frame.subarray(half), first.remaining);
    expect(second.messages).toEqual([msg]);
  });

  it('skips unparseable JSON without breaking the stream', () => {
    const garbage = Buffer.from('Content-Length: 4\r\n\r\n{bad', 'utf-8');
    const good = encodeFrame({ jsonrpc: '2.0', id: 1, method: 'ok' });
    const { messages } = parseFrames(Buffer.concat([garbage, good]), Buffer.alloc(0));
    expect(messages).toHaveLength(1);
    expect((messages[0] as { method?: string }).method).toBe('ok');
  });
});

// ─── forwardToHttp ──────────────────────────────────────────────────────────

describe('forwardToHttp', () => {
  it('POSTs the message body to /message and returns parsed JSON', async () => {
    const fakeFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
      const body = JSON.parse(init?.body as string) as { method?: string };
      expect(body.method).toBe('tools/list');
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: [] } }), {
        status: 200,
      });
    });
    const result = await forwardToHttp({
      port: 12345,
      message: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ id: 1, result: { tools: [] } });
    expect(fakeFetch).toHaveBeenCalledWith('http://127.0.0.1:12345/message', expect.any(Object));
  });
});

// ─── dispatchMessage ────────────────────────────────────────────────────────

describe('dispatchMessage', () => {
  it('answers initialize locally without calling fetch', async () => {
    const fakeFetch = vi.fn();
    const out = await dispatchMessage(
      { jsonrpc: '2.0', id: 9, method: 'initialize' },
      { port: 1, fetchImpl: fakeFetch as unknown as typeof fetch },
    );
    expect(fakeFetch).not.toHaveBeenCalled();
    expect(out?.id).toBe(9);
    expect((out?.result as { serverInfo?: { name?: string } })?.serverInfo?.name).toBe(
      'ouroboros-stdio',
    );
  });

  it('forwards tools/list via fetch', async () => {
    const tools = [{ name: 'search_graph', description: 'x', inputSchema: {} }];
    const fakeFetch = vi.fn(
      async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools } })),
    );
    const out = await dispatchMessage(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { port: 1, fetchImpl: fakeFetch as unknown as typeof fetch },
    );
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect((out?.result as { tools: unknown[] }).tools).toEqual(tools);
  });

  it('forwards tools/call and propagates the result content', async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            result: { content: [{ type: 'text', text: 'ok' }] },
          }),
        ),
    );
    const out = await dispatchMessage(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'search_graph', arguments: { q: 'foo' } },
      },
      { port: 1, fetchImpl: fakeFetch as unknown as typeof fetch },
    );
    expect((out?.result as { content: { text: string }[] }).content[0].text).toBe('ok');
  });

  it('returns a JSON-RPC error on fetch failure', async () => {
    const fakeFetch = vi.fn(async () => {
      throw new Error('connection refused');
    });
    const out = await dispatchMessage(
      { jsonrpc: '2.0', id: 4, method: 'tools/list' },
      { port: 1, fetchImpl: fakeFetch as unknown as typeof fetch },
    );
    expect(out?.error?.code).toBe(-32603);
    expect(out?.error?.message).toContain('connection refused');
    expect(out?.id).toBe(4);
  });

  it('returns null for notifications (no id)', async () => {
    const fakeFetch = vi.fn(async () => new Response('{}'));
    const out = await dispatchMessage(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { port: 1, fetchImpl: fakeFetch as unknown as typeof fetch },
    );
    expect(out).toBeNull();
  });
});

// ─── runStdioTransport (end-to-end framing → fetch → response) ──────────────

describe('runStdioTransport', () => {
  it('handles initialize then tools/list and exits when stdin ends', async () => {
    const stdin = makeStdin();
    const { stdout, writes } = makeStdout();

    const fakeFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 't' }] } })),
    );

    const handle = runStdioTransport({
      port: 5000,
      stdin: stdin as unknown as NodeJS.ReadableStream,
      stdout,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    stdin.push(frameOf({ jsonrpc: '2.0', id: 1, method: 'initialize' }));
    stdin.push(frameOf({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));

    // Yield twice so async dispatches resolve.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    stdin.end();
    await handle.done;

    const decoded = decodeAllFrames(writes) as Array<{
      id: number;
      result?: { serverInfo?: { name?: string }; tools?: unknown[] };
    }>;

    expect(decoded).toHaveLength(2);
    const init = decoded.find((m) => m.id === 1);
    const list = decoded.find((m) => m.id === 2);
    expect(init?.result?.serverInfo?.name).toBe('ouroboros-stdio');
    expect(list?.result?.tools).toEqual([{ name: 't' }]);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('does not crash on malformed frames', async () => {
    const stdin = makeStdin();
    const { stdout, writes } = makeStdout();
    const fakeFetch = vi.fn(async () => new Response('{}'));

    const handle = runStdioTransport({
      port: 5000,
      stdin: stdin as unknown as NodeJS.ReadableStream,
      stdout,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    stdin.push(Buffer.from('garbage without headers'));
    stdin.push(frameOf({ jsonrpc: '2.0', id: 1, method: 'initialize' }));
    await new Promise((r) => setImmediate(r));
    stdin.end();
    await handle.done;

    expect(writes.length).toBeGreaterThan(0);
  });
});
