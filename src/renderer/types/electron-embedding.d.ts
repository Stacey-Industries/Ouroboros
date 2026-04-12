/** Embedding search API exposed via preload bridge. */

export interface EmbeddingSearchResult {
  chunk: {
    id: string;
    filePath: string;
    symbolName: string;
    symbolType: string;
    startLine: number;
    endLine: number;
    contentHash: string;
  };
  score: number;
}

export interface EmbeddingIndexStatus {
  totalChunks: number;
  totalFiles: number;
  lastIndexedAt: number;
  model: string;
  dimensions: number;
}

export interface EmbeddingAPI {
  search(
    query: string,
    projectRoot: string,
    topK?: number,
  ): Promise<{ success: boolean; results?: EmbeddingSearchResult[]; error?: string }>;
  getStatus(
    projectRoot: string,
  ): Promise<{ success: boolean; status?: EmbeddingIndexStatus; error?: string }>;
  reindex(
    projectRoot: string,
  ): Promise<{ success: boolean; chunksIndexed?: number; filesProcessed?: number; error?: string }>;
}
