/**
 * mcpToolHandlerDefs.test.ts — Phase A aliasing tests for handleGetCodeSnippet
 * and handleIndexStatus.
 *
 * Uses a real GraphDatabase(':memory:') with a minimal fixture.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
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
import { handleGetCodeSnippet, handleIndexStatus } from './mcpToolHandlerDefs';
import type { GraphToolContext } from './mcpToolHandlers';
import { QueryEngine } from './queryEngine';

// ─── Fixture ──────────────────────────────────────────────────────────────────

const PROJECT = 'test-defs';
let db: GraphDatabase;
let ctx: GraphToolContext;
let fixtureDir: string;

beforeAll(() => {
  // Create a real file on disk so getCodeSnippet can read it
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-defs-test-'));
  const srcFile = path.join(fixtureDir, 'foo.ts');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture write to os.tmpdir()
  fs.writeFileSync(srcFile, 'export function uniqueFn(): void {}\n', 'utf8');
  const dualFile = path.join(fixtureDir, 'bar.ts');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture write to os.tmpdir()
  fs.writeFileSync(dualFile, 'export function dupFn(): void {}\nexport function dupFn2(): void {}\n', 'utf8');

  db = new GraphDatabase(':memory:');
  db.upsertProject({
    name: PROJECT,
    root_path: fixtureDir,
    indexed_at: Date.now(),
    node_count: 2,
    edge_count: 0,
  });

  db.insertNodes([
    {
      id: `${PROJECT}.foo.ts.uniqueFn`,
      project: PROJECT,
      label: 'Function',
      name: 'uniqueFn',
      qualified_name: `${PROJECT}.foo.ts.uniqueFn`,
      file_path: 'foo.ts',
      start_line: 1,
      end_line: 1,
      props: {},
    },
    {
      id: `${PROJECT}.bar.ts.dupFn`,
      project: PROJECT,
      label: 'Function',
      name: 'dupFn',
      qualified_name: `${PROJECT}.bar.ts.dupFn`,
      file_path: 'bar.ts',
      start_line: 1,
      end_line: 1,
      props: {},
    },
    {
      id: `${PROJECT}.bar.ts.dupFn2`,
      project: PROJECT,
      label: 'Function',
      name: 'dupFn',
      qualified_name: `${PROJECT}.bar.ts.dupFn2`,
      file_path: 'bar.ts',
      start_line: 2,
      end_line: 2,
      props: {},
    },
  ]);

  const qe = new QueryEngine(db, PROJECT, fixtureDir);
  const ce = new CypherEngine(db, PROJECT);
  ctx = {
    db,
    queryEngine: qe,
    cypherEngine: ce,
    pipeline: { index: async () => ({ success: true, projectName: PROJECT, filesIndexed: 0, filesSkipped: 0, nodesCreated: 0, edgesCreated: 0, durationMs: 0, incremental: true, errors: [] }) },
    projectRoot: fixtureDir,
    projectName: PROJECT,
  };
});

afterAll(() => {
  db.close();
  try {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  } catch { /* swallow */ }
});

// ─── handleGetCodeSnippet ─────────────────────────────────────────────────────

describe('handleGetCodeSnippet — parameter aliasing', () => {
  it('accepts natural name: symbol (qualified name)', async () => {
    const qn = `${PROJECT}.foo.ts.uniqueFn`;
    const result = await handleGetCodeSnippet({ symbol: qn }, ctx);
    expect(result).toContain('uniqueFn');
    expect(result).not.toMatch(/^Error:/);
    expect(result).not.toContain('Symbol not found');
  });

  it('accepts legacy name: qualified_name', async () => {
    const qn = `${PROJECT}.foo.ts.uniqueFn`;
    const result = await handleGetCodeSnippet({ qualified_name: qn }, ctx);
    expect(result).toContain('uniqueFn');
    expect(result).not.toMatch(/^Error:/);
  });

  it('new name wins when both are passed', async () => {
    const qn = `${PROJECT}.foo.ts.uniqueFn`;
    const result = await handleGetCodeSnippet(
      { symbol: qn, qualified_name: 'nonexistent' },
      ctx,
    );
    expect(result).toContain('uniqueFn');
    expect(result).not.toContain('Symbol not found');
  });

  it('bare symbol name auto-resolves when unique', async () => {
    const result = await handleGetCodeSnippet({ symbol: 'uniqueFn' }, ctx);
    expect(result).toContain('uniqueFn');
    expect(result).not.toMatch(/^Error:/);
    expect(result).not.toContain('Symbol not found');
  });

  it('returns ambiguous error when bare name matches multiple nodes', async () => {
    const result = await handleGetCodeSnippet({ symbol: 'dupFn' }, ctx);
    expect(result).toMatch(/^Error: ambiguous symbol/);
    expect(result).toContain('dupFn');
  });

  it('returns Symbol not found for truly unknown bare name', async () => {
    const result = await handleGetCodeSnippet({ symbol: 'noSuchFn' }, ctx);
    expect(result).toContain('Symbol not found');
  });

  it('returns error string when no symbol given', async () => {
    const result = await handleGetCodeSnippet({}, ctx);
    expect(result).toMatch(/^Error: missing required parameter/);
  });
});

// ─── handleIndexStatus ────────────────────────────────────────────────────────

describe('handleIndexStatus — parameter aliasing', () => {
  it('returns live counts when no project arg given (defaults to ctx.projectName)', async () => {
    const result = await handleIndexStatus({}, ctx);
    expect(result).toContain(PROJECT);
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('is not indexed');
  });

  it('accepts project arg (preferred name)', async () => {
    const result = await handleIndexStatus({ project: PROJECT }, ctx);
    expect(result).toContain(PROJECT);
    expect(result).not.toContain('is not indexed');
  });

  it('accepts project_name arg (alias)', async () => {
    const result = await handleIndexStatus({ project_name: PROJECT }, ctx);
    expect(result).toContain(PROJECT);
    expect(result).not.toContain('is not indexed');
  });

  it('project wins over project_name when both are passed', async () => {
    const result = await handleIndexStatus({ project: PROJECT, project_name: 'nonexistent' }, ctx);
    expect(result).toContain(PROJECT);
    expect(result).not.toContain('is not indexed');
  });

  it('reports not-indexed for an unknown project name', async () => {
    const result = await handleIndexStatus({ project: 'ghost-project' }, ctx);
    expect(result).toContain('is not indexed');
  });
});
