/**
 * mcpClient.test.ts — Wave 53k Phase D.
 *
 * Post-SDK-adoption: the wire format, request correlation, and initialize
 * handshake are owned by `@modelcontextprotocol/sdk`. This file mocks the
 * SDK's `Client` and `StdioClientTransport` and verifies the thin
 * adapter we still own:
 *   - config validation (rejects url-only entries with a helpful error)
 *   - rejects entries with no command
 *   - happy-path connectUpstream returns the listTools result
 *   - dispose() calls Client.close()
 *
 * Pre-Phase-D this file tested NDJSON `parseMessages`. That function is
 * gone (SDK owns framing); the regression class it covered (Content-Length
 * vs NDJSON) is structurally impossible now.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockClientConnect, mockClientListTools, mockClientCallTool, mockClientClose } = vi.hoisted(
  () => ({
    mockClientConnect: vi.fn(),
    mockClientListTools: vi.fn(),
    mockClientCallTool: vi.fn(),
    mockClientClose: vi.fn(),
  }),
);

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    connect = mockClientConnect;
    listTools = mockClientListTools;
    callTool = mockClientCallTool;
    close = mockClientClose;
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class {
    stderr = { on: vi.fn() };
  },
}));

import { connectUpstream } from './mcpClient';

beforeEach(() => {
  mockClientConnect.mockReset().mockResolvedValue(undefined);
  mockClientListTools.mockReset().mockResolvedValue({ tools: [] });
  mockClientCallTool.mockReset();
  mockClientClose.mockReset().mockResolvedValue(undefined);
});

describe('connectUpstream — config validation', () => {
  it('rejects url-only configs with a helpful error pointing at the filter boundary', async () => {
    await expect(connectUpstream('sentry', { url: 'https://mcp.example/sse' })).rejects.toThrow(
      /HTTP\/SSE transport is not supported by the codemode proxy/i,
    );
  });

  it('rejects configs with no command', async () => {
    await expect(connectUpstream('weird', {})).rejects.toThrow(/No command specified/i);
  });
});

describe('connectUpstream — happy path', () => {
  it('returns an UpstreamServer with the listTools result', async () => {
    mockClientListTools.mockResolvedValue({
      tools: [
        { name: 'search_graph', description: 'd1', inputSchema: { type: 'object' } },
        { name: 'trace_call_path', description: 'd2', inputSchema: { type: 'object' } },
      ],
    });
    const upstream = await connectUpstream('ouroboros', {
      command: 'node',
      args: ['stdio-bridge.js', '12345'],
    });
    expect(upstream.name).toBe('ouroboros');
    expect(upstream.tools.map((t) => t.name)).toEqual(['search_graph', 'trace_call_path']);
    expect(mockClientConnect).toHaveBeenCalledTimes(1);
    expect(mockClientListTools).toHaveBeenCalledTimes(1);
  });

  it('callTool delegates to SDK Client.callTool and returns the content field', async () => {
    mockClientListTools.mockResolvedValue({ tools: [] });
    mockClientCallTool.mockResolvedValue({
      content: [{ type: 'text', text: 'hello' }],
      isError: false,
    });
    const upstream = await connectUpstream('github', {
      command: 'node',
      args: ['gh-mcp.js'],
    });
    const result = await upstream.callTool('search_code', { query: 'foo' });
    expect(mockClientCallTool).toHaveBeenCalledWith({
      name: 'search_code',
      arguments: { query: 'foo' },
    });
    expect(result).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('dispose() closes the SDK Client', async () => {
    const upstream = await connectUpstream('github', { command: 'node', args: [] });
    upstream.dispose();
    expect(mockClientClose).toHaveBeenCalledTimes(1);
  });
});
