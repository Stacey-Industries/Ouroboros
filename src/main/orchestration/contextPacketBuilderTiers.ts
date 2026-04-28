/**
 * contextPacketBuilderTiers.ts — split from contextPacketBuilder.ts
 *
 * Tier-based file group building: splits ranked files into tier-1 (highest
 * priority) and other tiers, applies per-tier byte budgets, and assembles
 * the final file list passed to the context packet.
 *
 * Extracted to keep contextPacketBuilder.ts under the ESLint max-lines limit.
 */

import { buildFilePayload } from './contextPacketBuilderHelpers';
import type { UserSelectedFileRange } from './contextPacketBuilderSupport';
import { DEFAULT_MAX_BYTES, DEFAULT_TIER_BUDGET, getFileTier } from './contextPacketBuilderSupport';
import type { ContextFileSnapshot } from './contextSelectionSupport';
import type { ContextSelectionResult } from './contextSelector';
import type { ContextBudgetSummary, OmittedContextCandidate, RankedContextFile } from './types';

// ---------------------------------------------------------------------------
// Shared budget + omission types
// ---------------------------------------------------------------------------

export type PacketBudget = ContextBudgetSummary & {
  droppedContentNotes: string[];
  byteLimit?: number;
  tokenLimit?: number;
  tierAllocation?: Record<string, number>;
};

export type OmittedCandidates = OmittedContextCandidate[];

// ---------------------------------------------------------------------------
// BuildFilesOptions
// ---------------------------------------------------------------------------

export interface BuildFilesOptions {
  selection: ContextSelectionResult;
  maxFiles: number;
  maxSnippetsPerFile: number;
  budget: PacketBudget;
  cache?: Map<string, ContextFileSnapshot>;
  fullFileLineLimit?: number;
  targetedSnippetLineLimit?: number;
  userSelectedRanges?: UserSelectedFileRange[];
}

// ---------------------------------------------------------------------------
// Budget helpers
// ---------------------------------------------------------------------------

export function scopedBudget(parent: PacketBudget, maxBytes: number): PacketBudget {
  return {
    estimatedBytes: parent.estimatedBytes,
    estimatedTokens: parent.estimatedTokens,
    byteLimit: Math.min(maxBytes, parent.byteLimit ?? maxBytes),
    tokenLimit: parent.tokenLimit,
    droppedContentNotes: parent.droppedContentNotes,
  };
}

// ---------------------------------------------------------------------------
// Omission helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Group builder
// ---------------------------------------------------------------------------

interface BuildTierResult {
  files: RankedContextFile[];
  omittedCandidates: OmittedCandidates;
  bytesUsed: number;
}

export async function buildFilesForGroup(
  rankedFiles: RankedContextFile[],
  opts: BuildFilesOptions,
  tierBudget: PacketBudget,
  currentFiles: RankedContextFile[],
): Promise<BuildTierResult> {
  const { maxFiles, maxSnippetsPerFile, cache } = opts;
  const files: RankedContextFile[] = [];
  const omittedCandidates: OmittedCandidates = [];
  const bytesBefore = tierBudget.estimatedBytes;
  for (const rankedFile of rankedFiles) {
    if (currentFiles.length + files.length >= maxFiles) {
      omitOverBudget(rankedFile.filePath, maxFiles, tierBudget, omittedCandidates);
      continue;
    }
    const filePayload = await buildFilePayload({
      rankedFile,
      liveIdeState: opts.selection.liveIdeState,
      maxSnippetsPerFile,
      budget: tierBudget,
      cache,
      fullFileLineLimit: opts.fullFileLineLimit,
      targetedSnippetLineLimit: opts.targetedSnippetLineLimit,
      userSelectedRanges: opts.userSelectedRanges,
    });
    if (!filePayload) {
      omitNoSnippets(rankedFile.filePath, tierBudget, omittedCandidates);
      continue;
    }
    files.push(filePayload);
  }
  return { files, omittedCandidates, bytesUsed: tierBudget.estimatedBytes - bytesBefore };
}

// ---------------------------------------------------------------------------
// Packet file assembler
// ---------------------------------------------------------------------------

export async function buildPacketFiles(
  opts: BuildFilesOptions,
): Promise<{ files: RankedContextFile[]; omittedCandidates: OmittedCandidates }> {
  const { selection, budget } = opts;
  const totalByteBudget = budget.byteLimit ?? DEFAULT_MAX_BYTES;
  const tier1Cap = Math.floor(totalByteBudget * DEFAULT_TIER_BUDGET.tier1MaxPercent);
  const tier1Files = selection.rankedFiles.filter((f) => getFileTier(f) === 1);
  const otherFiles = selection.rankedFiles.filter((f) => getFileTier(f) !== 1);
  const tier1Budget = scopedBudget(budget, budget.estimatedBytes + tier1Cap);
  const tier1Result = await buildFilesForGroup(tier1Files, opts, tier1Budget, []);
  // Sync parent budget with tier1 consumption
  budget.estimatedBytes = tier1Budget.estimatedBytes;
  budget.estimatedTokens = tier1Budget.estimatedTokens;
  const otherResult = await buildFilesForGroup(otherFiles, opts, budget, tier1Result.files);
  budget.tierAllocation = { tier1: tier1Result.bytesUsed, tier2Plus: otherResult.bytesUsed };
  const omittedCandidates = [
    ...selection.omittedCandidates,
    ...tier1Result.omittedCandidates,
    ...otherResult.omittedCandidates,
  ];
  return { files: [...tier1Result.files, ...otherResult.files], omittedCandidates };
}
