/**
 * mcpToolHandlerHelpers.test.ts — Phase A aliasing tests for handleSearchGraph
 * and handleTraceCallPath.
 *
 * Uses a real GraphDatabase(':memory:') populated with a minimal fixture so
 * tests exercise actual DB behaviour rather than mock contracts.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), verbose: vi.fn() },
  getLogPath: vi.fn(() => ''),
}));

vi.mock('../ipc-handlers/gitOperations', () => ({
  gitExec: vi.fn(async () => ''),
  gitTrimmed: vi.fn(async () => ''),
}));

import { CypherEngine } from './cypherEngine';
import { GraphDatabase } from './graphDatabase';
import { handleSearchGraph, handleTraceCallPath } from './mcpToolHandlerHelpers';
import type { GraphToolContext } from './mcpToolHandlers';
import { QueryEngine } from './queryEngine';

// ─── Fixture ──────────────────────────────────────────────────────────────────

const PROJECT = 'test-helpers';
let db: GraphDatabase;
let ctx: GraphToolContext;

beforeAll(() => {
  db = new GraphDatabase(':memory:');
  db.upsertProject({
    name: PROJECT,
    root_path: '/tmp/test',
    indexed_at: Date.now(),
    node_count: 0,
    edge_count: 0,
  });

  // Insert two Function nodes so search returns non-empty results
  db.insertNodes([
    {
      id: `${PROJECT}.src/a.ts.helperFn`,
      project: PROJECT,
      label: 'Function',
      name: 'helperFn',
      qualified_name: `${PROJECT}.src/a.ts.helperFn`,
      file_path: 'src/a.ts',
      start_line: 1,
      end_line: 5,
      props: {},
    },
    {
      id: `${PROJECT}.src/b.ts.callerFn`,
      project: PROJECT,
      label: 'Function',
      name: 'callerFn',
      qualified_name: `${PROJECT}.src/b.ts.callerFn`,
      file_path: 'src/b.ts',
      start_line: 1,
      end_line: 5,
      props: {},
    },
  ]);

  // Insert a CALLS edge: callerFn → helperFn
  db.insertEdges([
    {
      project: PROJECT,
      source_id: `${PROJECT}.src/b.ts.callerFn`,
      target_id: `${PROJECT}.src/a.ts.helperFn`,
      type: 'CALLS',
      props: {},
    },
  ]);

  const qe = new QueryEngine(db, PROJECT, '/tmp/test');
  const ce = new CypherEngine(db, PROJECT);
  ctx = {
    db,
    queryEngine: qe,
    cypherEngine: ce,
    pipeline: { index: async () => ({ success: true, projectName: PROJECT, filesIndexed: 0, filesSkipped: 0, nodesCreated: 0, edgesCreated: 0, durationMs: 0, incremental: true, errors: [] }) },
    projectRoot: '/tmp/test',
    projectName: PROJECT,
  };
});

afterAll(() => {
  db.close();
});

// ─── handleSearchGraph ────────────────────────────────────────────────────────

describe('handleSearchGraph — parameter aliasing', () => {
  it('accepts natural name: query', async () => {
    const result = await handleSearchGraph({ query: 'helperFn' }, ctx);
    expect(result).toContain('helperFn');
    expect(result).not.toContain('18,331');
  });

  it('accepts legacy name: name_pattern', async () => {
    const result = await handleSearchGraph({ name_pattern: 'helperFn' }, ctx);
    expect(result).toContain('helperFn');
  });

  it('new name wins when both are passed', async () => {
    const result = await handleSearchGraph({ query: 'helperFn', name_pattern: 'callerFn' }, ctx);
    expect(result).toContain('helperFn');
    expect(result).not.toContain('callerFn');
  });

  it('returns filtered results (not full table scan) when query is provided', async () => {
    const result = await handleSearchGraph({ query: 'helperFn' }, ctx);
    // Should find 1 node, not 2
    expect(result).toContain('Found 1 nodes');
  });

  it('returns all nodes when no query filter is given', async () => {
    const result = await handleSearchGraph({}, ctx);
    expect(result).toContain('Found 2 nodes');
  });
});

// ─── handleTraceCallPath ──────────────────────────────────────────────────────

describe('handleTraceCallPath — parameter aliasing', () => {
  it('accepts natural name: symbol', async () => {
    const result = await handleTraceCallPath({ symbol: 'callerFn' }, ctx.queryEngine);
    expect(result).toContain('callerFn');
    expect(result).not.toMatch(/^Error:/);
  });

  it('accepts legacy name: function_name', async () => {
    const result = await handleTraceCallPath({ function_name: 'callerFn' }, ctx.queryEngine);
    expect(result).toContain('callerFn');
    expect(result).not.toMatch(/^Error:/);
  });

  it('new name wins when both are passed', async () => {
    const result = await handleTraceCallPath(
      { symbol: 'callerFn', function_name: 'helperFn' },
      ctx.queryEngine,
    );
    expect(result).toContain('callerFn');
  });

  it('returns error string (not TypeError) when neither symbol nor function_name given', async () => {
    const result = await handleTraceCallPath({}, ctx.queryEngine);
    expect(result).toBe("Error: missing required parameter 'symbol' (or 'function_name')");
  });
});

describe('handleTraceCallPath — direction aliasing', () => {
  it("direction 'callers' maps to inbound (who calls callerFn — empty)", async () => {
    const result = await handleTraceCallPath(
      { symbol: 'callerFn', direction: 'callers' },
      ctx.queryEngine,
    );
    // callerFn has no inbound callers in fixture
    expect(result).not.toMatch(/^Error:/);
    expect(result).toContain('callerFn');
  });

  it("direction 'callees' maps to outbound (what callerFn calls — helperFn)", async () => {
    const result = await handleTraceCallPath(
      { symbol: 'callerFn', direction: 'callees' },
      ctx.queryEngine,
    );
    expect(result).not.toMatch(/^Error:/);
    expect(result).toContain('helperFn');
  });

  it("direction 'inbound' still works (legacy vocabulary)", async () => {
    const inbound = await handleTraceCallPath(
      { symbol: 'callerFn', direction: 'inbound' },
      ctx.queryEngine,
    );
    const callers = await handleTraceCallPath(
      { symbol: 'callerFn', direction: 'callers' },
      ctx.queryEngine,
    );
    expect(inbound).toBe(callers);
  });

  it("direction 'outbound' still works (legacy vocabulary)", async () => {
    const outbound = await handleTraceCallPath(
      { symbol: 'callerFn', direction: 'outbound' },
      ctx.queryEngine,
    );
    const callees = await handleTraceCallPath(
      { symbol: 'callerFn', direction: 'callees' },
      ctx.queryEngine,
    );
    expect(outbound).toBe(callees);
  });
});
