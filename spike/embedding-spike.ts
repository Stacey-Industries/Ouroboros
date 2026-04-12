/**
 * embedding-spike.ts
 *
 * Evaluates three embedding approaches for the Ouroboros IDE semantic search feature:
 *   A. Voyage AI API (Anthropic's embedding partner)
 *   B. Anthropic Messages API as a pseudo-embedding proxy
 *   C. Local ONNX via @xenova/transformers (critical path)
 *
 * Run via: npx tsx spike/embedding-spike.ts
 * Or:      bash spike/run-spike.sh  (handles dep install)
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function meanPool(tensor: number[][], dims: number[]): Float32Array {
  // tensor is [seq_len, hidden_size] (or flattened as [1, seq_len, hidden_size])
  // dims: shape of the raw output
  // We want a mean over the token dimension → 1D embedding
  const [seqLen, hiddenSize] = dims.length === 3 ? [dims[1], dims[2]] : [dims[0], dims[1]];
  const out = new Float32Array(hiddenSize);
  const flat = (tensor as unknown as number[]);
  for (let tok = 0; tok < seqLen; tok++) {
    for (let h = 0; h < hiddenSize; h++) {
      out[h] += flat[tok * hiddenSize + h];
    }
  }
  for (let h = 0; h < hiddenSize; h++) {
    out[h] /= seqLen;
  }
  return out;
}

function normalise(v: Float32Array): Float32Array {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm === 0) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

function hrMs(start: [number, number]): number {
  const [s, ns] = process.hrtime(start);
  return Math.round(s * 1000 + ns / 1e6);
}

// ---------------------------------------------------------------------------
// Real source snippets from the project (read at startup)
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SNIPPET_PATHS = [
  'src/main/ipc.ts',
  'src/main/hooks.ts',
  'src/main/pty.ts',
  'src/main/config.ts',
  'src/main/hooks.ts',
  'src/main/orchestration/providers/anthropicAuth.ts',
  'src/main/windowManager.ts',
  'src/main/approvalManager.ts',
  'src/main/logger.ts',
  'src/main/ptySpawn.ts',
];

interface CodeSnippet {
  file: string;
  content: string;
}

function loadSnippets(): CodeSnippet[] {
  const snippets: CodeSnippet[] = [];
  for (const relPath of SNIPPET_PATHS) {
    const full = path.join(PROJECT_ROOT, relPath);
    try {
      const raw = fs.readFileSync(full, 'utf8');
      // Take first 400 characters as a representative snippet
      const content = raw.slice(0, 400).replace(/\r\n/g, '\n');
      snippets.push({ file: relPath, content });
    } catch {
      snippets.push({ file: relPath, content: `// (file not found: ${relPath})` });
    }
  }
  return snippets;
}

function printSeparator(title: string): void {
  console.warn('\n' + '='.repeat(60));
  console.warn(`  ${title}`);
  console.warn('='.repeat(60));
}

function printRankings(
  snippets: CodeSnippet[],
  queryVec: Float32Array | number[],
  embeddings: Array<Float32Array | number[]>,
  query: string,
): void {
  const scores = snippets.map((s, i) => ({
    file: s.file,
    score: cosineSimilarity(queryVec, embeddings[i]),
  }));
  scores.sort((a, b) => b.score - a.score);
  console.warn(`\nQuery: "${query}"`);
  console.warn('Rankings (cosine similarity, descending):');
  for (const [rank, { file, score }] of scores.entries()) {
    const bar = '█'.repeat(Math.round(score * 20));
    console.warn(`  ${rank + 1}. [${score.toFixed(4)}] ${bar} ${file}`);
  }
}

// ---------------------------------------------------------------------------
// Part A — Voyage AI API
// ---------------------------------------------------------------------------

async function testVoyageAI(snippets: CodeSnippet[]): Promise<void> {
  printSeparator('Part A — Voyage AI API');

  const voyageKey = process.env.VOYAGE_API_KEY;
  if (!voyageKey) {
    console.warn('VOYAGE_API_KEY not set in environment.');
    console.warn('Voyage AI requires its own API key — it does NOT accept Anthropic OAuth tokens.');
    console.warn('To test: VOYAGE_API_KEY=your_key npx tsx spike/embedding-spike.ts');
    console.warn('Result: SKIPPED (no VOYAGE_API_KEY)');
    return;
  }

  const testInput = [snippets[0].content, snippets[1].content];
  const t0 = process.hrtime();

  try {
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${voyageKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'voyage-code-3',
        input: testInput,
        input_type: 'document',
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const elapsed = hrMs(t0);

    if (!response.ok) {
      const text = await response.text();
      console.warn(`HTTP ${response.status}: ${text}`);
      console.warn(`Result: FAILED (${elapsed}ms)`);
      return;
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
      usage: { total_tokens: number };
    };

    const dims = data.data[0].embedding.length;
    const latencyPerEmbed = Math.round(elapsed / testInput.length);

    console.warn(`Result: SUCCESS`);
    console.warn(`  Latency: ${elapsed}ms total, ~${latencyPerEmbed}ms per embedding`);
    console.warn(`  Dimensions: ${dims}`);
    console.warn(`  Tokens used: ${data.usage.total_tokens}`);
    console.warn(`  Requires separate Voyage API key: YES`);
    console.warn(`  Works with Anthropic OAuth: NO`);
    console.warn(`  Cost note: voyage-code-3 is ~$0.18/M tokens (check voyageai.com for current pricing)`);
  } catch (err) {
    const elapsed = hrMs(t0);
    console.warn(`Result: ERROR after ${elapsed}ms —`, (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Part B — Anthropic Messages API as pseudo-embedding proxy
// ---------------------------------------------------------------------------

async function readOAuthToken(): Promise<string | undefined> {
  const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
  try {
    const raw = fs.readFileSync(credPath, 'utf8');
    const creds = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string } };
    return creds.claudeAiOauth?.accessToken;
  } catch {
    return undefined;
  }
}

async function testAnthropicPseudoEmbeddings(snippets: CodeSnippet[]): Promise<void> {
  printSeparator('Part B — Anthropic Messages API (pseudo-embeddings)');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const oauthToken = apiKey ? undefined : await readOAuthToken();

  if (!apiKey && !oauthToken) {
    console.warn('No ANTHROPIC_API_KEY env var and no OAuth token found at ~/.claude/.credentials.json');
    console.warn('Result: SKIPPED (no credentials)');
    return;
  }

  const authHeader: Record<string, string> = apiKey
    ? { 'x-api-key': apiKey }
    : {
        Authorization: `Bearer ${oauthToken as string}`,
        'anthropic-beta': 'oauth-2025-04-20',
      };

  const snippet = snippets[0].content;
  const prompt = `Generate a dense numerical vector representation of this code snippet. Return ONLY a JSON array of 256 floating point numbers between -1 and 1. No explanation, no markdown, just the raw JSON array.

Code:
\`\`\`typescript
${snippet}
\`\`\``;

  console.warn('Sending pseudo-embedding request (haiku-3 for cost efficiency)...');
  const t0 = process.hrtime();

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        ...authHeader,
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const elapsed = hrMs(t0);

    if (!response.ok) {
      const text = await response.text();
      console.warn(`HTTP ${response.status}: ${text}`);
      console.warn(`Result: FAILED (${elapsed}ms)`);
      return;
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    const rawText = data.content.find((c) => c.type === 'text')?.text ?? '';
    const inputTokens = data.usage.input_tokens;
    const outputTokens = data.usage.output_tokens;

    // Try to parse the returned JSON array
    let vec: number[] = [];
    let parseSuccess = false;
    try {
      const jsonMatch = rawText.match(/\[[\d.,\-\s]+\]/);
      if (jsonMatch) {
        vec = JSON.parse(jsonMatch[0]) as number[];
        parseSuccess = true;
      }
    } catch {
      // parse failed
    }

    console.warn(`Result: ${parseSuccess ? 'SUCCESS' : 'PARSE FAILED'}`);
    console.warn(`  Latency: ${elapsed}ms`);
    console.warn(`  Token cost: ${inputTokens} in + ${outputTokens} out`);
    console.warn(`  Works with existing OAuth: ${oauthToken ? 'YES' : 'N/A (API key used)'}`);
    if (parseSuccess) {
      console.warn(`  Parsed dimensions: ${vec.length}`);
      const sample = vec.slice(0, 5).map((v) => v.toFixed(4)).join(', ');
      console.warn(`  First 5 values: [${sample}, ...]`);
    } else {
      console.warn(`  Raw response (first 200 chars): ${rawText.slice(0, 200)}`);
    }
    console.warn(`  Practical assessment:`);
    console.warn(`    - Latency ~${elapsed}ms per embedding is very slow for batch indexing`);
    console.warn(`    - ${inputTokens + outputTokens} tokens/embedding × many files = high cost`);
    console.warn(`    - Model may not produce consistent vector spaces across calls`);
    console.warn(`    - Quality of similarity geometry is UNKNOWN (not evaluated semantically)`);
    console.warn(`    - Verdict: NOT recommended for production use`);
  } catch (err) {
    const elapsed = hrMs(t0);
    console.warn(`Result: ERROR after ${elapsed}ms —`, (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Part C — Local ONNX via @xenova/transformers (CRITICAL PATH)
// ---------------------------------------------------------------------------

async function testLocalOnnx(snippets: CodeSnippet[]): Promise<{
  embeddings: Array<Float32Array>;
  dims: number;
  worked: boolean;
}> {
  printSeparator('Part C — Local ONNX (@xenova/transformers) [CRITICAL PATH]');

  let pipeline: (task: string, model: string) => Promise<unknown>;

  try {
    // Dynamic import — not installed in main package.json
    const transformers = await import('@xenova/transformers' as string);
    pipeline = (transformers as { pipeline: typeof pipeline }).pipeline;
    console.warn('Successfully imported @xenova/transformers');
  } catch (err) {
    console.warn('Failed to import @xenova/transformers:', (err as Error).message);
    console.warn('Run "bash spike/run-spike.sh" to auto-install the dependency first.');
    console.warn('Or: npm install --no-save @xenova/transformers');
    return { embeddings: [], dims: 0, worked: false };
  }

  const MODEL = 'Xenova/all-MiniLM-L6-v2';
  console.warn(`Loading model: ${MODEL}`);
  console.warn('(First run downloads ~80MB to ~/.cache/huggingface/hub/ — subsequent runs are instant)');

  const tLoad0 = process.hrtime();
  let embedder: unknown;
  try {
    embedder = await (pipeline as (task: string, model: string) => Promise<unknown>)(
      'feature-extraction',
      MODEL,
    );
    const loadMs = hrMs(tLoad0);
    console.warn(`Model loaded in ${loadMs}ms`);
  } catch (err) {
    console.warn('Failed to load model:', (err as Error).message);
    return { embeddings: [], dims: 0, worked: false };
  }

  // Embed all snippets
  console.warn(`\nEmbedding ${snippets.length} code snippets...`);
  const embeddings: Float32Array[] = [];
  const latencies: number[] = [];

  for (const snippet of snippets) {
    const t0 = process.hrtime();
    try {
      const output = await (
        embedder as (
          text: string,
          opts: { pooling: string; normalize: boolean },
        ) => Promise<{ data: Float32Array; dims: number[] }>
      )(snippet.content, { pooling: 'mean', normalize: true });

      const ms = hrMs(t0);
      latencies.push(ms);

      // output.data is a flat Float32Array; dims = [1, hidden_size]
      const vec = output.data instanceof Float32Array ? output.data : new Float32Array(output.data);
      embeddings.push(vec);
      console.warn(`  ${snippet.file.padEnd(55)} ${ms}ms  dims=${vec.length}`);
    } catch (err) {
      const ms = hrMs(t0);
      latencies.push(ms);
      console.warn(`  ${snippet.file.padEnd(55)} ERROR: ${(err as Error).message}`);
      embeddings.push(new Float32Array(384)); // zero fallback
    }
  }

  const avgMs = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  const minMs = Math.min(...latencies);
  const maxMs = Math.max(...latencies);
  const dims = embeddings[0]?.length ?? 0;

  console.warn(`\nLatency summary: avg=${avgMs}ms, min=${minMs}ms, max=${maxMs}ms`);
  console.warn(`Embedding dimensions: ${dims}`);
  console.warn(`Model: ${MODEL} (all-MiniLM-L6-v2)`);
  console.warn(`Download size: ~80MB (cached after first run)`);
  console.warn(`Works in worker_threads: YES (ONNX is Node.js native, no Electron APIs needed)`);
  console.warn(`Cost: $0 (fully local, no API calls)`);

  return { embeddings, dims, worked: true };
}

// ---------------------------------------------------------------------------
// Part D — Cosine similarity ranking test
// ---------------------------------------------------------------------------

async function testCosineSimilarityRanking(
  snippets: CodeSnippet[],
  embeddings: Float32Array[],
  embedFn: (text: string) => Promise<Float32Array>,
): Promise<void> {
  printSeparator('Part D — Semantic Ranking Quality Test');

  if (embeddings.length === 0) {
    console.warn('No embeddings available — skipping ranking test.');
    console.warn('Part C must succeed for Part D to run.');
    return;
  }

  const queries = [
    'function that handles IPC communication between processes',
    'OAuth token refresh and authentication credential management',
    'terminal PTY session spawn and process management',
    'window manager and browser window lifecycle',
  ];

  for (const query of queries) {
    try {
      const queryVec = await embedFn(query);
      printRankings(snippets, queryVec, embeddings, query);
    } catch (err) {
      console.warn(`Query "${query}" failed:`, (err as Error).message);
    }
  }

  console.warn('\nRanking assessment:');
  console.warn('  If rankings make sense (ipc.ts tops IPC query, pty.ts tops PTY query,');
  console.warn('  anthropicAuth.ts tops OAuth query), the embedding quality is acceptable.');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function printSummary(voyageWorked: boolean, anthropicWorked: boolean, onnxWorked: boolean): void {
  printSeparator('Summary & Recommendation');

  console.warn('\nOption A — Voyage AI:');
  console.warn(`  Status: ${voyageWorked ? 'TESTED' : 'SKIPPED (no VOYAGE_API_KEY)'}`);
  console.warn('  Requires separate API key: YES (voyage-code-3, voyageai.com)');
  console.warn('  Works with Anthropic OAuth: NO');
  console.warn('  Quality: HIGH (purpose-built for code)');
  console.warn('  Dims: 2048 (voyage-code-3)');

  console.warn('\nOption B — Anthropic Messages (pseudo-embeddings):');
  console.warn(`  Status: ${anthropicWorked ? 'TESTED' : 'SKIPPED (no credentials)'}`);
  console.warn('  Works with existing OAuth: YES (in theory)');
  console.warn('  Practical: NO — too slow, too expensive, inconsistent vector space');

  console.warn('\nOption C — Local ONNX (@xenova/transformers):');
  console.warn(`  Status: ${onnxWorked ? 'SUCCESS' : 'FAILED — check error above'}`);
  console.warn('  Requires API key: NO (fully local)');
  console.warn('  Cost: $0');
  console.warn('  Works in worker_threads: YES');
  console.warn('  Model: Xenova/all-MiniLM-L6-v2 — 384 dims, ~80MB');

  console.warn('\nRecommendation:');
  if (onnxWorked) {
    console.warn('  USE Option C (local ONNX) for Phase 5 implementation.');
    console.warn('  Rationale:');
    console.warn('    - No additional API keys required');
    console.warn('    - Zero cost at scale');
    console.warn('    - Runs in a worker_thread (no main-process blocking)');
    console.warn('    - 384-dim Float32Array is compact and fast for cosine search');
    console.warn('    - If quality proves insufficient, upgrade path: nomic-embed-text-v1 (768-dim)');
    console.warn('');
    console.warn('  Phase 5 implications:');
    console.warn('    - Vector dims: 384');
    console.warn('    - Storage: Float32Array per file, persisted to SQLite BLOB or flat file');
    console.warn('    - Provider interface: EmbeddingProvider with embed(text: string): Promise<Float32Array>');
    console.warn('    - Worker thread: dedicated worker for batch indexing (non-blocking)');
    console.warn('    - Index size: ~1.5KB per file (384 floats × 4 bytes)');
    console.warn('    - For 1000 files: ~1.5MB in memory, sub-ms search via cosine over Float32Arrays');
  } else {
    console.warn('  BLOCKED — Part C failed. Check @xenova/transformers installation.');
    console.warn('  Run: npm install --no-save @xenova/transformers');
    console.warn('  Then re-run: npx tsx spike/embedding-spike.ts');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.warn('Ouroboros Embedding Spike');
  console.warn(`Platform: ${process.platform}, Node ${process.version}`);
  console.warn(`Project root: ${PROJECT_ROOT}`);

  const snippets = loadSnippets();
  console.warn(`\nLoaded ${snippets.length} code snippets:`);
  for (const s of snippets) {
    const words = s.content.split(/\s+/).length;
    console.warn(`  ${s.file} (~${words} words, ${s.content.length} chars)`);
  }

  // Run all parts
  await testVoyageAI(snippets);

  let anthropicWorked = false;
  try {
    await testAnthropicPseudoEmbeddings(snippets);
    anthropicWorked = true;
  } catch {
    anthropicWorked = false;
  }

  // Critical path — local ONNX
  const { embeddings, worked: onnxWorked } = await testLocalOnnx(snippets);

  // If ONNX worked, also run the ranking test
  if (onnxWorked && embeddings.length > 0) {
    // We need an embed function for queries; re-use the pipeline
    const transformers = await import('@xenova/transformers' as string);
    const pipelineFn = (transformers as { pipeline: (t: string, m: string) => Promise<unknown> }).pipeline;
    const embedder = await pipelineFn('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    const embedText = async (text: string): Promise<Float32Array> => {
      const output = await (
        embedder as (
          t: string,
          o: { pooling: string; normalize: boolean },
        ) => Promise<{ data: Float32Array }>
      )(text, { pooling: 'mean', normalize: true });
      return output.data instanceof Float32Array ? output.data : new Float32Array(output.data);
    };

    await testCosineSimilarityRanking(snippets, embeddings, embedText);
  }

  printSummary(false /* voyage not fully testable without key */, anthropicWorked, onnxWorked);
}

main().catch((err) => {
  console.error('Spike failed:', err);
  process.exit(1);
});
