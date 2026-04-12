/**
 * embeddingProvider.ts — Embedding generation providers.
 *
 * Local ONNX provider (Xenova/all-MiniLM-L6-v2, 384 dims) is the default.
 * Stub provider remains for unit tests.
 */

import type { EmbeddingInputType, IEmbeddingProvider } from './embeddingTypes';

const LOCAL_MODEL = 'Xenova/all-MiniLM-L6-v2';
const LOCAL_DIMS = 384;
const VOYAGE_MODEL = 'voyage-code-3';
const VOYAGE_DIMS = 1024;
const VOYAGE_ENDPOINT = 'https://api.voyageai.com/v1/embeddings';

type EmbedderFn = (
  text: string | string[],
  opts: { pooling: string; normalize: boolean },
) => Promise<{ data: Float32Array | Iterable<number>; dims: number[] }>;

let cachedEmbedder: EmbedderFn | null = null;
let pendingEmbedder: Promise<EmbedderFn> | null = null;

async function loadLocalEmbedder(): Promise<EmbedderFn> {
  if (cachedEmbedder) return cachedEmbedder;
  if (pendingEmbedder) return pendingEmbedder;
  pendingEmbedder = (async (): Promise<EmbedderFn> => {
     
    const transformers = (await import('@xenova/transformers' as string)) as {
      pipeline: (task: string, model: string) => Promise<EmbedderFn>;
    };
    const embedder = await transformers.pipeline('feature-extraction', LOCAL_MODEL);
    cachedEmbedder = embedder;
    return embedder;
  })();
  return pendingEmbedder;
}

function toFloat32(data: Float32Array | Iterable<number>): Float32Array {
  if (data instanceof Float32Array) return data;
  return new Float32Array(data);
}

/**
 * Local ONNX provider — runs Xenova/all-MiniLM-L6-v2 in-process.
 * 384 dimensions, ~17ms/embedding on CPU. No API calls, $0 cost.
 * Ignores inputType — MiniLM does not distinguish documents from queries.
 */
export function createLocalOnnxProvider(): IEmbeddingProvider {
  return {
    model: LOCAL_MODEL,
    dimensions: LOCAL_DIMS,
    async embed(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      const embedder = await loadLocalEmbedder();
      const results: Float32Array[] = [];
      for (const text of texts) {
        const out = await embedder(text, { pooling: 'mean', normalize: true });
        results.push(toFloat32(out.data));
      }
      return results;
    },
  };
}

interface VoyageResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { total_tokens: number };
}

async function callVoyageApi(
  apiKey: string,
  texts: string[],
  inputType: EmbeddingInputType,
): Promise<Float32Array[]> {
  const response = await fetch(VOYAGE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: texts,
      input_type: inputType,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Voyage API ${response.status}: ${errText.slice(0, 200)}`);
  }
  const json = (await response.json()) as VoyageResponse;
  const sorted = json.data.sort((a, b) => a.index - b.index);
  return sorted.map((item) => new Float32Array(item.embedding));
}

/**
 * Voyage AI provider — uses voyage-code-3 over HTTPS.
 * 1024 dimensions, code-trained, requires VOYAGE_API_KEY.
 * Higher quality than local for most code retrieval tasks.
 */
export function createVoyageProvider(apiKey: string): IEmbeddingProvider {
  if (!apiKey) throw new Error('Voyage API key is required');
  return {
    model: VOYAGE_MODEL,
    dimensions: VOYAGE_DIMS,
    async embed(texts: string[], inputType: EmbeddingInputType = 'document'): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      // Voyage allows up to 128 inputs per request
      const batches: string[][] = [];
      for (let i = 0; i < texts.length; i += 128) batches.push(texts.slice(i, i + 128));
      const results: Float32Array[] = [];
      for (const batch of batches) {
        const vectors = await callVoyageApi(apiKey, batch, inputType);
        results.push(...vectors);
      }
      return results;
    },
  };
}

/**
 * Stub provider — returns zero vectors of specified dimensions.
 * Use for unit tests so they don't load the ONNX model.
 */
export function createStubProvider(dimensions = LOCAL_DIMS): IEmbeddingProvider {
  return {
    model: 'stub',
    dimensions,
    async embed(texts: string[]): Promise<Float32Array[]> {
      return texts.map(() => new Float32Array(dimensions));
    },
  };
}

/**
 * Creates the appropriate provider based on config.
 * Priority: explicit voyage with key > local ONNX > stub.
 */
export function createProvider(config: {
  provider?: string;
  voyageApiKey?: string;
}): IEmbeddingProvider {
  if (config.provider === 'voyage' && config.voyageApiKey) {
    return createVoyageProvider(config.voyageApiKey);
  }
  if (config.provider === 'stub') return createStubProvider();
  return createLocalOnnxProvider();
}
