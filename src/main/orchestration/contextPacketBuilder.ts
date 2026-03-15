import { randomUUID } from 'crypto'
import { loadContextFileSnapshot } from './contextSelectionSupport'
import { selectContextFiles, type ContextSelectionResult } from './contextSelector'
import {
  buildBudgetSummary,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_FILES,
  DEFAULT_MAX_SNIPPETS_PER_FILE,
  DEFAULT_MAX_TOKENS,
  dedupeSnippetCandidates,
  deriveSnippetCandidates,
  keepSnippetWithinBudget,
} from './contextPacketBuilderSupport'
import type {
  ContextPacket,
  ContextSnippet,
  ContextTruncationNote,
  LiveIdeState,
  RankedContextFile,
  RepoFacts,
  TaskRequest,
} from './types'

// ---------------------------------------------------------------------------
// Goal keyword extraction — used to select relevant module summaries
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  // Articles, conjunctions, prepositions
  'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'for', 'of', 'to', 'in',
  'on', 'at', 'by', 'as', 'is', 'it', 'its', 'be',
  // Auxiliary verbs (not content verbs like get/set/run)
  'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had', 'does',
  'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can',
  // Pronouns and determiners
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his',
  'she', 'her', 'they', 'them', 'their', 'this', 'that', 'these', 'those',
  // Filler/connective words
  'not', 'no', 'from', 'with', 'into', 'than', 'then', 'when', 'where',
  'why', 'how', 'what', 'which', 'who', 'all', 'any', 'some', 'also',
  'just', 'now', 'only', 'too', 'very', 'there', 'here', 'if', 'so',
  'up', 'out', 'about', 'do', 'made', 'make',
])

/**
 * Extract meaningful keywords from a natural-language goal for module selection.
 *
 * Handles camelCase identifiers, hyphenated/underscored names, English stop
 * words, and pure numbers. The result is matched against module IDs, labels,
 * and exported symbols in the context injector.
 */
function extractGoalKeywords(goal: string): string[] {
  const tokens: string[] = []

  for (const raw of goal.split(/\s+/)) {
    // Strip leading/trailing punctuation (quotes, parens, dots, etc.)
    const stripped = raw.replace(/^[^\w]+|[^\w]+$/g, '')
    if (!stripped) continue

    // Split on hyphens and underscores first
    for (const part of stripped.split(/[-_]+/)) {
      // Then split camelCase: "buildContextPacket" → "build Context Packet"
      for (const sub of part.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ')) {
        tokens.push(sub.toLowerCase())
      }
    }
  }

  return [...new Set(
    tokens.filter(t => t.length >= 3 && !STOP_WORDS.has(t) && !/^\d+$/.test(t))
  )].slice(0, 20)
}

export interface ContextPacketBuildResult {
  packet: ContextPacket
  selection: ContextSelectionResult
}

function buildFilePayload(options: {
  rankedFile: RankedContextFile
  selection: ContextSelectionResult
  maxSnippetsPerFile: number
  budget: ReturnType<typeof buildBudgetSummary>
}): Promise<RankedContextFile | null> {
  const { rankedFile, selection, maxSnippetsPerFile, budget } = options
  return (async () => {
    const snapshot = await loadContextFileSnapshot(rankedFile.filePath)
    const candidates = deriveSnippetCandidates(rankedFile, snapshot, selection.liveIdeState)
    const { snippets, truncationNotes } = dedupeSnippetCandidates(snapshot, candidates)
    const acceptedSnippets: ContextSnippet[] = []
    const fileTruncationNotes: ContextTruncationNote[] = [...truncationNotes]
    for (const snippet of snippets) {
      if (acceptedSnippets.length >= maxSnippetsPerFile) {
        fileTruncationNotes.push({ reason: 'budget', detail: `Dropped snippet ${snippet.label} because maxSnippetsPerFile=${maxSnippetsPerFile}` })
        continue
      }
      const keptSnippet = keepSnippetWithinBudget({ budget, snapshot, snippet })
      if (!keptSnippet) {
        fileTruncationNotes.push({ reason: 'budget', detail: `Dropped snippet ${snippet.label} because packet size budget would be exceeded` })
        budget.droppedContentNotes.push(`Dropped ${rankedFile.filePath}:${snippet.range.startLine}-${snippet.range.endLine} due to size budget`)
        continue
      }
      if ((keptSnippet.range.endLine - keptSnippet.range.startLine) < (snippet.range.endLine - snippet.range.startLine)) {
        fileTruncationNotes.push({ reason: 'max_lines', detail: `Truncated ${snippet.label} to fit line limits` })
      }
      acceptedSnippets.push(keptSnippet)
    }
    if (acceptedSnippets.length === 0) return null
    return { ...rankedFile, snippets: acceptedSnippets, truncationNotes: fileTruncationNotes }
  })()
}

async function buildPacketFiles(options: {
  selection: ContextSelectionResult
  maxFiles: number
  maxSnippetsPerFile: number
  budget: ReturnType<typeof buildBudgetSummary>
}): Promise<{ files: RankedContextFile[]; omittedCandidates: ContextPacket['omittedCandidates'] }> {
  const { selection, maxFiles, maxSnippetsPerFile, budget } = options
  const files: RankedContextFile[] = []
  const omittedCandidates = [...selection.omittedCandidates]
  for (const rankedFile of selection.rankedFiles) {
    if (files.length >= maxFiles) {
      omittedCandidates.push({ filePath: rankedFile.filePath, reason: 'Excluded after ranking because maxFiles budget was reached' })
      budget.droppedContentNotes.push(`Skipped ${rankedFile.filePath} because maxFiles=${maxFiles} was reached`)
      continue
    }
    const filePayload = await buildFilePayload({ rankedFile, selection, maxSnippetsPerFile, budget })
    if (!filePayload) {
      omittedCandidates.push({ filePath: rankedFile.filePath, reason: 'All snippets were omitted by packet budgeting rules' })
      budget.droppedContentNotes.push(`Omitted ${rankedFile.filePath} because no snippets fit within the budget`)
      continue
    }
    files.push(filePayload)
  }
  return { files, omittedCandidates }
}

function buildPacketTask(request: TaskRequest): ContextPacket['task'] {
  return {
    taskId: request.taskId ?? randomUUID(),
    goal: request.goal,
    mode: request.mode,
    provider: request.provider,
    verificationProfile: request.verificationProfile,
  }
}

export async function buildContextPacket(options: {
  request: TaskRequest
  repoFacts: RepoFacts
  liveIdeState?: LiveIdeState
}): Promise<ContextPacketBuildResult> {
  const selection = await selectContextFiles(options)
  const budget = buildBudgetSummary(options.request.budget?.maxBytes ?? DEFAULT_MAX_BYTES, options.request.budget?.maxTokens ?? DEFAULT_MAX_TOKENS)
  const { files, omittedCandidates } = await buildPacketFiles({
    selection,
    maxFiles: options.request.budget?.maxFiles ?? DEFAULT_MAX_FILES,
    maxSnippetsPerFile: options.request.budget?.maxSnippetsPerFile ?? DEFAULT_MAX_SNIPPETS_PER_FILE,
    budget,
  })
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
  }

  const { getContextLayerController } = await import('../contextLayer/contextLayerController')
  const layerController = getContextLayerController()
  if (layerController) {
    try {
      const enriched = await layerController.enrichPacket(packet, extractGoalKeywords(options.request.goal))
      packet = enriched.packet
    } catch {
      // Context layer enrichment is optional — continue with unenriched packet
    }
  }

  return {
    selection,
    packet,
  }
}
