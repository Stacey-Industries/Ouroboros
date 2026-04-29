/**
 * proxyServer.test.ts — Wave 53k Phase D.
 *
 * Smoke tests for the pure helpers in proxyServer.ts. The SDK-bridged
 * surface (Server + StdioServerTransport, request handlers) is exercised
 * end-to-end by `codemode.internalMcp.integration.test.ts` and the live
 * smoke; this file pins the local formatting + dispatch logic.
 *
 * Importing the module is also part of the smoke: `isScriptEntry()` must
 * return false under vitest so `main()` doesn't auto-run and try to read
 * `process.argv[2]`.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  buildExecuteCodeTool,
  buildToolDispatchMap,
  formatExecutionFailure,
  formatExecutionResult,
} from './proxyServer';
import type { UpstreamServer } from './types';

function makeUpstream(name: string, toolNames: string[]): UpstreamServer {
  return {
    name,
    tools: toolNames.map((tn) => ({
      name: tn,
      description: `${tn} desc`,
      inputSchema: { type: 'object', properties: {} },
    })),
    callTool: vi.fn(async (toolName: string, args: Record<string, unknown>) => ({
      called: { server: name, tool: toolName, args },
    })),
    dispose: vi.fn(),
  };
}

describe('buildExecuteCodeTool', () => {
  it('returns a single tool descriptor named execute_code', () => {
    const tool = buildExecuteCodeTool('declare namespace servers {}');
    expect(tool.name).toBe('execute_code');
    expect(tool.description).toContain('Execute TypeScript code');
    expect(tool.description).toContain('declare namespace servers {}');
    expect(tool.inputSchema).toMatchObject({
      type: 'object',
      properties: { code: { type: 'string' } },
      required: ['code'],
    });
  });
});

describe('buildToolDispatchMap', () => {
  it('exposes each upstream tool as `map[server][tool]`', () => {
    const upstreams = new Map<string, UpstreamServer>([
      ['github', makeUpstream('github', ['search_code', 'get_file'])],
      ['ouroboros', makeUpstream('ouroboros', ['search_graph', 'trace_call_path'])],
    ]);
    const map = buildToolDispatchMap(upstreams);
    expect(Object.keys(map).sort()).toEqual(['github', 'ouroboros']);
    expect(Object.keys(map.github).sort()).toEqual(['get_file', 'search_code']);
    expect(Object.keys(map.ouroboros).sort()).toEqual(['search_graph', 'trace_call_path']);
  });

  it('dispatches calls through the upstream callTool', async () => {
    const upstream = makeUpstream('github', ['search_code']);
    const map = buildToolDispatchMap(new Map([['github', upstream]]));
    const result = await map.github.search_code({ query: 'auth' });
    expect(upstream.callTool).toHaveBeenCalledWith('search_code', { query: 'auth' });
    expect(result).toEqual({
      called: { server: 'github', tool: 'search_code', args: { query: 'auth' } },
    });
  });
});

describe('formatExecutionResult', () => {
  it('wraps successful result as a single text content block, no isError', () => {
    const formatted = formatExecutionResult({
      success: true,
      result: { tools: 14 },
      logs: [],
      error: undefined,
    });
    expect(formatted.isError).toBeUndefined();
    expect(formatted.content).toHaveLength(1);
    expect(formatted.content[0].type).toBe('text');
    const parsed = JSON.parse(formatted.content[0].text) as Record<string, unknown>;
    expect(parsed.success).toBe(true);
    expect(parsed.result).toEqual({ tools: 14 });
  });

  it('marks failed executions with isError: true and preserves error text', () => {
    const formatted = formatExecutionResult({
      success: false,
      result: undefined,
      logs: ['log line'],
      error: 'TypeError: x is undefined',
    });
    expect(formatted.isError).toBe(true);
    const parsed = JSON.parse(formatted.content[0].text) as Record<string, unknown>;
    expect(parsed.error).toBe('TypeError: x is undefined');
    expect(parsed.logs).toEqual(['log line']);
  });
});

describe('formatExecutionFailure', () => {
  it('returns isError content when an Error object is given', () => {
    const formatted = formatExecutionFailure(new Error('proxy boom'));
    expect(formatted.isError).toBe(true);
    expect(formatted.content[0].text).toContain('proxy boom');
    expect(formatted.content[0].text).toContain('Execution error:');
  });

  it('coerces non-Error throwables to string', () => {
    const formatted = formatExecutionFailure('plain string');
    expect(formatted.isError).toBe(true);
    expect(formatted.content[0].text).toContain('plain string');
  });
});

describe('module entry-point guard', () => {
  it('imports cleanly under vitest without auto-running main()', () => {
    // If main() auto-ran, it would try to read process.argv[2] and exit(1)
    // via getConfigPath. The fact that this test executes at all means
    // isScriptEntry() correctly returned false for the vitest worker path.
    expect(true).toBe(true);
  });
});
