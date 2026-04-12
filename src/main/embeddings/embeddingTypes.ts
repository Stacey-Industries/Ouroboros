/**
 * embeddingTypes.ts — Shared types for the embedding subsystem.
 *
 * Defines chunk, store, search, and worker contracts.
 * No runtime code — type-only module.
 */

/** A single embedded code chunk stored in the index. */
export interface EmbeddingChunk {
  /** Unique ID: `{relativePath}::{symbolName}::{startLine}` */
  id: string;
  filePath: string;
  symbolName: string;
  symbolType: string;
  startLine: number;
  endLine: number;
  /** SHA-256 of chunk content — dedup key for incremental indexing. */
  contentHash: string;
  /** Raw vector as Float32Array (serialized as Buffer for SQLite BLOB). */
  embedding: Float32Array;
  dimensions: number;
  /** Embedding model identifier — schema invalidation key. */
  model: string;
  indexedAt: number;
}

/** Lightweight chunk metadata without the embedding vector. */
export interface ChunkMetadata {
  id: string;
  filePath: string;
  symbolName: string;
  symbolType: string;
  startLine: number;
  endLine: number;
  contentHash: string;
}

/** A chunk candidate produced by the chunker (before embedding). */
export interface ChunkCandidate {
  filePath: string;
  symbolName: string;
  symbolType: string;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
}

/** A search result with similarity score. */
export interface EmbeddingSearchResult {
  chunk: ChunkMetadata;
  score: number;
  content?: string;
}

/** Index health status. */
export interface EmbeddingIndexStatus {
  totalChunks: number;
  totalFiles: number;
  lastIndexedAt: number;
  model: string;
  dimensions: number;
}

/** Store contract — implemented by SQLite-backed store. */
export interface IEmbeddingStore {
  upsertChunks(chunks: EmbeddingChunk[]): void;
  deleteByFile(filePath: string): void;
  searchSimilar(
    queryEmbedding: Float32Array,
    topK: number,
  ): EmbeddingSearchResult[];
  getChunksByFile(filePath: string): ChunkMetadata[];
  getStatus(): EmbeddingIndexStatus;
  hasChunkHash(contentHash: string): boolean;
  getModelVersion(): string;
  clear(): void;
  close(): void;
}

/** Tells the provider whether the input is content to be indexed or a search query. */
export type EmbeddingInputType = 'document' | 'query';

/** Embedding provider contract — generates vectors from text. */
export interface IEmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[], inputType?: EmbeddingInputType): Promise<Float32Array[]>;
}
