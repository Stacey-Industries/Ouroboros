/**
 * cypherEngineRegression.test.ts — Wave 68 regression coverage.
 *
 * One test per bug from roadmap/wave-68-diagnostic.md:
 *  Bug 1 — target-node label filter applied
 *  Bug 2 — anonymous-endpoint syntax accepted
 *  Bug 3 — relationship-property access (r.confidence dedicated column)
 *  Bug 4 — labels(n) returns the node's label string
 *  Bug 5 — MATCH (p:Project) routes to projects table
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CypherEngine } from './cypherEngine';
import { GraphDatabase } from './graphDatabase';

const PROJECT = 'cypher-test';

function seed(db: GraphDatabase): void {
  db.upsertProject({
    name: PROJECT,
    root_path: '/tmp',
    indexed_at: 1700000000000,
    node_count: 4,
    edge_count: 3,
  });
  db.insertNodes([
    { id: 'fn1', project: PROJECT, label: 'Function', name: 'caller1', qualified_name: 'p.caller1', file_path: 'a.ts', start_line: 1, end_line: 5, props: {} },
    { id: 'fn2', project: PROJECT, label: 'Function', name: 'caller2', qualified_name: 'p.caller2', file_path: 'a.ts', start_line: 7, end_line: 10, props: {} },
    { id: 'cls1', project: PROJECT, label: 'Class', name: 'Foo', qualified_name: 'p.Foo', file_path: 'b.ts', start_line: 1, end_line: 20, props: {} },
    { id: 'fn3', project: PROJECT, label: 'Function', name: 'helper', qualified_name: 'p.helper', file_path: 'c.ts', start_line: 1, end_line: 3, props: {} },
  ]);
  db.insertEdges([
    { project: PROJECT, source_id: 'fn1', target_id: 'cls1', type: 'CALLS', props: {} },
    { project: PROJECT, source_id: 'fn2', target_id: 'cls1', type: 'CALLS', props: {} },
    { project: PROJECT, source_id: 'fn3', target_id: 'fn1', type: 'CALLS', props: {} },
  ]);
  // Edges insert with confidence DEFAULT 1.0 per schema v2.
}

describe('CypherEngine — Wave 68 regression coverage', () => {
  let db: GraphDatabase;
  let engine: CypherEngine;

  beforeEach(() => {
    db = new GraphDatabase(':memory:');
    seed(db);
    engine = new CypherEngine(db, PROJECT);
  });
  afterEach(() => db.close());

  it('Bug 1 — target-node label filter is applied', () => {
    const result = engine.execute('MATCH (a)-[r:CALLS]->(b:Class) RETURN count(r)');
    expect(result.rows.length).toBe(1);
    // 2 Function→Class CALLS edges; the Function→Function edge must be excluded.
    expect(result.rows[0].count).toBe(2);
  });

  it('Bug 2 — anonymous-endpoint syntax parses without error', () => {
    const result = engine.execute('MATCH ()-[r:CALLS]->() RETURN count(r)');
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].count).toBe(3);
  });

  it('Bug 3 — relationship-property access (r.confidence dedicated column)', () => {
    const result = engine.execute(
      "MATCH (a)-[r:CALLS]->(b) WHERE a.name = 'caller1' RETURN r.confidence",
    );
    expect(result.rows.length).toBe(1);
    // confidence column has DEFAULT 1.0; test confirms the access path works.
    expect(typeof result.rows[0].r_confidence).toBe('number');
    expect(result.rows[0].r_confidence).toBe(1.0);
  });

  it('Bug 4 — labels(n) returns the node label', () => {
    const result = engine.execute("MATCH (n) WHERE n.name = 'Foo' RETURN labels(n)");
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].labels_n).toBe('Class');
  });

  it('Bug 4b — unsupported function throws clear error', () => {
    expect(() => engine.execute('MATCH (n) RETURN nonsense(n)')).toThrow(/unsupported function: nonsense/);
  });

  it('Bug 5 — MATCH (p:Project) routes to projects table', () => {
    const result = engine.execute('MATCH (p:Project) RETURN p.name, p.indexed_at');
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].p_name).toBe(PROJECT);
    expect(result.rows[0].p_indexed_at).toBe(1700000000000);
  });
});
