import {
  buildBudgetSummary,
  dedupeSnippetCandidates,
  deriveSnippetCandidates,
  keepSnippetWithinBudget,
  type UserSelectedFileRange,
} from './contextPacketBuilderSupport';
import type { ContextFileSnapshot } from './contextSelectionSupport';
import type { ContextSelectionResult } from './contextSelector';
import type { ContextSnippet, ContextTruncationNote, RankedContextFile } from './types';

export interface SnippetBudgetOptions {
  budget: ReturnType<typeof buildBudgetSummary>;
  snapshot: ContextFileSnapshot;
  filePath: string;
  fullFileLineLimit?: number;
  targetedSnippetLineLimit?: number;
}

export function tryAcceptSnippet(
  snippet: ContextSnippet,
  notes: ContextTruncationNote[],
  opts: SnippetBudgetOptions,
): ContextSnippet | null {
  const kept = keepSnippetWithinBudget({
    budget: opts.budget,
    snapshot: opts.snapshot,
    snippet,
    fullFileLineLimit: opts.fullFileLineLimit,
    targetedSnippetLineLimit: opts.targetedSnippetLineLimit,
  });
  if (!kept) {
    notes.push({
      reason: 'budget',
      detail: `Dropped snippet ${snippet.label} because packet size budget would be exceeded`,
    });
    opts.budget.droppedContentNotes.push(
      `Dropped ${opts.filePath}:${snippet.range.startLine}-${snippet.range.endLine} due to size budget`,
    );
    return null;
  }
  if (kept.range.endLine - kept.range.startLine < snippet.range.endLine - snippet.range.startLine) {
    notes.push({ reason: 'max_lines', detail: `Truncated ${snippet.label} to fit line limits` });
  }
  return kept;
}

export interface BuildSnippetListOptions {
  rankedFile: RankedContextFile;
  liveIdeState: ContextSelectionResult['liveIdeState'];
  maxSnippetsPerFile: number;
  budget: ReturnType<typeof buildBudgetSummary>;
  snapshot: ContextFileSnapshot;
  fullFileLineLimit?: number;
  targetedSnippetLineLimit?: number;
  userSelectedRanges?: UserSelectedFileRange[];
}

export function buildSnippetList(options: BuildSnippetListOptions): {
  acceptedSnippets: ContextSnippet[];
  fileTruncationNotes: ContextTruncationNote[];
} {
  const { rankedFile, liveIdeState, maxSnippetsPerFile, budget, snapshot } = options;
  const candidates = deriveSnippetCandidates(
    rankedFile,
    snapshot,
    liveIdeState,
    options.userSelectedRanges,
  );
  const { snippets, truncationNotes } = dedupeSnippetCandidates(snapshot, candidates, rankedFile.score);
  const acceptedSnippets: ContextSnippet[] = [];
  const fileTruncationNotes: ContextTruncationNote[] = [...truncationNotes];
  const budgetOpts: SnippetBudgetOptions = {
    budget,
    snapshot,
    filePath: rankedFile.filePath,
    fullFileLineLimit: options.fullFileLineLimit,
    targetedSnippetLineLimit: options.targetedSnippetLineLimit,
  };
  for (const snippet of snippets) {
    if (acceptedSnippets.length >= maxSnippetsPerFile) {
      fileTruncationNotes.push({
        reason: 'budget',
        detail: `Dropped snippet ${snippet.label} because maxSnippetsPerFile=${maxSnippetsPerFile}`,
      });
      continue;
    }
    const kept = tryAcceptSnippet(snippet, fileTruncationNotes, budgetOpts);
    if (kept) acceptedSnippets.push(kept);
  }
  return { acceptedSnippets, fileTruncationNotes };
}
