/**
 * embeddingIndexer.ts — Background indexing pipeline.
 *
 * Orchestrates: changed files -> chunk via graph nodes ->
 * deduplicate by contentHash -> batch embed -> upsert.
 * Incremental: only re-indexes files with changed content hashes.
 */

import fs from 'fs';
import path from 'path';

import type { GraphNode } from '../codebaseGraph/graphTypes';
import log from '../logger';
import { chunkFile } from './embeddingChunker';
import type {
  ChunkCandidate,
  EmbeddingChunk,
  IEmbeddingProvider,
  IEmbeddingStore,
} from './embeddingTypes';

const BATCH_SIZE = 32;
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.ouroboros',
]);

export interface IndexerOptions {
  store: IEmbeddingStore;
  provider: IEmbeddingProvider;
  getNodesForFile: (filePath: string) => GraphNode[];
}

/** Index all eligible files under `projectRoot`. */
export async function indexProject(
  projectRoot: string,
  opts: IndexerOptions,
): Promise<{ chunksIndexed: number; filesProcessed: number }> {
  const files = collectFiles(projectRoot);
  return indexFiles(files, opts);
}

/** Index a specific list of files (for incremental updates). */
export async function indexFiles(
  files: string[],
  opts: IndexerOptions,
): Promise<{ chunksIndexed: number; filesProcessed: number }> {
  let chunksIndexed = 0;
  let filesProcessed = 0;
  const allCandidates: ChunkCandidate[] = [];

  for (const filePath of files) {
    const nodes = opts.getNodesForFile(filePath);
    const candidates = chunkFile(filePath, nodes);
    const newCandidates = filterUnchanged(candidates, opts.store);
    allCandidates.push(...newCandidates);
    filesProcessed++;
  }

  chunksIndexed = await embedAndStore(allCandidates, opts);
  return { chunksIndexed, filesProcessed };
}

function filterUnchanged(
  candidates: ChunkCandidate[],
  store: IEmbeddingStore,
): ChunkCandidate[] {
  return candidates.filter((c) => !store.hasChunkHash(c.contentHash));
}

async function embedAndStore(
  candidates: ChunkCandidate[],
  opts: IndexerOptions,
): Promise<number> {
  if (candidates.length === 0) return 0;
  let stored = 0;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.content);
    try {
      const embeddings = await opts.provider.embed(texts);
      const chunks = buildChunks(batch, embeddings, opts.provider);
      opts.store.upsertChunks(chunks);
      stored += chunks.length;
    } catch (err) {
      log.warn('[embeddings] batch embed failed:', err);
    }
  }
  return stored;
}

function buildChunks(
  batch: ChunkCandidate[],
  embeddings: Float32Array[],
  provider: IEmbeddingProvider,
): EmbeddingChunk[] {
  const now = Date.now();
  return batch.map((c, idx) => {
    const vec = embeddings.at(idx) ?? new Float32Array(provider.dimensions);
    return {
      id: `${c.filePath}::${c.symbolName}::${c.startLine}`,
      filePath: c.filePath,
      symbolName: c.symbolName,
      symbolType: c.symbolType,
      startLine: c.startLine,
      endLine: c.endLine,
      contentHash: c.contentHash,
      embedding: vec,
      dimensions: provider.dimensions,
      model: provider.model,
      indexedAt: now,
    };
  });
}

/** Recursively collect indexable files under a directory. */
function collectFiles(dir: string, depth = 0): string[] {
  if (depth > 8) return [];
  const files: string[] = [];
  let entries: fs.Dirent[];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir from projectRoot
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full, depth + 1));
    } else if (isIndexable(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const INDEXABLE_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs',
  '.java', '.c', '.cpp', '.h', '.hpp', '.rb', '.php',
  '.swift', '.kt', '.cs', '.sh', '.sql', '.lua',
]);

function isIndexable(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return INDEXABLE_EXT.has(ext);
}
