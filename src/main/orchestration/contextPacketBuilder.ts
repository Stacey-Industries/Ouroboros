import { createHash, randomUUID } from 'crypto';

import log from '../logger';
import { emitDecisionsForPacket } from './contextPacketBuilderDecisions';
import { extractGoalKeywords } from './contextPacketBuilderKeywords';
import { injectPinnedContext } from './contextPacketBuilderPins';
import { buildBudgetSummary, getModelBudgets } from './contextPacketBuilderSupport';
import {
  type BuildFilesOptions,
  buildPacketFiles,
  type PacketBudget,
} from './contextPacketBuilderTiers';
import { recordRankerSelection } from './contextRankerTelemetry';
import { rerankRankedFiles } from './contextReranker';
import { type ContextSelectionResult, selectContextFiles } from './contextSelector';
import type { RepoIndexSnapshot } from './repoIndexer';
import type {
  ContextPacket,
  LiveIdeState,
  RankedContextFile,
  RepoFacts,
  TaskRequest,
} from './types';

// ---------------------------------------------------------------------------
// Session-level context packet cache
// ---------------------------------------------------------------------------

interface CachedContextPacket {
  fingerprint: string;
  result: ContextPacketBuildResult;
  cachedAt: number;
}

/** Cache keyed by workspace root (joined). Stores the last built context packet per workspace. */
const contextPacketCache = new Map<string, CachedContextPacket>();

/** Maximum age (ms) for a cached context packet before it is considered stale. */
const CONTEXT_CACHE_TTL_MS = 60_000;

/**
 * Compute a cheap fingerprint from request metadata and repo facts.
 * This intentionally avoids reading file contents — it uses only paths,
 * counts, and the user's goal text so that a fingerprint comparison is
 * nearly free.
 */
function computeContextFingerprint(
  request: TaskRequest,
  repoFacts: RepoFacts,
  liveIdeState?: LiveIdeState,
): string {
  const hash = createHash('sha1');

  // Active file
  hash.update(liveIdeState?.activeFile ?? '');

  // Sorted open files
  const openFiles = [...(liveIdeState?.openFiles ?? [])].sort();
  hash.update(openFiles.join('\n'));

  // Sorted dirty files
  const dirtyFiles = [...(liveIdeState?.dirtyFiles ?? [])].sort();
  hash.update(dirtyFiles.join('\n'));

  // Git diff changed file count
  hash.update(String(repoFacts.gitDiff.changedFileCount));

  // Diagnostic error/warning counts
  hash.update(`${repoFacts.diagnostics.totalErrors}:${repoFacts.diagnostics.totalWarnings}`);

  // Mode and provider affect context selection
  hash.update(request.mode);
  hash.update(request.provider);

  return hash.digest('hex');
}

/**
 * Clear the context packet cache. Call this after git operations or other
 * events that invalidate cached context (e.g. branch switch, commit).
 */
export function clearContextPacketCache(): void {
  contextPacketCache.clear();
}

export interface ContextPacketBuildResult {
  packet: ContextPacket;
  selection: ContextSelectionResult;
  /** Wave 29.5 Phase B (H1) — always minted; callers stamp onto outcomeTraceId. */
  traceId: string;
}

function buildPacketTask(request: TaskRequest): ContextPacket['task'] {
  return {
    taskId: request.taskId ?? randomUUID(),
    goal: request.goal,
    mode: request.mode,
    provider: request.provider,
    verificationProfile: request.verificationProfile,
  };
}

function checkContextPacketCache(
  cacheKey: string,
  fingerprint: string,
  request: TaskRequest,
): ContextPacketBuildResult | null {
  const cached = contextPacketCache.get(cacheKey);
  if (
    !cached ||
    cached.fingerprint !== fingerprint ||
    Date.now() - cached.cachedAt >= CONTEXT_CACHE_TTL_MS
  ) {
    return null;
  }
  log.info('Cache hit — reusing context packet (age: %dms)', Date.now() - cached.cachedAt);
  const updatedPacket: ContextPacket = {
    ...cached.result.packet,
    id: randomUUID(),
    createdAt: Date.now(),
    task: buildPacketTask(request),
  };
  // Mint a fresh traceId for the cache-hit send so the caller can stamp
  // outcomeTraceId; decisions are NOT re-emitted (they were written on the
  // original build). The traceId here is send-scoped, not packet-scoped.
  return { selection: cached.result.selection, packet: updatedPacket, traceId: randomUUID() };
}

async function loadSystemInstructionsForProvider(request: TaskRequest): Promise<string | null> {
  // Claude Code CLI loads CLAUDE.md natively via directory walk — injecting
  // it as <system_instructions> would double it (~3k tokens/turn wasted).
  if (request.provider === 'claude-code') return null;
  const workspaceRoot = request.workspaceRoots[0];
  if (!workspaceRoot) return null;
  try {
    const { readRulesForProvider } = await import('../rulesAndSkills/rulesReader');
    return await readRulesForProvider(workspaceRoot, request.provider);
  } catch {
    return null;
  }
}

async function enrichPacketWithSystemInstructions(
  packet: ContextPacket,
  request: TaskRequest,
): Promise<ContextPacket> {
  const enriched = { ...packet };
  const content = await loadSystemInstructionsForProvider(request);
  if (content) enriched.systemInstructions = content;
  if (request.skillExpansion) enriched.skillInstructions = request.skillExpansion;
  return enriched;
}

async function enrichPacket(packet: ContextPacket, request: TaskRequest): Promise<ContextPacket> {
  const withLayer = await enrichPacketWithContextLayer(packet, request.goal, request.model);
  return enrichPacketWithSystemInstructions(withLayer, request);
}

async function enrichPacketWithContextLayer(
  packet: ContextPacket,
  goal: string,
  model?: string,
): Promise<ContextPacket> {
  try {
    const { getContextLayerController } = await import('../contextLayer/contextLayerController');
    const layerController = getContextLayerController();
    if (layerController) {
      const enriched = await layerController.enrichPacket(packet, extractGoalKeywords(goal), model);
      return enriched.packet;
    }
  } catch {
    // Context layer enrichment is optional — unavailable in worker threads
  }
  return packet;
}

function resolveFilesOpts(
  request: TaskRequest,
  selection: ContextSelectionResult,
  budget: PacketBudget,
): BuildFilesOptions {
  const mb = getModelBudgets('');
  return {
    selection,
    budget,
    cache: new Map(Object.entries(selection.snapshots)),
    maxFiles: request.budget?.maxFiles ?? mb.maxFiles,
    maxSnippetsPerFile: request.budget?.maxSnippetsPerFile ?? mb.maxSnippetsPerFile,
    fullFileLineLimit: mb.fullFileLineLimit,
    targetedSnippetLineLimit: mb.targetedSnippetLineLimit,
    userSelectedRanges: request.contextSelection?.userSelectedRanges,
  };
}

async function selectAndBuildFiles(input: {
  request: TaskRequest;
  repoFacts: RepoFacts;
  liveIdeState?: LiveIdeState;
  model?: string;
}): Promise<{
  selection: ContextSelectionResult;
  files: RankedContextFile[];
  omittedCandidates: ContextPacket['omittedCandidates'];
  budget: PacketBudget;
}> {
  const { request } = input;
  const mb = getModelBudgets(input.model ?? '');
  const rawSelection = await selectContextFiles(input);
  const selection: ContextSelectionResult = {
    ...rawSelection,
    rankedFiles: await rerankRankedFiles(request.goal, rawSelection.rankedFiles),
  };
  const budget = buildBudgetSummary(
    request.budget?.maxBytes ?? mb.maxBytes,
    request.budget?.maxTokens ?? mb.maxTokens,
  );
  const { files, omittedCandidates } = await buildPacketFiles(
    resolveFilesOpts(request, selection, budget),
  );
  return { selection, files, omittedCandidates, budget };
}

async function buildFullContextPacket(options: {
  request: TaskRequest;
  repoFacts: RepoFacts;
  liveIdeState?: LiveIdeState;
  model?: string;
  repoSnapshot?: RepoIndexSnapshot;
  traceId?: string;
  sessionId?: string;
}): Promise<ContextPacketBuildResult> {
  // Wave 29.5 Phase B (H1): Mint traceId unconditionally so every packet build
  // produces a training sample regardless of router state. The caller may supply
  // its own id (router-annotated path); if absent we generate one here.
  const traceId = options.traceId ?? randomUUID();
  const { selection, files, omittedCandidates, budget } = await selectAndBuildFiles(options);
  emitDecisionsForPacket(traceId, selection, files);
  // Wave 53b Phase B — observe post-rerank output; recordRankerSelection never throws.
  if (options.sessionId)
    recordRankerSelection({
      sessionId: options.sessionId,
      workspaceRoot: options.request.workspaceRoots[0] ?? '',
      files: selection.rankedFiles,
      totalFiles: selection.rankedFiles.length + selection.omittedCandidates.length,
    });
  let packet: ContextPacket = {
    version: 1,
    id: randomUUID(),
    createdAt: Date.now(),
    task: buildPacketTask(options.request),
    repoFacts: options.repoFacts,
    liveIdeState: selection.liveIdeState,
    files,
    omittedCandidates,
    budget,
  };
  if (options.sessionId) packet = injectPinnedContext(packet, options.sessionId, budget);
  packet = await enrichPacket(packet, options.request);
  return { selection, packet, traceId };
}

export async function buildContextPacket(options: {
  request: TaskRequest;
  repoFacts: RepoFacts;
  liveIdeState?: LiveIdeState;
  model?: string;
  repoSnapshot?: RepoIndexSnapshot;
  /** Wave 15: routing trace ID — join key for orchestration_traces rows (Wave 24 populates). */
  traceId?: string;
  /** Wave 25 Phase D: chat session ID for pinned context injection. */
  sessionId?: string;
}): Promise<ContextPacketBuildResult> {
  const cacheKey = options.request.workspaceRoots.slice().sort().join('|');
  const fingerprint = computeContextFingerprint(
    options.request,
    options.repoFacts,
    options.liveIdeState,
  );
  const cachedResult = checkContextPacketCache(cacheKey, fingerprint, options.request);
  if (cachedResult) return cachedResult;

  const result = await buildFullContextPacket(options);
  contextPacketCache.set(cacheKey, { fingerprint, result, cachedAt: Date.now() });
  log.info('Cache miss — built and cached new context packet');
  return result;
}
