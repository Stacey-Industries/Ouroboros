/** embeddings/ barrel — re-exports public API. */

export { chunkFile, chunkFileWithNodes } from './embeddingChunker';
export { indexFiles, indexProject } from './embeddingIndexer';
export { createProvider, createStubProvider } from './embeddingProvider';
export { fuseResults, searchSimilar } from './embeddingSearch';
export { createEmbeddingStore } from './embeddingStore';
export type {
  ChunkCandidate,
  ChunkMetadata,
  EmbeddingChunk,
  EmbeddingIndexStatus,
  EmbeddingSearchResult,
  IEmbeddingProvider,
  IEmbeddingStore,
} from './embeddingTypes';
