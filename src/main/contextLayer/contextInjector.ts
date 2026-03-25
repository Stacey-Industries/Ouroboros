import type { ContextPacket } from '../orchestration/types'
import type { ModuleContextEntry, ModuleContextSummary, RepoMap, RepoMapSummary } from './contextLayerTypes'
import { readRepoMap, readModuleEntry } from './contextLayerStore'
import { compressRepoMap } from './repoMapGenerator'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InjectionContext {
  packet: ContextPacket
  workspaceRoot: string
  goalKeywords: string[]
}

export interface InjectionResult {
  packet: ContextPacket
  injectedModules: string[]
  injectedTokens: number
}

// Extended packet type with context layer fields
// (ContextPacket in orchestration/types.ts will be updated by another agent)
interface EnrichedContextPacket extends ContextPacket {
  repoMap?: RepoMapSummary
  moduleSummaries?: ModuleContextSummary[]
}

// ---------------------------------------------------------------------------
// Token budget constants
// ---------------------------------------------------------------------------

const MAX_REPO_MAP_TOKENS = 800
const MAX_MODULE_SUMMARY_TOKENS = 200
const MAX_TOTAL_INJECTION_TOKENS = 2000

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

function estimateTokens(data: unknown): number {
  return Math.ceil(JSON.stringify(data).length / 4)
}

// ---------------------------------------------------------------------------
// Module selection
// ---------------------------------------------------------------------------

type SelectionPriority = 'file_overlap' | 'keyword' | 'dependency' | 'recently_changed'

interface SelectedModule {
  id: string
  priority: SelectionPriority
  /** Lower = higher priority for budget ranking */
  rank: number
}

function selectRelevantModules(
  repoMap: RepoMap,
  packet: ContextPacket,
  goalKeywords: string[],
): SelectedModule[] {
  const selected = new Map<string, SelectedModule>()
  let nextRank = 0

  const moduleEntries = repoMap.modules

  // a. File overlap — modules whose rootPath appears in any packet.files[].filePath
  for (const entry of moduleEntries) {
    const rootPath = entry.structural.module.rootPath
    const moduleId = entry.structural.module.id
    if (selected.has(moduleId)) continue

    const hasFileOverlap = packet.files.some(
      (file) => file.filePath.includes(rootPath)
    )
    if (hasFileOverlap) {
      selected.set(moduleId, { id: moduleId, priority: 'file_overlap', rank: nextRank++ })
    }
  }

  // b. Keyword overlap — modules whose id, label, or exports match any goalKeywords
  if (goalKeywords.length > 0) {
    const lowerKeywords = goalKeywords.map((kw) => kw.toLowerCase())

    for (const entry of moduleEntries) {
      const moduleId = entry.structural.module.id
      if (selected.has(moduleId)) continue

      const idLower = moduleId.toLowerCase()
      const labelLower = entry.structural.module.label.toLowerCase()
      const exportsLower = entry.structural.exports.map((exp) => exp.toLowerCase())

      const hasKeywordMatch = lowerKeywords.some((kw) =>
        idLower.includes(kw) ||
        labelLower.includes(kw) ||
        exportsLower.some((exp) => exp.includes(kw))
      )

      if (hasKeywordMatch) {
        selected.set(moduleId, { id: moduleId, priority: 'keyword', rank: nextRank++ })
      }
    }
  }

  // c. Dependency adjacency — modules that are dependencies of already-selected modules
  const alreadySelectedIds = new Set(selected.keys())
  let adjacencyAdded = 0
  const maxAdjacency = 3

  for (const dep of repoMap.crossModuleDependencies) {
    if (adjacencyAdded >= maxAdjacency) break
    if (alreadySelectedIds.has(dep.from) && !selected.has(dep.to)) {
      // Verify the dependency target actually exists in the repo map
      const exists = moduleEntries.some(
        (entry) => entry.structural.module.id === dep.to
      )
      if (exists) {
        selected.set(dep.to, { id: dep.to, priority: 'dependency', rank: nextRank++ })
        adjacencyAdded++
      }
    }
  }

  // d. Recently changed backfill — if fewer than 3 modules selected
  if (selected.size < 3) {
    for (const entry of moduleEntries) {
      if (selected.size >= 3) break
      const moduleId = entry.structural.module.id
      if (selected.has(moduleId)) continue

      if (entry.structural.recentlyChanged) {
        selected.set(moduleId, { id: moduleId, priority: 'recently_changed', rank: nextRank++ })
      }
    }
  }

  return Array.from(selected.values())
}

// ---------------------------------------------------------------------------
// Build module summaries from store entries
// ---------------------------------------------------------------------------

function buildModuleSummary(entry: ModuleContextEntry): ModuleContextSummary {
  return {
    moduleId: entry.structural.module.id,
    label: entry.structural.module.label,
    rootPath: entry.structural.module.rootPath,
    description: entry.ai?.description ?? '',
    keyResponsibilities: entry.ai?.keyResponsibilities ?? [],
    gotchas: entry.ai?.gotchas ?? [],
    exports: entry.structural.exports.slice(0, 10),
  }
}

// ---------------------------------------------------------------------------
// Budget enforcement
// ---------------------------------------------------------------------------

function enforceTokenBudget(
  repoMapSummary: RepoMapSummary,
  summaries: ModuleContextSummary[],
  selectedModules: SelectedModule[],
): { repoMap: RepoMapSummary | undefined; moduleSummaries: ModuleContextSummary[] } {
  const repoMapTokens = estimateTokens(repoMapSummary)

  // Count actual repo map tokens toward the total budget
  let remainingBudget = MAX_TOTAL_INJECTION_TOKENS - repoMapTokens

  // If repo map exceeds total budget, include repo map only
  if (remainingBudget <= 0) {
    return { repoMap: repoMapSummary, moduleSummaries: [] }
  }

  // Rank modules by selection priority (lower rank = higher priority)
  const rankedModules = [...selectedModules].sort((a, b) => a.rank - b.rank)

  const includedSummaries: ModuleContextSummary[] = []

  for (const mod of rankedModules) {
    const summary = summaries.find((s) => s.moduleId === mod.id)
    if (!summary) continue

    const summaryTokens = estimateTokens(summary)

    if (summaryTokens > remainingBudget) break

    includedSummaries.push(summary)
    remainingBudget -= summaryTokens
  }

  return { repoMap: repoMapSummary, moduleSummaries: includedSummaries }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function injectContextLayer(context: InjectionContext): Promise<InjectionResult> {
  const { packet, workspaceRoot, goalKeywords } = context

  // 1. Read repo map from store
  let repoMap: RepoMap | null
  try {
    repoMap = await readRepoMap(workspaceRoot)
  } catch (error) {
    console.warn('[context-layer] Failed to read repo map:', error)
    return { packet, injectedModules: [], injectedTokens: 0 }
  }

  if (!repoMap) {
    return { packet, injectedModules: [], injectedTokens: 0 }
  }

  // 2. Compress repo map
  const repoMapSummary = compressRepoMap(repoMap)

  // 3. If no goal keywords, inject repo map only
  if (goalKeywords.length === 0) {
    const enrichedPacket = { ...packet } as EnrichedContextPacket
    enrichedPacket.repoMap = repoMapSummary
    const injectedTokens = estimateTokens(repoMapSummary)
    return { packet: enrichedPacket as ContextPacket, injectedModules: [], injectedTokens }
  }

  // 4. Select relevant modules
  const selectedModules = selectRelevantModules(repoMap, packet, goalKeywords)

  if (selectedModules.length === 0) {
    const enrichedPacket = { ...packet } as EnrichedContextPacket
    enrichedPacket.repoMap = repoMapSummary
    const injectedTokens = estimateTokens(repoMapSummary)
    return { packet: enrichedPacket as ContextPacket, injectedModules: [], injectedTokens }
  }

  // 5. Read module entries from store
  const moduleSummaries: ModuleContextSummary[] = []

  for (const mod of selectedModules) {
    let entry: ModuleContextEntry | null
    try {
      entry = await readModuleEntry(workspaceRoot, mod.id)
    } catch (error) {
      console.warn(`[context-layer] Failed to read module entry for ${mod.id}:`, error)
      continue
    }

    if (!entry) {
      // Module in repo map but no store entry — skip
      continue
    }

    moduleSummaries.push(buildModuleSummary(entry))
  }

  // 6. Enforce token budget
  const budgeted = enforceTokenBudget(repoMapSummary, moduleSummaries, selectedModules)

  // 7. Build enriched packet
  const enrichedPacket = { ...packet } as EnrichedContextPacket
  enrichedPacket.repoMap = budgeted.repoMap
  if (budgeted.moduleSummaries.length > 0) {
    enrichedPacket.moduleSummaries = budgeted.moduleSummaries
  }

  const injectedModules = budgeted.moduleSummaries.map((s) => s.moduleId)
  const injectedTokens =
    estimateTokens(budgeted.repoMap) +
    budgeted.moduleSummaries.reduce((sum, s) => sum + estimateTokens(s), 0)

  return {
    packet: enrichedPacket as ContextPacket,
    injectedModules,
    injectedTokens,
  }
}
