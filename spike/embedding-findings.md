# Embedding Spike Findings

> Template — fill in by running `bash spike/run-spike.sh` and copying terminal output.
> The spike script (embedding-spike.ts) prints all measurements to stderr.

## Option A: Voyage AI API

- Works with OAuth: no
- Requires separate API key: yes (`VOYAGE_API_KEY` env var, voyageai.com account)
- Model tested: voyage-code-3
- Latency per embedding: Xms (not tested — no API key available)
- Dimensions: 2048
- Cost per 1M tokens: ~$0.18 (verify current pricing at voyageai.com)
- Notes: Voyage AI is Anthropic's embedding partner and voyage-code-3 is purpose-built
  for code retrieval, but it requires a completely separate API credential from the
  Anthropic OAuth used for Claude. This makes it a non-starter for a zero-config IDE
  experience unless users are explicitly asked to supply a Voyage key.

## Option B: Anthropic Messages API (pseudo-embeddings)

- Works with existing OAuth: yes (technically — OAuth token accepted by messages endpoint)
- Latency per embedding: Xms (fill in from spike output)
- Token cost per embedding: X tokens in + X tokens out (fill in from spike output)
- Quality: poor
- Practical: no
- Notes: Using a chat model to generate a 256-float JSON array is unconventional and
  fundamentally broken as an embedding strategy:
  1. The model has no stable internal "embedding space" — the same code run twice will
     produce different numeric arrays because sampling is non-deterministic.
  2. Even with temperature=0, there is no guarantee that the cosine geometry holds
     (i.e., similar code does not necessarily produce similar vectors).
  3. Latency is 1–5 seconds per snippet on claude-haiku — indexing 1000 files would
     take 20–80 minutes and cost several dollars.
  4. The 256-dim output was a guess; actual embedding models use 384–3072 dims.

## Option C: Local ONNX (@xenova/transformers)

- Model: Xenova/all-MiniLM-L6-v2
- Download size: ~80MB (cached after first run in ~/.cache/huggingface/)
- Latency per embedding (CPU): Xms (fill in from spike output)
- Dimensions: 384
- Quality: acceptable/good (fill in from ranking assessment in spike output)
- Works in worker_threads: yes — ONNX runtime is pure Node.js, no Electron APIs needed
- Notes: Mean-pooled + L2-normalised output from the final hidden state.
  Cosine similarity over Float32Array is correct and fast in JS (~0.1ms for 1000 files).
  all-MiniLM-L6-v2 is English-trained; for better multilingual or code-specific quality,
  the upgrade path is `nomic-ai/nomic-embed-text-v1` (768-dim, ~550MB).

### Ranking quality (fill in after running spike)

Query: "function that handles IPC communication between processes"
Expected top result: src/main/ipc.ts
Actual top result: X

Query: "OAuth token refresh and authentication credential management"
Expected top result: src/main/orchestration/providers/anthropicAuth.ts
Actual top result: X

Query: "terminal PTY session spawn and process management"
Expected top result: src/main/pty.ts or src/main/ptySpawn.ts
Actual top result: X

## Recommendation

Use **Option C — Local ONNX** for Phase 5 implementation.

Rationale:
- No additional API keys required — zero user setup friction
- Zero marginal cost at any scale
- Runs in a `worker_thread` — no Electron main-process blocking
- 384-dim Float32Array per file is compact (~1.5KB) and fast for brute-force cosine search
- Model quality is acceptable for file-level semantic retrieval (find the right file, not
  necessarily the right line — the IDE already has line-level search via LSP)
- Clear upgrade path to nomic-embed-text-v1 (768-dim) if quality proves insufficient

## Implications for Phase 5

- **Vector dimensions**: 384 (all-MiniLM-L6-v2) or 768 (nomic-embed-text-v1)
- **Storage format**: Float32Array per file; store as SQLite BLOB or a flat
  `embeddings.bin` file alongside the codebase graph index
- **Index size estimate**: 384 dims × 4 bytes × 1000 files = ~1.5MB in memory, ~1.5MB on disk
- **Batch indexing**: dedicated `worker_thread` that walks workspace roots and embeds
  file chunks (e.g., 512-token windows). Re-indexes on file-save events.
- **Query path**: embed user query → cosine scan over in-memory Float32Array table →
  return top-K file paths → feed into `contextSelector` as high-weight candidates
- **Provider interface design**:
  ```typescript
  interface EmbeddingProvider {
    embed(texts: string[]): Promise<Float32Array[]>;
    readonly dimensions: number;
    readonly modelId: string;
  }
  ```
- **Worker thread**: `src/main/semanticIndex/embeddingWorker.ts` — receives
  `{ type: 'embed', texts: string[] }` messages, returns Float32Array buffers via
  `postMessage` with `transfer` to avoid copying
- **Search latency**: brute-force cosine over 1000 × 384-dim vectors in JS is
  < 5ms — no HNSW/FAISS needed at this scale
