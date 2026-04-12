/**
 * embeddingStore.ts — SQLite-backed vector embedding store.
 *
 * Stores code chunk embeddings as BLOBs with content-hash deduplication.
 * Cosine similarity search via JS brute-force (sufficient for <100K chunks).
 * Follows the graphStore.ts / database.ts patterns.
 */

import {
  closeDatabase,
  type Database,
  getSchemaVersion,
  openDatabase,
  runTransaction,
  setSchemaVersion,
} from '../storage/database';
import type {
  ChunkMetadata,
  EmbeddingChunk,
  EmbeddingIndexStatus,
  EmbeddingSearchResult,
  IEmbeddingStore,
} from './embeddingTypes';

const SCHEMA_VERSION = 1;

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  filePath TEXT NOT NULL,
  symbolName TEXT NOT NULL,
  symbolType TEXT NOT NULL,
  startLine INTEGER NOT NULL,
  endLine INTEGER NOT NULL,
  contentHash TEXT NOT NULL,
  embedding BLOB NOT NULL,
  dimensions INTEGER NOT NULL,
  model TEXT NOT NULL,
  indexedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_filePath ON chunks(filePath);
CREATE INDEX IF NOT EXISTS idx_chunks_contentHash ON chunks(contentHash);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function ensureSchema(db: Database): void {
  if (getSchemaVersion(db) >= SCHEMA_VERSION) return;
  db.exec(SCHEMA_DDL);
  setSchemaVersion(db, SCHEMA_VERSION);
}

function toBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

function toFloat32(buf: Buffer): Float32Array {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Float32Array(ab);
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- numeric index on typed Float32Array
    dot += a[i] * b[i];
    // eslint-disable-next-line security/detect-object-injection -- numeric index on typed Float32Array
    normA += a[i] * a[i];
    // eslint-disable-next-line security/detect-object-injection -- numeric index on typed Float32Array
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Opens or creates an embedding store at `dbPath`. */
export function createEmbeddingStore(dbPath: string): IEmbeddingStore {
  const db = openDatabase(dbPath);
  ensureSchema(db);
  return buildStoreApi(db);
}

function buildStoreApi(db: Database): IEmbeddingStore {
  const stmts = prepareStatements(db);

  return {
    upsertChunks: (chunks) => upsertChunks(db, stmts, chunks),
    deleteByFile: (fp) => deleteByFile(stmts, fp),
    searchSimilar: (qe, k) => searchSimilar(db, qe, k),
    getChunksByFile: (fp) => getChunksByFile(stmts, fp),
    getStatus: () => getStatus(stmts),
    hasChunkHash: (h) => hasChunkHash(stmts, h),
    getModelVersion: () => getModelVersion(stmts),
    clear: () => clearStore(db),
    close: () => closeDatabase(db),
  };
}

type PreparedStatements = ReturnType<typeof prepareStatements>;

function prepareStatements(db: Database) {
  return {
    upsert: db.prepare(`INSERT OR REPLACE INTO chunks
      (id, filePath, symbolName, symbolType, startLine, endLine,
       contentHash, embedding, dimensions, model, indexedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    deleteFile: db.prepare('DELETE FROM chunks WHERE filePath = ?'),
    byFile: db.prepare(
      `SELECT id, filePath, symbolName, symbolType, startLine, endLine, contentHash
       FROM chunks WHERE filePath = ?`,
    ),
    hashExists: db.prepare('SELECT 1 FROM chunks WHERE contentHash = ? LIMIT 1'),
    countChunks: db.prepare('SELECT COUNT(*) as cnt FROM chunks'),
    countFiles: db.prepare('SELECT COUNT(DISTINCT filePath) as cnt FROM chunks'),
    getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
    setMeta: db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)'),
  };
}

function upsertChunks(
  db: Database,
  stmts: PreparedStatements,
  chunks: EmbeddingChunk[],
): void {
  runTransaction(db, () => {
    for (const c of chunks) {
      stmts.upsert.run(
        c.id, c.filePath, c.symbolName, c.symbolType,
        c.startLine, c.endLine, c.contentHash,
        toBuffer(c.embedding), c.dimensions, c.model, c.indexedAt,
      );
    }
    if (chunks.length > 0) {
      stmts.setMeta.run('model', chunks[0].model);
      stmts.setMeta.run('dimensions', String(chunks[0].dimensions));
      stmts.setMeta.run('lastIndexedAt', String(Date.now()));
    }
  });
}

function deleteByFile(stmts: PreparedStatements, filePath: string): void {
  stmts.deleteFile.run(filePath);
}

interface RawRow {
  id: string; filePath: string; symbolName: string; symbolType: string;
  startLine: number; endLine: number; contentHash: string;
  embedding: Buffer; dimensions: number;
}

function searchSimilar(
  db: Database,
  queryEmbedding: Float32Array,
  topK: number,
): EmbeddingSearchResult[] {
  const rows = db.prepare(
    `SELECT id, filePath, symbolName, symbolType, startLine, endLine,
            contentHash, embedding, dimensions
     FROM chunks`,
  ).all() as RawRow[];

  const scored = rows.map((row) => ({
    chunk: toChunkMeta(row),
    score: cosine(queryEmbedding, toFloat32(row.embedding)),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

function toChunkMeta(row: RawRow | ChunkMetadata): ChunkMetadata {
  return {
    id: row.id,
    filePath: row.filePath,
    symbolName: row.symbolName,
    symbolType: row.symbolType,
    startLine: row.startLine,
    endLine: row.endLine,
    contentHash: row.contentHash,
  };
}

function getChunksByFile(
  stmts: PreparedStatements,
  filePath: string,
): ChunkMetadata[] {
  return stmts.byFile.all(filePath) as ChunkMetadata[];
}

function hasChunkHash(stmts: PreparedStatements, hash: string): boolean {
  return stmts.hashExists.get(hash) !== undefined;
}

function getModelVersion(stmts: PreparedStatements): string {
  const row = stmts.getMeta.get('model') as { value: string } | undefined;
  return row?.value ?? '';
}

function getStatus(stmts: PreparedStatements): EmbeddingIndexStatus {
  const chunks = (stmts.countChunks.get() as { cnt: number }).cnt;
  const files = (stmts.countFiles.get() as { cnt: number }).cnt;
  const lastRow = stmts.getMeta.get('lastIndexedAt') as { value: string } | undefined;
  const modelRow = stmts.getMeta.get('model') as { value: string } | undefined;
  const dimRow = stmts.getMeta.get('dimensions') as { value: string } | undefined;
  return {
    totalChunks: chunks,
    totalFiles: files,
    lastIndexedAt: lastRow ? Number(lastRow.value) : 0,
    model: modelRow?.value ?? '',
    dimensions: dimRow ? Number(dimRow.value) : 0,
  };
}

function clearStore(db: Database): void {
  db.exec('DELETE FROM chunks; DELETE FROM meta;');
}
