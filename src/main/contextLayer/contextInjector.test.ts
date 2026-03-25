import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContextPacket, RankedContextFile } from '../orchestration/types'
import type { ModuleAISummary, ModuleContextEntry, ModuleStructuralSummary, ModuleIdentity, RepoMap, RepoMapSummary } from './contextLayerTypes'

vi.mock('./contextLayerStore', () => ({
  readRepoMap: vi.fn(),
  readModuleEntry: vi.fn(),
}))
vi.mock('./repoMapGenerator', () => ({
  compressRepoMap: vi.fn(),
}))

import { injectContextLayer } from './contextInjector'
import type { InjectionContext, InjectionResult } from './contextInjector'
import { readRepoMap, readModuleEntry } from './contextLayerStore'
import { compressRepoMap } from './repoMapGenerator'

const mockedReadRepoMap = vi.mocked(readRepoMap)
const mockedReadModuleEntry = vi.mocked(readModuleEntry)
const mockedCompressRepoMap = vi.mocked(compressRepoMap)

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function createMockModuleIdentity(
  id: string,
  rootPath: string,
  pattern: ModuleIdentity['pattern'] = 'feature-folder',
): ModuleIdentity {
  const label = id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  return { id, label, rootPath, pattern }
}

function createMockStructuralSummary(
  module: ModuleIdentity,
  overrides: Partial<ModuleStructuralSummary> = {},
): ModuleStructuralSummary {
  return {
    module,
    fileCount: 5,
    totalLines: 200,
    languages: ['typescript'],
    exports: ['ComponentA', 'ComponentB', 'useHook'],
    imports: ['react', '../utils'],
    entryPoints: ['index.ts'],
    recentlyChanged: false,
    lastModified: 1000,
    contentHash: 'abc123',
    ...overrides,
  }
}

function createMockModuleEntry(
  id: string,
  rootPath: string,
  overrides: {
    structural?: Partial<ModuleStructuralSummary>
    ai?: ModuleAISummary
  } = {},
): ModuleContextEntry {
  const module = createMockModuleIdentity(id, rootPath)
  return {
    structural: createMockStructuralSummary(module, overrides.structural),
    ai: overrides.ai,
  }
}

function createMockRepoMap(modules: ModuleContextEntry[], overrides: Partial<RepoMap> = {}): RepoMap {
  return {
    version: 1,
    generatedAt: Date.now(),
    workspaceRoot: '/home/user/project',
    projectName: 'test-project',
    languages: ['typescript'],
    frameworks: ['React', 'Electron'],
    moduleCount: modules.length,
    totalFileCount: modules.reduce((sum, m) => sum + m.structural.fileCount, 0),
    modules,
    crossModuleDependencies: [],
    ...overrides,
  }
}

function createMockRepoMapSummary(modules: RepoMap['modules']): RepoMapSummary {
  return {
    projectName: 'test-project',
    languages: ['typescript'],
    frameworks: ['React', 'Electron'],
    moduleCount: modules.length,
    modules: modules.map((entry) => ({
      id: entry.structural.module.id,
      label: entry.structural.module.label,
      rootPath: entry.structural.module.rootPath,
      fileCount: entry.structural.fileCount,
      exports: entry.structural.exports.slice(0, 5),
      recentlyChanged: entry.structural.recentlyChanged,
    })),
  }
}

function createMockRankedFile(filePath: string): RankedContextFile {
  return {
    filePath,
    score: 10,
    confidence: 'high',
    reasons: [{ kind: 'user_selected', weight: 10, detail: 'user selected' }],
    snippets: [],
    truncationNotes: [],
  }
}

function createMockContextPacket(files: RankedContextFile[] = []): ContextPacket {
  return {
    version: 1,
    id: 'pkt-001',
    createdAt: Date.now(),
    task: {
      taskId: 'task-001',
      goal: 'fix the file tree search',
      mode: 'edit',
      provider: 'claude-code',
      verificationProfile: 'default',
    },
    repoFacts: {
      workspaceRoots: ['/home/user/project'],
      roots: [],
      gitDiff: {
        changedFiles: [],
        totalAdditions: 0,
        totalDeletions: 0,
        changedFileCount: 0,
        generatedAt: 1000,
      },
      diagnostics: {
        files: [],
        totalErrors: 0,
        totalWarnings: 0,
        totalInfos: 0,
        totalHints: 0,
        generatedAt: 1000,
      },
      recentEdits: { files: [], generatedAt: 1000 },
    },
    liveIdeState: {
      selectedFiles: [],
      openFiles: [],
      dirtyFiles: [],
      dirtyBuffers: [],
      collectedAt: 1000,
    },
    files,
    omittedCandidates: [],
    budget: {
      estimatedBytes: 0,
      estimatedTokens: 0,
      droppedContentNotes: [],
    },
  }
}

function createMockInjectionContext(overrides: Partial<InjectionContext> = {}): InjectionContext {
  return {
    packet: createMockContextPacket(),
    workspaceRoot: '/home/user/project',
    goalKeywords: ['terminal'],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('injectContextLayer', () => {
  it('returns packet unchanged when no repo map exists', async () => {
    mockedReadRepoMap.mockResolvedValue(null)

    const context = createMockInjectionContext()
    const result = await injectContextLayer(context)

    expect(result.packet).toEqual(context.packet)
    expect(result.injectedModules).toEqual([])
    expect(result.injectedTokens).toBe(0)
  })

  it('injects repo map on every enriched packet', async () => {
    const fileTreeEntry = createMockModuleEntry('file-tree', 'src/components/FileTree')
    const terminalEntry = createMockModuleEntry('terminal', 'src/components/Terminal')
    const repoMap = createMockRepoMap([fileTreeEntry, terminalEntry])
    const summary = createMockRepoMapSummary(repoMap.modules)

    mockedReadRepoMap.mockResolvedValue(repoMap)
    mockedCompressRepoMap.mockReturnValue(summary)
    mockedReadModuleEntry.mockResolvedValue(terminalEntry)

    const context = createMockInjectionContext({ goalKeywords: ['terminal'] })
    const result = await injectContextLayer(context)

    const enriched = result.packet as unknown as { repoMap?: RepoMapSummary }
    expect(enriched.repoMap).toBeDefined()
    expect(enriched.repoMap?.projectName).toBe('test-project')
    expect(enriched.repoMap?.modules).toHaveLength(2)
  })

  it('selects modules by file overlap', async () => {
    const fileTreeEntry = createMockModuleEntry('file-tree', 'src/components/FileTree')
    const terminalEntry = createMockModuleEntry('terminal', 'src/components/Terminal')
    const repoMap = createMockRepoMap([fileTreeEntry, terminalEntry])
    const summary = createMockRepoMapSummary(repoMap.modules)

    mockedReadRepoMap.mockResolvedValue(repoMap)
    mockedCompressRepoMap.mockReturnValue(summary)
    mockedReadModuleEntry.mockImplementation(async (_root, moduleId) => {
      if (moduleId === 'file-tree') return fileTreeEntry
      if (moduleId === 'terminal') return terminalEntry
      return null
    })

    const packet = createMockContextPacket([
      createMockRankedFile('src/components/FileTree/FileTree.tsx'),
      createMockRankedFile('src/components/FileTree/SearchOverlay.tsx'),
    ])

    const context = createMockInjectionContext({
      packet,
      goalKeywords: ['search'],
    })

    const result = await injectContextLayer(context)

    // file-tree should be injected due to file overlap
    expect(result.injectedModules).toContain('file-tree')
  })

  it('selects modules by keyword match on id', async () => {
    const fileTreeEntry = createMockModuleEntry('file-tree', 'src/components/FileTree')
    const terminalEntry = createMockModuleEntry('terminal', 'src/components/Terminal')
    const repoMap = createMockRepoMap([fileTreeEntry, terminalEntry])
    const summary = createMockRepoMapSummary(repoMap.modules)

    mockedReadRepoMap.mockResolvedValue(repoMap)
    mockedCompressRepoMap.mockReturnValue(summary)
    mockedReadModuleEntry.mockImplementation(async (_root, moduleId) => {
      if (moduleId === 'terminal') return terminalEntry
      return null
    })

    const context = createMockInjectionContext({ goalKeywords: ['terminal'] })
    const result = await injectContextLayer(context)

    expect(result.injectedModules).toContain('terminal')
  })

  it('keyword matches exports', async () => {
    const hooksEntry = createMockModuleEntry('hooks', 'src/hooks', {
      structural: {
        exports: ['useFileWatcher', 'useConfig', 'useTheme'],
      },
    })
    const otherEntry = createMockModuleEntry('utils', 'src/utils')
    const repoMap = createMockRepoMap([hooksEntry, otherEntry])
    const summary = createMockRepoMapSummary(repoMap.modules)

    mockedReadRepoMap.mockResolvedValue(repoMap)
    mockedCompressRepoMap.mockReturnValue(summary)
    mockedReadModuleEntry.mockImplementation(async (_root, moduleId) => {
      if (moduleId === 'hooks') return hooksEntry
      return null
    })

    const context = createMockInjectionContext({ goalKeywords: ['useFileWatcher'] })
    const result = await injectContextLayer(context)

    expect(result.injectedModules).toContain('hooks')
  })

  it('selects dependency adjacency modules', async () => {
    const fileTreeEntry = createMockModuleEntry('file-tree', 'src/components/FileTree')
    const hooksEntry = createMockModuleEntry('hooks', 'src/hooks')
    const utilsEntry = createMockModuleEntry('utils', 'src/utils')
    const repoMap = createMockRepoMap([fileTreeEntry, hooksEntry, utilsEntry], {
      crossModuleDependencies: [
        { from: 'file-tree', to: 'hooks', weight: 3 },
        { from: 'file-tree', to: 'utils', weight: 2 },
      ],
    })
    const summary = createMockRepoMapSummary(repoMap.modules)

    mockedReadRepoMap.mockResolvedValue(repoMap)
    mockedCompressRepoMap.mockReturnValue(summary)
    mockedReadModuleEntry.mockImplementation(async (_root, moduleId) => {
      if (moduleId === 'file-tree') return fileTreeEntry
      if (moduleId === 'hooks') return hooksEntry
      if (moduleId === 'utils') return utilsEntry
      return null
    })

    // file-tree selected by keyword, hooks and utils should be added by adjacency
    const context = createMockInjectionContext({ goalKeywords: ['file-tree'] })
    const result = await injectContextLayer(context)

    expect(result.injectedModules).toContain('file-tree')
    expect(result.injectedModules).toContain('hooks')
    expect(result.injectedModules).toContain('utils')
  })

  it('limits dependency adjacency to max 3 modules', async () => {
    const mainEntry = createMockModuleEntry('main', 'src/main')
    const dep1 = createMockModuleEntry('dep-1', 'src/dep1')
    const dep2 = createMockModuleEntry('dep-2', 'src/dep2')
    const dep3 = createMockModuleEntry('dep-3', 'src/dep3')
    const dep4 = createMockModuleEntry('dep-4', 'src/dep4')
    const dep5 = createMockModuleEntry('dep-5', 'src/dep5')

    const repoMap = createMockRepoMap([mainEntry, dep1, dep2, dep3, dep4, dep5], {
      crossModuleDependencies: [
        { from: 'main', to: 'dep-1', weight: 5 },
        { from: 'main', to: 'dep-2', weight: 4 },
        { from: 'main', to: 'dep-3', weight: 3 },
        { from: 'main', to: 'dep-4', weight: 2 },
        { from: 'main', to: 'dep-5', weight: 1 },
      ],
    })
    const summary = createMockRepoMapSummary(repoMap.modules)

    mockedReadRepoMap.mockResolvedValue(repoMap)
    mockedCompressRepoMap.mockReturnValue(summary)
    mockedReadModuleEntry.mockImplementation(async (_root, moduleId) => {
      const entries: Record<string, ModuleContextEntry> = {
        'main': mainEntry,
        'dep-1': dep1,
        'dep-2': dep2,
        'dep-3': dep3,
        'dep-4': dep4,
        'dep-5': dep5,
      }
      return entries[moduleId] ?? null
    })

    const context = createMockInjectionContext({ goalKeywords: ['main'] })
    const result = await injectContextLayer(context)

    // main selected by keyword, then max 3 deps
    const depModules = result.injectedModules.filter((id) => id.startsWith('dep-'))
    expect(depModules.length).toBeLessThanOrEqual(3)
  })

  it('backfills recently changed modules when fewer than 3 selected', async () => {
    const selectedEntry = createMockModuleEntry('terminal', 'src/components/Terminal')
    const recentEntry1 = createMockModuleEntry('layout', 'src/components/Layout', {
      structural: { recentlyChanged: true },
    })
    const recentEntry2 = createMockModuleEntry('settings', 'src/components/Settings', {
      structural: { recentlyChanged: true },
    })
    const staleEntry = createMockModuleEntry('old-module', 'src/components/Old', {
      structural: { recentlyChanged: false },
    })

    const repoMap = createMockRepoMap([selectedEntry, recentEntry1, recentEntry2, staleEntry])
    const summary = createMockRepoMapSummary(repoMap.modules)

    mockedReadRepoMap.mockResolvedValue(repoMap)
    mockedCompressRepoMap.mockReturnValue(summary)
    mockedReadModuleEntry.mockImplementation(async (_root, moduleId) => {
      const entries: Record<string, ModuleContextEntry> = {
        'terminal': selectedEntry,
        'layout': recentEntry1,
        'settings': recentEntry2,
        'old-module': staleEntry,
      }
      return entries[moduleId] ?? null
    })

    const context = createMockInjectionContext({ goalKeywords: ['terminal'] })
    const result = await injectContextLayer(context)

    // terminal by keyword + layout and settings by recently changed backfill
    expect(result.injectedModules).toContain('terminal')
    expect(result.injectedModules).toContain('layout')
    expect(result.injectedModules).toContain('settings')
    expect(result.injectedModules).not.toContain('old-module')
  })

  it('enforces token budget by including only top-priority modules', async () => {
    // Create 15 modules — budget should only allow a subset
    const modules: ModuleContextEntry[] = []
    for (let i = 0; i < 15; i++) {
      modules.push(
        createMockModuleEntry(`mod-${i}`, `src/mod${i}`, {
          structural: {
            exports: Array.from({ length: 10 }, (_, j) => `VeryLongExportNameForBudgetTesting_Export${j}_Module${i}`),
          },
          ai: {
            description: `Module ${i} handles a very specific and detailed responsibility that uses up tokens in the budget estimation. `.repeat(3),
            keyResponsibilities: [
              `Responsibility A for module ${i} with extensive detail`,
              `Responsibility B for module ${i} with extensive detail`,
              `Responsibility C for module ${i} with extensive detail`,
            ],
            gotchas: [`Gotcha for module ${i}: watch out for edge cases in serialization and token estimation`],
            generatedAt: 1000,
            generatedFrom: 'test',
            tokenCount: 200,
          },
        })
      )
    }

    const repoMap = createMockRepoMap(modules)
    const summary = createMockRepoMapSummary(repoMap.modules)

    mockedReadRepoMap.mockResolvedValue(repoMap)
    mockedCompressRepoMap.mockReturnValue(summary)
    mockedReadModuleEntry.mockImplementation(async (_root, moduleId) => {
      const entry = modules.find((m) => m.structural.module.id === moduleId)
      return entry ?? null
    })

    // All 15 match by keyword
    const packet = createMockContextPacket(
      modules.map((m) => createMockRankedFile(`${m.structural.module.rootPath}/index.ts`))
    )
    const context = createMockInjectionContext({
      packet,
      goalKeywords: ['mod'],
    })

    const result = await injectContextLayer(context)

    // Should inject fewer than 15 modules due to token budget
    expect(result.injectedModules.length).toBeLessThan(15)
    expect(result.injectedModules.length).toBeGreaterThan(0)
    expect(result.injectedTokens).toBeLessThanOrEqual(2000)
  })

  it('returns repo map only when goalKeywords is empty', async () => {
    const fileTreeEntry = createMockModuleEntry('file-tree', 'src/components/FileTree')
    const repoMap = createMockRepoMap([fileTreeEntry])
    const summary = createMockRepoMapSummary(repoMap.modules)

    mockedReadRepoMap.mockResolvedValue(repoMap)
    mockedCompressRepoMap.mockReturnValue(summary)

    const context = createMockInjectionContext({ goalKeywords: [] })
    const result = await injectContextLayer(context)

    const enriched = result.packet as unknown as { repoMap?: RepoMapSummary; moduleSummaries?: unknown[] }
    expect(enriched.repoMap).toBeDefined()
    expect(enriched.moduleSummaries).toBeUndefined()
    expect(result.injectedModules).toEqual([])
    expect(result.injectedTokens).toBeGreaterThan(0)
  })

  it('populates AI fields when module entry has AI summary', async () => {
    const terminalEntry = createMockModuleEntry('terminal', 'src/components/Terminal', {
      ai: {
        description: 'Terminal component handles xterm.js integration',
        keyResponsibilities: ['PTY communication', 'Theme application', 'Search overlay'],
        gotchas: ['Double rAF needed before fit()', 'No WebGL addon'],
        generatedAt: 1000,
        generatedFrom: 'test',
        tokenCount: 50,
      },
    })

    const repoMap = createMockRepoMap([terminalEntry])
    const summary = createMockRepoMapSummary(repoMap.modules)

    mockedReadRepoMap.mockResolvedValue(repoMap)
    mockedCompressRepoMap.mockReturnValue(summary)
    mockedReadModuleEntry.mockResolvedValue(terminalEntry)

    const context = createMockInjectionContext({ goalKeywords: ['terminal'] })
    const result = await injectContextLayer(context)

    const enriched = result.packet as unknown as { moduleSummaries?: Array<{ description: string; keyResponsibilities: string[]; gotchas: string[] }> }
    expect(enriched.moduleSummaries).toHaveLength(1)

    const injectedSummary = enriched.moduleSummaries![0]
    expect(injectedSummary.description).toBe('Terminal component handles xterm.js integration')
    expect(injectedSummary.keyResponsibilities).toEqual(['PTY communication', 'Theme application', 'Search overlay'])
    expect(injectedSummary.gotchas).toEqual(['Double rAF needed before fit()', 'No WebGL addon'])
  })

  it('uses empty strings and arrays for AI fields when module has no AI summary', async () => {
    const terminalEntry = createMockModuleEntry('terminal', 'src/components/Terminal')
    // No ai field on the entry

    const repoMap = createMockRepoMap([terminalEntry])
    const summary = createMockRepoMapSummary(repoMap.modules)

    mockedReadRepoMap.mockResolvedValue(repoMap)
    mockedCompressRepoMap.mockReturnValue(summary)
    mockedReadModuleEntry.mockResolvedValue(terminalEntry)

    const context = createMockInjectionContext({ goalKeywords: ['terminal'] })
    const result = await injectContextLayer(context)

    const enriched = result.packet as unknown as { moduleSummaries?: Array<{ description: string; keyResponsibilities: string[]; gotchas: string[] }> }
    expect(enriched.moduleSummaries).toHaveLength(1)

    const injectedSummary = enriched.moduleSummaries![0]
    expect(injectedSummary.description).toBe('')
    expect(injectedSummary.keyResponsibilities).toEqual([])
    expect(injectedSummary.gotchas).toEqual([])
  })

  it('skips modules when store entry is missing', async () => {
    const fileTreeEntry = createMockModuleEntry('file-tree', 'src/components/FileTree')
    const terminalEntry = createMockModuleEntry('terminal', 'src/components/Terminal')
    const repoMap = createMockRepoMap([fileTreeEntry, terminalEntry])
    const summary = createMockRepoMapSummary(repoMap.modules)

    mockedReadRepoMap.mockResolvedValue(repoMap)
    mockedCompressRepoMap.mockReturnValue(summary)
    mockedReadModuleEntry.mockImplementation(async (_root, moduleId) => {
      // file-tree has no store entry
      if (moduleId === 'terminal') return terminalEntry
      return null
    })

    const context = createMockInjectionContext({ goalKeywords: ['file-tree', 'terminal'] })
    const result = await injectContextLayer(context)

    // file-tree skipped because readModuleEntry returned null
    expect(result.injectedModules).not.toContain('file-tree')
    expect(result.injectedModules).toContain('terminal')
  })
})
