import { describe, expect, it } from 'vitest';

import type { GraphNode } from '../codebaseGraph/graphTypes';
import { chunkFileWithNodes } from './embeddingChunker';

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'test.ts::foo::function::1',
    type: 'function',
    name: 'foo',
    filePath: 'src/test.ts',
    line: 1,
    endLine: 10,
    ...overrides,
  };
}

const TEN_LINE_FN = Array.from({ length: 10 }, (_, i) => `  line${i + 1};`).join('\n');

describe('embeddingChunker', () => {
  it('produces one chunk per symbol node', () => {
    const content = `function foo() {\n${TEN_LINE_FN}\n}\nfunction bar() {\n  return 1;\n}`;
    const nodes: GraphNode[] = [
      makeNode({ name: 'foo', line: 1, endLine: 12 }),
      makeNode({ name: 'bar', line: 13, endLine: 15, id: 'test.ts::bar::function::13' }),
    ];
    const chunks = chunkFileWithNodes('src/test.ts', content, nodes);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].symbolName).toBe('foo');
    expect(chunks[1].symbolName).toBe('bar');
  });

  it('falls back to windowed chunking when no symbol nodes', () => {
    const lines = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`);
    const content = lines.join('\n');
    const chunks = chunkFileWithNodes('src/big.ts', content, []);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].symbolType).toBe('chunk');
    expect(chunks[0].symbolName).toBe('chunk_0');
  });

  it('filters non-symbol node types', () => {
    const content = 'const x = 1;\nfunction foo() { return x; }';
    const nodes: GraphNode[] = [
      makeNode({ type: 'variable', name: 'x', line: 1, endLine: 1 }),
      makeNode({ type: 'function', name: 'foo', line: 2, endLine: 2 }),
    ];
    const chunks = chunkFileWithNodes('src/test.ts', content, nodes);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].symbolName).toBe('foo');
  });

  it('clamps large nodes to MAX_CHUNK_LINES', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `  stmt${i};`);
    const content = lines.join('\n');
    const nodes: GraphNode[] = [
      makeNode({ name: 'bigFn', line: 1, endLine: 200 }),
    ];
    const chunks = chunkFileWithNodes('src/test.ts', content, nodes);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].endLine).toBeLessThanOrEqual(100);
  });

  it('generates deterministic content hashes', () => {
    const content = 'function foo() { return 1; }';
    const nodes: GraphNode[] = [makeNode({ line: 1, endLine: 1 })];
    const a = chunkFileWithNodes('src/test.ts', content, nodes);
    const b = chunkFileWithNodes('src/test.ts', content, nodes);
    expect(a[0].contentHash).toBe(b[0].contentHash);
  });

  it('skips empty content nodes', () => {
    const content = '\n\n\nfunction foo() { return 1; }';
    const nodes: GraphNode[] = [
      makeNode({ name: 'empty', line: 1, endLine: 2 }),
      makeNode({ name: 'foo', line: 4, endLine: 4, id: 'test.ts::foo::function::4' }),
    ];
    const chunks = chunkFileWithNodes('src/test.ts', content, nodes);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].symbolName).toBe('foo');
  });
});
