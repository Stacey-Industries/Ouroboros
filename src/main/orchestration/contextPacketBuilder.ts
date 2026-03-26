import { createHash, randomUUID } from 'crypto';

import log from '../logger';
import { buildFilePayload } from './contextPacketBuilderHelpers';
import { extractGoalKeywords } from './contextPacketBuilderKeywords';
import { buildBudgetSummary, getModelBudgets } from './contextPacketBuilderSupport';
import { type ContextFileSnapshot } from './contextSelectionSupport';
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
  return { selection: cached.result.selection, packet: updatedPacket };
}

async function enrichPacketWithSystemInstructions(
  packet: ContextPacket,
  request: TaskRequest,
): Promise<ContextPacket> {
  const enriched = { ...packet };
  try {
    const { readRulesForProvider } = await import('../rulesAndSkills/rulesReader');
    const workspaceRoot = request.workspaceRoots[0];
    if (workspaceRoot) {
      const content = await readRulesForProvider(workspaceRoot, request.provider);
      if (content) enriched.systemInstructions = content;
    }
  } catch {
    // Rules injection is optional — non-fatal
  }
  if (request.skillExpansion) enriched.skillInstructions = request.skillExpansion;
  return enriched;
}

async function enrichPacketWithContextLayer(
  packet: ContextPacket,
  goal: string,
): Promise<ContextPacket> {
  try {
    const { getContextLayerController } = await import('../contextLayer/contextLayerController');
    const layerController = getContextLayerController();
    if (layerController) {
      const enriched = await layerController.enrichPacket(
        packet,
        extractGoalKeywords(goal),
      );
      return enriched.packet;
    }
  } catch {
    // Context layer enrichment is optional — unavailable in worker threads
  }
  return packet;
}

type OmittedCandidates = ContextPacket['omittedCandidates'];
type PacketBudget = ReturnType<typeof buildBudgetSummary>;

function omitOverBudget(
  filePath: string,
  maxFiles: number,
  budget: PacketBudget,
  omitted: OmittedCandidates,
): void {
  omitted.push({ filePath, reason: 'Excluded after ranking because maxFiles budget was reached' });
  budget.droppedContentNotes.push(`Skipped ${filePath} because maxFiles=${maxFiles} was reached`);
}

function omitNoSnippets(filePath: string, budget: PacketBudget, omitted: OmittedCandidates): void {
  omitted.push({ filePath, reason: 'All snippets were omitted by packet budgeting rules' });
  budget.droppedContentNotes.push(`Omitted ${filePath} because no snippets fit within the budget`);
}

async function buildPacketFiles(options: {
  selection: ContextSelectionResult;
  maxFiles: number;
  maxSnippetsPerFile: number;
  budget: PacketBudget;
  cache?: Map<string, ContextFileSnapshot>;
  fullFileLineLimit?: number;
  targetedSnippetLineLimit?: number;
}): Promise<{ files: RankedContextFile[]; omittedCandidates: OmittedCandidates }> {
  const { selection, maxFiles, maxSnippetsPerFile, budget, cache } = options;
  const files: RankedContextFile[] = [];
  const omittedCandidates = [...selection.omittedCandidates];
  for (const rankedFile of selection.rankedFiles) {
    if (files.length >= maxFiles) {
      omitOverBudget(rankedFile.filePath, maxFiles, budget, omittedCandidates);
      continue;
    }
    const filePayload = await buildFilePayload({
      rankedFile,
      liveIdeState: selection.liveIdeState,
      maxSnippetsPerFile,
      budget,
      cache,
      fullFileLineLimit: options.fullFileLineLimit,
      targetedSnippetLineLimit: options.targetedSnippetLineLimit,
    });
    if (!filePayload) {
      omitNoSnippets(rankedFile.filePath, budget, omittedCandidates);
      continue;
    }
    files.push(filePayload);
  }
  return { files, omittedCandidates };
}

async function buildFullContextPacket(options: {
  request: TaskRequest;
  repoFacts: RepoFacts;
  liveIdeState?: LiveIdeState;
  model?: string;
  repoSnapshot?: RepoIndexSnapshot;
}): Promise<ContextPacketBuildResult> {
  const modelBudgets = getModelBudgets(options.model ?? '');
  const selection = await selectContextFiles(options);
  const snapshotCache = new Map(Object.entries(selection.snapshots));
  const budget = buildBudgetSummary(
    options.request.budget?.maxBytes ?? modelBudgets.maxBytes,
    options.request.budget?.maxTokens ?? modelBudgets.maxTokens,
  );
  const { files, omittedCandidates } = await buildPacketFiles({
    selection,
    maxFiles: options.request.budget?.maxFiles ?? modelBudgets.maxFiles,
    maxSnippetsPerFile:
      options.request.budget?.maxSnippetsPerFile ?? modelBudgets.maxSnippetsPerFile,
    budget,
    cache: snapshotCache,
    fullFileLineLimit: modelBudgets.fullFileLineLimit,
    targetedSnippetLineLimit: modelBudgets.targetedSnippetLineLimit,
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
  packet = await enrichPacketWithContextLayer(packet, options.request.goal);
  packet = await enrichPacketWithSystemInstructions(packet, options.request);
  return { selection, packet };
}

export async function buildContextPacket(options: {
  request: TaskRequest;
  repoFacts: RepoFacts;
  liveIdeState?: LiveIdeState;
  model?: string;
  repoSnapshot?: RepoIndexSnapshot;
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
