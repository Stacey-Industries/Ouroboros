/**
 * ouroborosMcpServer.test.ts — covers the read-only filter and the
 * exclusion-set contents. Full server-spawn integration coverage is
 * deferred to Phase D smokes (real DB, real stdio).
 */

import { describe, expect, it } from 'vitest';

import type { McpToolDefinition } from '../../main/internalMcp/internalMcpTypes';
import { filterReadOnlyTools, READ_ONLY_EXCLUDED } from './ouroborosMcpServer';

function fakeTool(name: string): McpToolDefinition {
  return {
    name,
    description: `fake ${name}`,
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => 'ok',
  };
}

describe('READ_ONLY_EXCLUDED', () => {
  it('contains the three mutating tool names', () => {
    expect(READ_ONLY_EXCLUDED.has('index_repository')).toBe(true);
    expect(READ_ONLY_EXCLUDED.has('delete_project')).toBe(true);
    expect(READ_ONLY_EXCLUDED.has('ingest_traces')).toBe(true);
  });

  it('does not contain read-only tools', () => {
    expect(READ_ONLY_EXCLUDED.has('search_graph')).toBe(false);
    expect(READ_ONLY_EXCLUDED.has('trace_call_path')).toBe(false);
    expect(READ_ONLY_EXCLUDED.has('get_code_snippet')).toBe(false);
    expect(READ_ONLY_EXCLUDED.has('query_graph')).toBe(false);
    expect(READ_ONLY_EXCLUDED.has('get_graph_schema')).toBe(false);
  });
});

describe('filterReadOnlyTools', () => {
  it('drops the three mutating tools', () => {
    const all = [
      fakeTool('search_graph'),
      fakeTool('index_repository'),
      fakeTool('delete_project'),
      fakeTool('trace_call_path'),
      fakeTool('ingest_traces'),
      fakeTool('get_graph_schema'),
    ];
    const kept = filterReadOnlyTools(all).map((t) => t.name);
    expect(kept).toEqual(['search_graph', 'trace_call_path', 'get_graph_schema']);
  });

  it('keeps everything when no excluded tools are present', () => {
    const all = [fakeTool('search_graph'), fakeTool('query_graph')];
    expect(filterReadOnlyTools(all)).toEqual(all);
  });

  it('returns an empty array when given an empty array', () => {
    expect(filterReadOnlyTools([])).toEqual([]);
  });
});
