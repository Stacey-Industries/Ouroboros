/**
 * embeddingChunker.ts — AST-aware code chunking for embedding.
 *
 * Uses graph node data (function/class/interface boundaries) for
 * precise chunk boundaries. Falls back to fixed-window chunking
 * for files without graph nodes.
 */

import crypto from 'crypto';
import fs from 'fs';

import type { GraphNode } from '../codebaseGraph/graphTypes';
import type { ChunkCandidate } from './embeddingTypes';

const MAX_CHUNK_LINES = 100;
const FALLBACK_WINDOW_LINES = 50;
const FALLBACK_OVERLAP_LINES = 10;
const MAX_FILE_SIZE = 500_000;

function contentHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/** Chunk a single file using graph nodes for boundaries. */
export function chunkFileWithNodes(
  filePath: string,
  content: string,
  nodes: GraphNode[],
): ChunkCandidate[] {
  const lines = content.split('\n');
  const symbolNodes = filterSymbolNodes(nodes);
  if (symbolNodes.length === 0) return chunkFileWindowed(filePath, lines);
  return buildNodeChunks(filePath, lines, symbolNodes);
}

const SYMBOL_TYPES = new Set(['function', 'class', 'interface', 'type_alias']);

function filterSymbolNodes(nodes: GraphNode[]): GraphNode[] {
  return nodes
    .filter((n) => SYMBOL_TYPES.has(n.type))
    .sort((a, b) => a.line - b.line);
}

function buildNodeChunks(
  filePath: string,
  lines: string[],
  symbolNodes: GraphNode[],
): ChunkCandidate[] {
  const chunks: ChunkCandidate[] = [];
  for (const node of symbolNodes) {
    const start = Math.max(0, node.line - 1);
    const end = Math.min(lines.length, (node.endLine ?? node.line + 20));
    const clampedEnd = Math.min(end, start + MAX_CHUNK_LINES);
    const text = lines.slice(start, clampedEnd).join('\n');
    if (text.trim().length === 0) continue;
    chunks.push({
      filePath,
      symbolName: node.name,
      symbolType: node.type,
      startLine: start + 1,
      endLine: clampedEnd,
      content: text,
      contentHash: contentHash(text),
    });
  }
  return chunks;
}

/** Fallback: fixed-window chunking for files without graph nodes. */
function chunkFileWindowed(
  filePath: string,
  lines: string[],
): ChunkCandidate[] {
  const chunks: ChunkCandidate[] = [];
  let offset = 0;
  let idx = 0;
  while (offset < lines.length) {
    const end = Math.min(offset + FALLBACK_WINDOW_LINES, lines.length);
    const text = lines.slice(offset, end).join('\n');
    if (text.trim().length > 0) {
      chunks.push({
        filePath,
        symbolName: `chunk_${idx}`,
        symbolType: 'chunk',
        startLine: offset + 1,
        endLine: end,
        content: text,
        contentHash: contentHash(text),
      });
    }
    idx++;
    offset += FALLBACK_WINDOW_LINES - FALLBACK_OVERLAP_LINES;
  }
  return chunks;
}

/** Read a file and chunk it. Returns empty array for unreadable files. */
export function chunkFile(
  filePath: string,
  nodes: GraphNode[],
): ChunkCandidate[] {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath validated by caller
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) return [];
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath validated by caller
    const content = fs.readFileSync(filePath, 'utf-8');
    return chunkFileWithNodes(filePath, content, nodes);
  } catch {
    return [];
  }
}
