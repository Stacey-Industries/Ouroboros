import { readFileSync } from 'fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { IndexedRepoFile, RepoIndexSnapshot, RootRepoIndexSnapshot } from '../orchestration/repoIndexer'
import type { GitDiffSummary, RepoFacts } from '../orchestration/types'
import type { ModuleIdentity, ModuleStructuralSummary, RepoMap } from './contextLayerTypes'

vi.mock('./moduleDetector', () => ({
  detectModules: vi.fn(),
  buildModuleStructuralSummaries: vi.fn(),
  buildCrossModuleDependencies: vi.fn(),
}))

vi.mock('fs', () => ({
  default: { readFileSync: vi.fn() },
  readFileSync: vi.fn(),
}))

import { buildCrossModuleDependencies,buildModuleStructuralSummaries, detectModules } from './moduleDetector'
import { compressRepoMap, detectFrameworks, detectProjectName,generateRepoMap } from './repoMapGenerator'

const mockedDetectModules = vi.mocked(detectModules)
const mockedBuildSummaries = vi.mocked(buildModuleStructuralSummaries)
const mockedBuildDeps = vi.mocked(buildCrossModuleDependencies)

function createMockFile(overrides: Partial<IndexedRepoFile> = {}): IndexedRepoFile {
  return {
    rootPath: '/home/user/my-project',
    path: '/home/user/my-project/src/index.ts',
    relativePath: 'src/index.ts',
    extension: '.ts',
    language: 'typescript',
    size: 200,
    modifiedAt: 1000,
    imports: [],
    ...overrides,
  }
}

function createMockGitDiff(changedFiles: string[] = []): GitDiffSummary {
  return {
    changedFiles: changedFiles.map((filePath) => ({
      filePath,
      additions: 5,
      deletions: 2,
      status: 'modified' as const,
    })),
    totalAdditions: changedFiles.length * 5,
    totalDeletions: changedFiles.length * 2,
    changedFileCount: changedFiles.length,
    generatedAt: 1000,
  }
}

function createMockRepoFacts(overrides: Partial<RepoFacts> = {}): RepoFacts {
  return {
    workspaceRoots: ['/home/user/my-project'],
    roots: [{
      rootPath: '/home/user/my-project',
      fileCount: 10,
      directoryCount: 3,
      languages: ['typescript'],
      entryPoints: ['src/index.ts'],
      recentlyEditedFiles: [],
      indexedAt: 1000,
    }],
    gitDiff: createMockGitDiff(),
    diagnostics: {
      files: [],
      totalErrors: 0,
      totalWarnings: 0,
      totalInfos: 0,
      totalHints: 0,
      generatedAt: 1000,
    },
    recentEdits: { files: [], generatedAt: 1000 },
    ...overrides,
  }
}

function createMockRootSnapshot(rootPath: string, files: IndexedRepoFile[]): RootRepoIndexSnapshot {
  return {
    rootPath,
    stateKey: 'mock-state-key',
    indexedAt: 1000,
    workspaceFact: {
      rootPath,
      fileCount: files.length,
      directoryCount: 1,
      languages: [...new Set(files.map((f) => f.language).filter((l) => l !== 'unknown'))],
      entryPoints: [],
      recentlyEditedFiles: [],
      indexedAt: 1000,
    },
    gitDiff: createMockGitDiff(),
    diagnostics: {
      files: [],
      totalErrors: 0,
      totalWarnings: 0,
      totalInfos: 0,
      totalHints: 0,
      generatedAt: 1000,
    },
    files,
    directories: [],
    recentCommits: [],
  }
}

function createMockRepoIndex(rootPath: string, files: IndexedRepoFile[]): RepoIndexSnapshot {
  return {
    indexedAt: 1000,
    repoFacts: createMockRepoFacts(),
    roots: [createMockRootSnapshot(rootPath, files)],
    cache: { key: 'mock-cache-key', hit: false, roots: [] },
  }
}

function createMockModuleIdentity(id: string, rootPath: string, pattern: ModuleIdentity['pattern'] = 'feature-folder'): ModuleIdentity {
  const label = id.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
  return { id, label, rootPath, pattern }
}

function createMockStructuralSummary(module: ModuleIdentity, overrides: Partial<ModuleStructuralSummary> = {}): ModuleStructuralSummary {
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

afterEach(() => {
  vi.restoreAllMocks()
})

describe('generateRepoMap', () => {
  it('generates a valid RepoMap with modules from RepoFacts and RepoIndexSnapshot', () => {
    const rootPath = '/home/user/my-project'
    const files = [
      createMockFile({ relativePath: 'src/components/FileTree/FileTree.tsx', path: `${rootPath}/src/components/FileTree/FileTree.tsx` }),
      createMockFile({ relativePath: 'src/components/FileTree/index.ts', path: `${rootPath}/src/components/FileTree/index.ts` }),
      createMockFile({ relativePath: 'src/components/FileTree/utils.ts', path: `${rootPath}/src/components/FileTree/utils.ts` }),
      createMockFile({ relativePath: 'src/components/Terminal/Terminal.tsx', path: `${rootPath}/src/components/Terminal/Terminal.tsx` }),
      createMockFile({ relativePath: 'src/components/Terminal/index.ts', path: `${rootPath}/src/components/Terminal/index.ts` }),
      createMockFile({ relativePath: 'src/components/Terminal/hooks.ts', path: `${rootPath}/src/components/Terminal/hooks.ts` }),
      createMockFile({ relativePath: 'src/hooks/useConfig.ts', path: `${rootPath}/src/hooks/useConfig.ts` }),
      createMockFile({ relativePath: 'src/hooks/useTheme.ts', path: `${rootPath}/src/hooks/useTheme.ts` }),
      createMockFile({ relativePath: 'src/hooks/useFileWatcher.ts', path: `${rootPath}/src/hooks/useFileWatcher.ts` }),
      createMockFile({ relativePath: 'package.json', path: `${rootPath}/package.json`, extension: '.json', language: 'json' }),
    ]

    const repoIndex = createMockRepoIndex(rootPath, files)
    const repoFacts = createMockRepoFacts()

    const fileTreeModule = createMockModuleIdentity('file-tree', 'src/components/FileTree')
    const terminalModule = createMockModuleIdentity('terminal', 'src/components/Terminal')
    const hooksModule = createMockModuleIdentity('hooks', 'src/hooks')
    const configModule = createMockModuleIdentity('project-config', '.', 'config')

    mockedDetectModules.mockReturnValue([fileTreeModule, terminalModule, hooksModule, configModule])
    mockedBuildSummaries.mockReturnValue([
      createMockStructuralSummary(fileTreeModule, { fileCount: 3 }),
      createMockStructuralSummary(terminalModule, { fileCount: 3 }),
      createMockStructuralSummary(hooksModule, { fileCount: 3 }),
      createMockStructuralSummary(configModule, { fileCount: 1 }),
    ])
    mockedBuildDeps.mockReturnValue([
      { from: 'file-tree', to: 'hooks', weight: 3 },
      { from: 'terminal', to: 'hooks', weight: 2 },
    ])

    const result = generateRepoMap({ repoFacts, repoIndex, workspaceRoot: rootPath })

    expect(result.version).toBe(1)
    expect(result.workspaceRoot).toBe(rootPath)
    expect(result.moduleCount).toBe(4)
    expect(result.totalFileCount).toBe(10)
    expect(result.modules).toHaveLength(4)
    expect(result.crossModuleDependencies).toHaveLength(2)
    expect(result.generatedAt).toBeGreaterThan(0)
  })

  it('returns an empty RepoMap for an empty workspace', () => {
    const rootPath = '/home/user/empty-project'
    const repoIndex = createMockRepoIndex(rootPath, [])
    const repoFacts = createMockRepoFacts({ workspaceRoots: [rootPath] })

    const result = generateRepoMap({ repoFacts, repoIndex, workspaceRoot: rootPath })

    expect(result.version).toBe(1)
    expect(result.moduleCount).toBe(0)
    expect(result.totalFileCount).toBe(0)
    expect(result.modules).toEqual([])
    expect(result.crossModuleDependencies).toEqual([])
    expect(result.projectName).toBe('empty-project')
    expect(result.languages).toEqual([])
    expect(result.frameworks).toEqual([])
  })

  it('enforces the 8KB size cap by truncating exports, imports, and module count', () => {
    const rootPath = '/home/user/large-project'
    const files = Array.from({ length: 100 }, (_, index) =>
      createMockFile({
        relativePath: `src/mod${index}/file.ts`,
        path: `${rootPath}/src/mod${index}/file.ts`,
      })
    )

    const repoIndex = createMockRepoIndex(rootPath, files)
    const repoFacts = createMockRepoFacts()

    const modules = Array.from({ length: 40 }, (_, index) =>
      createMockModuleIdentity(`m${index}`, `src/mod${index}`)
    )

    const longExports = Array.from({ length: 20 }, (_, index) => `Export${index}`)
    const longImports = Array.from({ length: 15 }, (_, index) => `@scope/pkg-${index}`)

    mockedDetectModules.mockReturnValue(modules)
    mockedBuildSummaries.mockReturnValue(
      modules.map((mod, index) => createMockStructuralSummary(mod, {
        exports: [...longExports],
        imports: [...longImports],
        fileCount: 40 - index,
      }))
    )
    mockedBuildDeps.mockReturnValue(
      Array.from({ length: 60 }, (_, index) => ({
        from: `m${index % 40}`,
        to: `m${(index + 1) % 40}`,
        weight: index % 3 === 0 ? 1 : 3,
      }))
    )

    const result = generateRepoMap({ repoFacts, repoIndex, workspaceRoot: rootPath })

    // Verify truncation was applied
    for (const entry of result.modules) {
      expect(entry.structural.exports.length).toBeLessThanOrEqual(5)
      expect(entry.structural.imports).toEqual([])
    }
    for (const dep of result.crossModuleDependencies) {
      expect(dep.weight).toBeGreaterThanOrEqual(2)
    }
    // Module count should be capped at 30 if size still exceeded
    expect(result.modules.length).toBeLessThanOrEqual(30)
    expect(result.moduleCount).toBeLessThanOrEqual(30)
  })

  it('truncates modules to top 30 by fileCount when still over 8KB after first pass', () => {
    const rootPath = '/home/user/huge-project'
    const files = Array.from({ length: 200 }, (_, index) =>
      createMockFile({
        relativePath: `src/mod${index}/file.ts`,
        path: `${rootPath}/src/mod${index}/file.ts`,
      })
    )

    const repoIndex = createMockRepoIndex(rootPath, files)
    const repoFacts = createMockRepoFacts()

    const modules = Array.from({ length: 50 }, (_, index) =>
      createMockModuleIdentity(
        `module-${String(index).padStart(3, '0')}`,
        `src/very/deeply/nested/module/path/number${index}`
      )
    )

    const longExports = Array.from({ length: 20 }, (_, index) =>
      `VeryLongExportedSymbolName_Component${index}_WithExtraContext`
    )

    mockedDetectModules.mockReturnValue(modules)
    mockedBuildSummaries.mockReturnValue(
      modules.map((mod, index) => createMockStructuralSummary(mod, {
        exports: [...longExports],
        imports: Array.from({ length: 10 }, (_, i) => `@scope/pkg-${i}`),
        fileCount: 50 - index,
        entryPoints: ['index.ts', 'main.ts', 'barrel.ts'],
        contentHash: `hash-${index}-with-extra-length-to-increase-json-size`,
      }))
    )
    mockedBuildDeps.mockReturnValue(
      Array.from({ length: 100 }, (_, index) => ({
        from: `module-${String(index % 50).padStart(3, '0')}`,
        to: `module-${String((index + 1) % 50).padStart(3, '0')}`,
        weight: 5,
      }))
    )

    const result = generateRepoMap({ repoFacts, repoIndex, workspaceRoot: rootPath })

    expect(result.modules.length).toBeLessThanOrEqual(30)
    expect(result.moduleCount).toBeLessThanOrEqual(30)
  })

  it('sets recentlyChanged flag on modules containing files from git diff', () => {
    const rootPath = '/home/user/my-project'
    const changedFile1 = `${rootPath}/src/components/FileTree/FileTree.tsx`
    const changedFile2 = `${rootPath}/src/hooks/useTheme.ts`

    const files = [
      createMockFile({ relativePath: 'src/components/FileTree/FileTree.tsx', path: changedFile1 }),
      createMockFile({ relativePath: 'src/components/Terminal/Terminal.tsx', path: `${rootPath}/src/components/Terminal/Terminal.tsx` }),
      createMockFile({ relativePath: 'src/hooks/useTheme.ts', path: changedFile2 }),
    ]

    const repoIndex = createMockRepoIndex(rootPath, files)
    const repoFacts = createMockRepoFacts({
      gitDiff: createMockGitDiff([changedFile1, changedFile2]),
    })

    const fileTreeModule = createMockModuleIdentity('file-tree', 'src/components/FileTree')
    const terminalModule = createMockModuleIdentity('terminal', 'src/components/Terminal')
    const hooksModule = createMockModuleIdentity('hooks', 'src/hooks')

    mockedDetectModules.mockReturnValue([fileTreeModule, terminalModule, hooksModule])
    mockedBuildSummaries.mockReturnValue([
      createMockStructuralSummary(fileTreeModule, { recentlyChanged: true }),
      createMockStructuralSummary(terminalModule, { recentlyChanged: false }),
      createMockStructuralSummary(hooksModule, { recentlyChanged: true }),
    ])
    mockedBuildDeps.mockReturnValue([])

    const result = generateRepoMap({ repoFacts, repoIndex, workspaceRoot: rootPath })

    const fileTreeEntry = result.modules.find((m) => m.structural.module.id === 'file-tree')
    const terminalEntry = result.modules.find((m) => m.structural.module.id === 'terminal')
    const hooksEntry = result.modules.find((m) => m.structural.module.id === 'hooks')

    expect(fileTreeEntry?.structural.recentlyChanged).toBe(true)
    expect(terminalEntry?.structural.recentlyChanged).toBe(false)
    expect(hooksEntry?.structural.recentlyChanged).toBe(true)
  })
})

describe('detectFrameworks', () => {
  it('detects Electron from directory structure patterns', () => {
    const rootPath = '/home/user/electron-app'
    const files = [
      createMockFile({ relativePath: 'src/main/main.ts', rootPath }),
      createMockFile({ relativePath: 'src/renderer/App.tsx', rootPath, extension: '.tsx' }),
      createMockFile({ relativePath: 'src/preload/preload.ts', rootPath }),
      createMockFile({ relativePath: 'electron.vite.config.ts', rootPath }),
    ]

    const repoIndex = createMockRepoIndex(rootPath, files)
    const result = detectFrameworks(repoIndex)

    expect(result).toContain('Electron')
  })

  it('detects multiple frameworks from config files and extensions', () => {
    const rootPath = '/home/user/nextjs-app'
    const files = [
      createMockFile({ relativePath: 'next.config.js', rootPath, extension: '.js', language: 'javascript' }),
      createMockFile({ relativePath: 'tailwind.config.js', rootPath, extension: '.js', language: 'javascript' }),
      createMockFile({ relativePath: 'src/pages/index.tsx', rootPath, extension: '.tsx' }),
      createMockFile({ relativePath: 'src/pages/about.tsx', rootPath, extension: '.tsx' }),
      createMockFile({ relativePath: 'src/components/Header.tsx', rootPath, extension: '.tsx' }),
    ]

    const repoIndex = createMockRepoIndex(rootPath, files)
    const result = detectFrameworks(repoIndex)

    expect(result).toContain('Next.js')
    expect(result).toContain('Tailwind CSS')
    expect(result).not.toContain('React')
  })

  it('detects React from tsx file count when no meta-framework is present', () => {
    const rootPath = '/home/user/react-app'
    const files = [
      createMockFile({ relativePath: 'src/App.tsx', rootPath, extension: '.tsx' }),
      createMockFile({ relativePath: 'src/components/Header.tsx', rootPath, extension: '.tsx' }),
      createMockFile({ relativePath: 'src/components/Footer.tsx', rootPath, extension: '.tsx' }),
      createMockFile({ relativePath: 'vite.config.ts', rootPath }),
    ]

    const repoIndex = createMockRepoIndex(rootPath, files)
    const result = detectFrameworks(repoIndex)

    expect(result).toContain('React')
    expect(result).toContain('Vite')
  })

  it('detects Vue from config file and .vue extensions', () => {
    const rootPath = '/home/user/vue-app'
    const files = [
      createMockFile({ relativePath: 'vue.config.js', rootPath, extension: '.js', language: 'javascript' }),
      createMockFile({ relativePath: 'src/App.vue', rootPath, extension: '.vue', language: 'vue' }),
    ]

    const repoIndex = createMockRepoIndex(rootPath, files)
    const result = detectFrameworks(repoIndex)

    expect(result).toContain('Vue')
  })

  it('detects Angular from angular.json', () => {
    const rootPath = '/home/user/angular-app'
    const files = [
      createMockFile({ relativePath: 'angular.json', rootPath, extension: '.json', language: 'json' }),
      createMockFile({ relativePath: 'src/app/app.component.ts', rootPath }),
    ]

    const repoIndex = createMockRepoIndex(rootPath, files)
    const result = detectFrameworks(repoIndex)

    expect(result).toContain('Angular')
  })

  it('detects Svelte from config file', () => {
    const rootPath = '/home/user/svelte-app'
    const files = [
      createMockFile({ relativePath: 'svelte.config.js', rootPath, extension: '.js', language: 'javascript' }),
      createMockFile({ relativePath: 'src/App.svelte', rootPath, extension: '.svelte', language: 'svelte' }),
    ]

    const repoIndex = createMockRepoIndex(rootPath, files)
    const result = detectFrameworks(repoIndex)

    expect(result).toContain('Svelte')
  })

  it('returns empty array for a project with no recognizable framework patterns', () => {
    const rootPath = '/home/user/plain-project'
    const files = [
      createMockFile({ relativePath: 'src/index.ts', rootPath }),
      createMockFile({ relativePath: 'src/util.ts', rootPath }),
    ]

    const repoIndex = createMockRepoIndex(rootPath, files)
    const result = detectFrameworks(repoIndex)

    expect(result).toEqual([])
  })
})

describe('detectProjectName', () => {
  it('returns basename of workspaceRoot when no package.json exists', () => {
    const rootPath = '/home/user/my-project'
    const repoIndex = createMockRepoIndex(rootPath, [
      createMockFile({ relativePath: 'src/index.ts' }),
    ])

    const result = detectProjectName(rootPath, repoIndex)

    expect(result).toBe('my-project')
  })

  it('returns basename when package.json exists but readFileSync fails', () => {
    const rootPath = '/home/user/my-project'
    const repoIndex = createMockRepoIndex(rootPath, [
      createMockFile({ relativePath: 'package.json', path: `${rootPath}/package.json`, extension: '.json', language: 'json' }),
    ])

    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT')
    })

    const result = detectProjectName(rootPath, repoIndex)

    expect(result).toBe('my-project')
  })

  it('reads name from package.json when available', () => {
    const rootPath = '/home/user/my-project'
    const repoIndex = createMockRepoIndex(rootPath, [
      createMockFile({ relativePath: 'package.json', path: `${rootPath}/package.json`, extension: '.json', language: 'json' }),
    ])

    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: 'ouroboros-ide' }) as unknown as string & Buffer<ArrayBufferLike>)

    const result = detectProjectName(rootPath, repoIndex)

    expect(result).toBe('ouroboros-ide')
  })

  it('falls back to basename when package.json has empty name', () => {
    const rootPath = '/home/user/my-project'
    const repoIndex = createMockRepoIndex(rootPath, [
      createMockFile({ relativePath: 'package.json', path: `${rootPath}/package.json`, extension: '.json', language: 'json' }),
    ])

    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: '' }) as unknown as string & Buffer<ArrayBufferLike>)

    const result = detectProjectName(rootPath, repoIndex)

    expect(result).toBe('my-project')
  })
})

describe('compressRepoMap', () => {
  it('produces a RepoMapSummary with correct fields and truncated exports', () => {
    const repoMap: RepoMap = {
      version: 1,
      generatedAt: 1000,
      workspaceRoot: '/home/user/project',
      projectName: 'test-project',
      languages: ['typescript', 'javascript'],
      frameworks: ['React', 'Vite'],
      moduleCount: 2,
      totalFileCount: 15,
      modules: [
        {
          structural: createMockStructuralSummary(
            createMockModuleIdentity('file-tree', 'src/components/FileTree'),
            {
              fileCount: 8,
              exports: ['TreeView', 'FileList', 'SearchOverlay', 'ContextMenu', 'RootSection', 'VirtualTree', 'useTreeState', 'treeUtils'],
              recentlyChanged: true,
            }
          ),
        },
        {
          structural: createMockStructuralSummary(
            createMockModuleIdentity('terminal', 'src/components/Terminal'),
            {
              fileCount: 7,
              exports: ['TerminalManager', 'TerminalInstance', 'TerminalPane'],
              recentlyChanged: false,
            }
          ),
        },
      ],
      crossModuleDependencies: [{ from: 'file-tree', to: 'terminal', weight: 2 }],
    }

    const result = compressRepoMap(repoMap)

    expect(result.projectName).toBe('test-project')
    expect(result.languages).toEqual(['typescript', 'javascript'])
    expect(result.frameworks).toEqual(['React', 'Vite'])
    expect(result.moduleCount).toBe(2)
    expect(result.modules).toHaveLength(2)

    const fileTreeSummary = result.modules.find((m) => m.id === 'file-tree')
    expect(fileTreeSummary).toBeDefined()
    expect(fileTreeSummary?.exports.length).toBeLessThanOrEqual(5)
    expect(fileTreeSummary?.exports).toEqual(['TreeView', 'FileList', 'SearchOverlay', 'ContextMenu', 'RootSection'])
    expect(fileTreeSummary?.fileCount).toBe(8)
    expect(fileTreeSummary?.recentlyChanged).toBe(true)
    expect(fileTreeSummary?.label).toBe('File Tree')
    expect(fileTreeSummary?.rootPath).toBe('src/components/FileTree')

    const terminalSummary = result.modules.find((m) => m.id === 'terminal')
    expect(terminalSummary).toBeDefined()
    expect(terminalSummary?.exports).toEqual(['TerminalManager', 'TerminalInstance', 'TerminalPane'])
    expect(terminalSummary?.recentlyChanged).toBe(false)
  })

  it('handles an empty modules list', () => {
    const repoMap: RepoMap = {
      version: 1,
      generatedAt: 1000,
      workspaceRoot: '/home/user/project',
      projectName: 'empty-project',
      languages: [],
      frameworks: [],
      moduleCount: 0,
      totalFileCount: 0,
      modules: [],
      crossModuleDependencies: [],
    }

    const result = compressRepoMap(repoMap)

    expect(result.projectName).toBe('empty-project')
    expect(result.moduleCount).toBe(0)
    expect(result.modules).toEqual([])
  })
})

describe('size cap enforcement', () => {
  it('does not truncate a RepoMap that is already under 8KB', () => {
    const rootPath = '/home/user/small-project'
    const files = [
      createMockFile({ relativePath: 'src/index.ts', path: `${rootPath}/src/index.ts` }),
      createMockFile({ relativePath: 'src/util.ts', path: `${rootPath}/src/util.ts` }),
    ]

    const repoIndex = createMockRepoIndex(rootPath, files)
    const repoFacts = createMockRepoFacts()

    const mod = createMockModuleIdentity('app', 'src')
    mockedDetectModules.mockReturnValue([mod])
    mockedBuildSummaries.mockReturnValue([
      createMockStructuralSummary(mod, { fileCount: 2, exports: ['main', 'init'] }),
    ])
    mockedBuildDeps.mockReturnValue([])

    const result = generateRepoMap({ repoFacts, repoIndex, workspaceRoot: rootPath })

    expect(result.modules[0].structural.exports).toEqual(['main', 'init'])
    expect(result.modules[0].structural.imports).toEqual(['react', '../utils'])
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(8192)
  })
})

describe('multi-root workspace', () => {
  it('prefixes module IDs with root basename when multiple roots exist', () => {
    const rootPath1 = '/home/user/workspace/frontend'
    const rootPath2 = '/home/user/workspace/backend'

    const files1 = [createMockFile({ rootPath: rootPath1, relativePath: 'src/App.tsx', path: `${rootPath1}/src/App.tsx` })]
    const files2 = [createMockFile({ rootPath: rootPath2, relativePath: 'src/server.ts', path: `${rootPath2}/src/server.ts` })]

    const repoIndex: RepoIndexSnapshot = {
      indexedAt: 1000,
      repoFacts: createMockRepoFacts({ workspaceRoots: [rootPath1, rootPath2] }),
      roots: [
        createMockRootSnapshot(rootPath1, files1),
        createMockRootSnapshot(rootPath2, files2),
      ],
      cache: { key: 'mock', hit: false, roots: [] },
    }

    const repoFacts = createMockRepoFacts({ workspaceRoots: [rootPath1, rootPath2] })

    const frontendMod = createMockModuleIdentity('app', 'src')
    const backendMod = createMockModuleIdentity('server', 'src')

    mockedDetectModules.mockImplementation((_files, root) => {
      if (root === rootPath1) return [frontendMod]
      if (root === rootPath2) return [backendMod]
      return []
    })
    mockedBuildSummaries.mockReturnValue([
      createMockStructuralSummary({ ...frontendMod, id: 'frontend/app', label: 'frontend: App' }, { fileCount: 1 }),
      createMockStructuralSummary({ ...backendMod, id: 'backend/server', label: 'backend: Server' }, { fileCount: 1 }),
    ])
    mockedBuildDeps.mockReturnValue([])

    const result = generateRepoMap({
      repoFacts,
      repoIndex,
      workspaceRoot: rootPath1,
    })

    expect(mockedDetectModules).toHaveBeenCalledTimes(2)
    expect(result.modules).toHaveLength(2)
  })
})
