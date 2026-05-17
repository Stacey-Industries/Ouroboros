/**
 * repoMapWorkerQueryClient.test.ts — Unit tests for the worker-local read-only
 * graph query shim.
 *
 * Mocks GraphDatabase and CypherEngine at the boundary (not the subject).
 * Verifies lifecycle semantics: init opens DB readonly, getter returns the
 * wrapper, queryGraph delegates to the engine, dispose closes the DB.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Boundary mocks ─────────────────────────────────────────────────────────────
// vi.mock is hoisted above all imports. We use mockReturnValue (not arrow
// factory returning plain object) so vitest treats these as constructor mocks.

const mockDbClose = vi.fn();
const mockEngineExecute = vi.fn();

// Use class syntax so vitest handles `new Foo()` correctly.
// The instances expose the shared spy functions so tests can assert on them.
vi.mock('../codebaseGraph/graphDatabase', () => {
  const GraphDatabase = vi.fn(function (this: Record<string, unknown>) {
    this['close'] = mockDbClose;
  });
  return { GraphDatabase };
});
vi.mock('../codebaseGraph/cypherEngine', () => {
  const CypherEngine = vi.fn(function (this: Record<string, unknown>) {
    this['execute'] = mockEngineExecute;
  });
  return { CypherEngine };
});
vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GraphDatabase } from '../codebaseGraph/graphDatabase';
import {
  disposeWorkerQueryClient,
  getWorkerQueryClient,
  initWorkerQueryClient,
} from './repoMapWorkerQueryClient';

// ── Test lifecycle ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(GraphDatabase).mockClear();
  mockDbClose.mockClear();
  mockEngineExecute.mockClear();
});

afterEach(() => {
  disposeWorkerQueryClient();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('repoMapWorkerQueryClient', () => {
  it('getWorkerQueryClient returns null before initWorkerQueryClient is called', () => {
    expect(getWorkerQueryClient()).toBeNull();
  });

  it('initWorkerQueryClient opens GraphDatabase with readonly:true and the given dbPath', () => {
    initWorkerQueryClient('/mock/path/codebase-graph.db');

    expect(GraphDatabase).toHaveBeenCalledWith('/mock/path/codebase-graph.db', { readonly: true });
  });

  it('getWorkerQueryClient returns a non-null client with a queryGraph function after init', () => {
    initWorkerQueryClient('/mock/path/codebase-graph.db');
    const client = getWorkerQueryClient();

    expect(client).not.toBeNull();
    expect(typeof client?.queryGraph).toBe('function');
  });

  it('queryGraph delegates to CypherEngine.execute and returns the rows array', () => {
    const mockRows = [{ n_name: 'MyClass', kind: 'Class' }];
    mockEngineExecute.mockReturnValue({ columns: ['n_name', 'kind'], rows: mockRows, total: 1 });

    initWorkerQueryClient('/mock/db');
    const client = getWorkerQueryClient();
    const cypher = 'MATCH (n) RETURN n.name';
    const result = client?.queryGraph(cypher);

    expect(mockEngineExecute).toHaveBeenCalledWith(cypher);
    expect(result).toEqual(mockRows);
  });

  it('disposeWorkerQueryClient closes the DB handle', () => {
    initWorkerQueryClient('/mock/db');
    disposeWorkerQueryClient();

    expect(mockDbClose).toHaveBeenCalledTimes(1);
  });

  it('getWorkerQueryClient returns null after dispose', () => {
    initWorkerQueryClient('/mock/db');
    disposeWorkerQueryClient();

    expect(getWorkerQueryClient()).toBeNull();
  });

  it('initWorkerQueryClient called twice is a no-op on the second call (guard against double-init)', () => {
    initWorkerQueryClient('/mock/db');
    initWorkerQueryClient('/mock/db-second');

    expect(GraphDatabase).toHaveBeenCalledTimes(1);
    expect(GraphDatabase).toHaveBeenCalledWith('/mock/db', { readonly: true });
  });
});
