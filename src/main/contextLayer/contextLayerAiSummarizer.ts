/**
 * contextLayerAiSummarizer.ts — AI-powered module summarization, enrichment,
 * and summary persistence. Extracted from contextLayerController.ts.
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

import type { ModuleContextSummary } from '../orchestration/types';
import type { CachedModuleData, DetectedModule } from './contextLayerControllerHelpers';
import { selectRepresentativeFiles } from './contextLayerControllerHelpers';

export interface AiSummarizerState {
  failureCount: number;
  maxFailures: number;
}

export function createAiSummarizerState(maxFailures: number): AiSummarizerState {
  return { failureCount: 0, maxFailures };
}

export async function aiSummarizeModule(
  state: AiSummarizerState,
  mod: DetectedModule,
  existing: ModuleContextSummary,
): Promise<ModuleContextSummary | null> {
  if (state.failureCount >= state.maxFailures) return null;

  try {
    return await callAiForSummary(state, mod, existing);
  } catch (err) {
    handleAiFailure(state, mod.id, err);
    return null;
  }
}

async function callAiForSummary(
  state: AiSummarizerState,
  mod: DetectedModule,
  existing: ModuleContextSummary,
): Promise<ModuleContextSummary | null> {
  const { createAnthropicClient } = await import('../orchestration/providers/anthropicAuth');
  const client = await createAnthropicClient();

  const snippets = await readRepresentativeSnippets(mod);
  const prompt = buildAiPrompt(mod, snippets);

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseAiResponse(state, response, existing);
}

async function readRepresentativeSnippets(mod: DetectedModule): Promise<string[]> {
  const repFiles = selectRepresentativeFiles(mod);
  const snippets: string[] = [];
  for (const f of repFiles) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- f.path is from repo index (internal, not user input)
      const content = await readFile(f.path, 'utf-8');
      snippets.push(`// ${path.basename(f.relativePath)}\n${content.slice(0, 1500)}`);
    } catch {
      // skip unreadable files
    }
  }
  return snippets;
}

function buildAiPrompt(mod: DetectedModule, snippets: string[]): string {
  const topExports = mod.exports.slice(0, 8).join(', ');
  return [
    `Analyze this TypeScript module from a developer IDE codebase.`,
    `Module path: ${mod.id} (${mod.files.length} files)`,
    `Key exports: ${topExports || 'none'}`,
    ``,
    snippets.join('\n\n---\n\n').slice(0, 3000),
    ``,
    `Respond with ONLY a JSON object (no markdown):`,
    `{"description":"<1-2 sentence natural language description>","responsibilities":["<up to 5 specific tasks>"],"gotchas":["<0-2 non-obvious caveats, empty array if none>"]}`,
  ].join('\n');
}

function parseAiResponse(
  state: AiSummarizerState,
  response: { content: Array<{ type: string; text?: string }> },
  existing: ModuleContextSummary,
): ModuleContextSummary | null {
  const textBlock = response.content[0];
  const text =
    textBlock?.type === 'text' && 'text' in textBlock
      ? (textBlock as { type: 'text'; text: string }).text.trim()
      : null;
  if (!text) return null;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  if (typeof parsed.description !== 'string') return null;

  state.failureCount = 0;
  return {
    ...existing,
    description: parsed.description,
    keyResponsibilities: Array.isArray(parsed.responsibilities)
      ? (parsed.responsibilities as string[]).slice(0, 5)
      : existing.keyResponsibilities,
    gotchas: Array.isArray(parsed.gotchas)
      ? (parsed.gotchas as string[]).slice(0, 2)
      : existing.gotchas,
  };
}

function handleAiFailure(state: AiSummarizerState, moduleId: string, err: unknown): void {
  state.failureCount++;
  if (state.failureCount >= state.maxFailures) {
    console.warn(
      '[context-layer] AI enrichment disabled after',
      state.failureCount,
      'consecutive failures',
    );
  } else {
    console.warn(`[context-layer] AI summarize failed for ${moduleId}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Module enrichment queue + persistence
// ---------------------------------------------------------------------------

const AI_ENRICH_CONCURRENCY = 3;

export async function aiEnrichModules(opts: {
  moduleIds: string[];
  cachedModules: Map<string, CachedModuleData>;
  aiState: AiSummarizerState;
  workspaceRoots: string[];
}): Promise<void> {
  const { moduleIds, cachedModules, aiState, workspaceRoots } = opts;
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < moduleIds.length) {
      const id = moduleIds[cursor++];
      const cached = cachedModules.get(id);
      if (!cached || cached.aiEnriched) continue;

      const enriched = await aiSummarizeModule(aiState, cached.module, cached.summary);
      if (enriched) {
        cachedModules.set(id, { ...cached, summary: enriched, aiEnriched: true });
        console.log(`[context-layer] AI enriched: ${id}`);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(AI_ENRICH_CONCURRENCY, moduleIds.length) }, worker),
  );
  await persistSummaries(cachedModules, workspaceRoots);
}

export async function loadPersistedSummaries(
  cachedModules: Map<string, CachedModuleData>,
  workspaceRoots: string[],
): Promise<void> {
  if (workspaceRoots.length === 0) return;
  const cachePath = path.join(workspaceRoots[0], '.ouroboros', 'module-summaries.json');
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- cachePath built from workspace root + known constant
    const raw = await readFile(cachePath, 'utf-8');
    const entries = JSON.parse(raw) as Array<{
      id: string;
      summary: ModuleContextSummary;
      stateHash: string;
    }>;
    for (const entry of entries) {
      const existing = cachedModules.get(entry.id);
      if (existing && existing.stateHash === entry.stateHash && !existing.aiEnriched) {
        cachedModules.set(entry.id, { ...existing, summary: entry.summary, aiEnriched: true });
      }
    }
  } catch {
    // No cache file or corrupt — start fresh
  }
}

async function persistSummaries(
  cachedModules: Map<string, CachedModuleData>,
  workspaceRoots: string[],
): Promise<void> {
  if (workspaceRoots.length === 0) return;
  const cachePath = path.join(workspaceRoots[0], '.ouroboros', 'module-summaries.json');
  const entries = Array.from(cachedModules.entries())
    .filter(([, v]) => v.aiEnriched)
    .map(([id, v]) => ({ id, summary: v.summary, stateHash: v.stateHash }));
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- cachePath built from workspace root + known constant
    await mkdir(path.dirname(cachePath), { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- cachePath built from workspace root + known constant
    await writeFile(cachePath, JSON.stringify(entries, null, 2), 'utf-8');
  } catch {
    // Non-fatal
  }
}
