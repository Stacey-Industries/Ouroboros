import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModuleStructuralSummary } from './contextLayerTypes'
import {
  summarizeModule,
  shouldSummarize,
  selectSourceSnippets,
  estimateTokens,
} from './moduleSummarizer'
import type { SummarizationContext } from './moduleSummarizer'

// ---------------------------------------------------------------------------
// Mock the CLI spawner
// ---------------------------------------------------------------------------

const mockSpawnClaude = vi.fn<(prompt: string, model: string) => Promise<string>>()

vi.mock('../claudeMdGeneratorSupport', () => ({
  spawnClaude: (...args: unknown[]) => mockSpawnClaude(...(args as [string, string])),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStructural(overrides: Partial<ModuleStructuralSummary> = {}): ModuleStructuralSummary {
  return {
    module: {
      id: 'file-tree',
      label: 'FileTree',
      rootPath: 'src/renderer/components/FileTree',
      pattern: 'feature-folder',
    },
    fileCount: 5,
    totalLines: 300,
    languages: ['typescript', 'tsx'],
    exports: ['FileTree', 'useFileTree', 'FileTreeItem'],
    imports: ['react', 'zustand'],
    entryPoints: ['src/renderer/components/FileTree/index.ts'],
    recentlyChanged: false,
    lastModified: Date.now(),
    contentHash: 'hash123',
    ...overrides,
  }
}

function makeContext(overrides: Partial<SummarizationContext> = {}): SummarizationContext {
  return {
    module: makeStructural(overrides.module as Partial<ModuleStructuralSummary> | undefined),
    sourceSnippets: overrides.sourceSnippets ?? [
      { relativePath: 'src/renderer/components/FileTree/index.ts', content: 'export { FileTree } from "./FileTree"' },
      { relativePath: 'src/renderer/components/FileTree/FileTree.tsx', content: 'export function FileTree() { return <div /> }' },
    ],
    dependencyContext: overrides.dependencyContext ?? ['Layout', 'FileViewer'],
    projectContext: overrides.projectContext ?? { languages: ['typescript'], frameworks: ['react', 'electron'] },
  }
}

const validSummaryBody = {
  description: 'Renders a hierarchical file tree in the IDE sidebar, supporting expand/collapse and file selection.',
  keyResponsibilities: [
    'Render nested directory structure',
    'Handle file selection and navigation',
    'Support drag-and-drop operations',
  ],
  gotchas: ['Large directories cause slow re-renders without virtualization'],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

describe('summarizeModule', () => {
  it('returns a successful result with correct summary fields', async () => {
    mockSpawnClaude.mockResolvedValueOnce(JSON.stringify(validSummaryBody))

    const result = await summarizeModule(makeContext())

    expect(result.success).toBe(true)
    expect(result.summary).toBeDefined()
    expect(result.summary!.description).toBe(validSummaryBody.description)
    expect(result.summary!.keyResponsibilities).toEqual(validSummaryBody.keyResponsibilities)
    expect(result.summary!.gotchas).toEqual(validSummaryBody.gotchas)
    expect(result.summary!.generatedFrom).toBe('hash123')
    expect(result.summary!.generatedAt).toBeGreaterThan(0)
    expect(result.summary!.tokenCount).toBeGreaterThan(0)
    expect(result.inputTokens).toBeGreaterThan(0)
    expect(result.outputTokens).toBeGreaterThan(0)
  })

  it('constructs the prompt with module name, exports, and source snippets', async () => {
    mockSpawnClaude.mockResolvedValueOnce(JSON.stringify(validSummaryBody))

    await summarizeModule(makeContext())

    expect(mockSpawnClaude).toHaveBeenCalledTimes(1)
    const prompt = mockSpawnClaude.mock.calls[0][0]
    const model = mockSpawnClaude.mock.calls[0][1]

    expect(model).toBe('haiku')
    expect(prompt).toContain('FileTree')
    expect(prompt).toContain('src/renderer/components/FileTree')
    expect(prompt).toContain('FileTree, useFileTree, FileTreeItem')
    expect(prompt).toContain('Layout, FileViewer')
    expect(prompt).toContain('typescript / react, electron')
    expect(prompt).toContain('### src/renderer/components/FileTree/index.ts')
    expect(prompt).toContain('export { FileTree } from "./FileTree"')
  })

  it('strips markdown fences from the response before parsing', async () => {
    mockSpawnClaude.mockResolvedValueOnce('```json\n' + JSON.stringify(validSummaryBody) + '\n```')

    const result = await summarizeModule(makeContext())

    expect(result.success).toBe(true)
    expect(result.summary!.description).toBe(validSummaryBody.description)
  })

  it('retries once on invalid JSON, succeeds on second attempt', async () => {
    mockSpawnClaude
      .mockResolvedValueOnce('This is not JSON at all')
      .mockResolvedValueOnce(JSON.stringify(validSummaryBody))

    const result = await summarizeModule(makeContext())

    expect(mockSpawnClaude).toHaveBeenCalledTimes(2)
    expect(result.success).toBe(true)
    expect(result.summary!.description).toBe(validSummaryBody.description)
  })

  it('returns parse_failure when both attempts return garbage', async () => {
    mockSpawnClaude.mockResolvedValue('not valid json')

    const result = await summarizeModule(makeContext())

    expect(mockSpawnClaude).toHaveBeenCalledTimes(2)
    expect(result.success).toBe(false)
    expect(result.error).toBe('parse_failure')
  })

  it('returns no_auth on authentication error without retrying', async () => {
    mockSpawnClaude.mockRejectedValueOnce(new Error('claude exited with code 1: 401 Unauthorized'))

    const result = await summarizeModule(makeContext())

    expect(mockSpawnClaude).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(false)
    expect(result.error).toBe('no_auth')
  })

  it('returns rate_limited on 429 error without retrying', async () => {
    mockSpawnClaude.mockRejectedValueOnce(new Error('claude exited with code 1: 429 rate limit exceeded'))

    const result = await summarizeModule(makeContext())

    expect(mockSpawnClaude).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(false)
    expect(result.error).toBe('rate_limited')
  })

  it('returns network_error when CLI cannot connect', async () => {
    mockSpawnClaude.mockRejectedValueOnce(new Error('fetch failed'))

    const result = await summarizeModule(makeContext())

    expect(mockSpawnClaude).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(false)
    expect(result.error).toBe('network_error')
  })

  it('truncates description longer than 500 characters', async () => {
    const longDesc = 'A'.repeat(600)
    mockSpawnClaude.mockResolvedValueOnce(JSON.stringify({
      ...validSummaryBody,
      description: longDesc,
    }))

    const result = await summarizeModule(makeContext())

    expect(result.success).toBe(true)
    expect(result.summary!.description).toHaveLength(500)
  })

  it('trims keyResponsibilities to max 5 items', async () => {
    mockSpawnClaude.mockResolvedValueOnce(JSON.stringify({
      ...validSummaryBody,
      keyResponsibilities: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    }))

    const result = await summarizeModule(makeContext())

    expect(result.success).toBe(true)
    expect(result.summary!.keyResponsibilities).toHaveLength(5)
  })

  it('trims gotchas to max 3 items', async () => {
    mockSpawnClaude.mockResolvedValueOnce(JSON.stringify({
      ...validSummaryBody,
      gotchas: ['g1', 'g2', 'g3', 'g4', 'g5'],
    }))

    const result = await summarizeModule(makeContext())

    expect(result.success).toBe(true)
    expect(result.summary!.gotchas).toHaveLength(3)
  })

  it('tracks durationMs in the result', async () => {
    mockSpawnClaude.mockResolvedValueOnce(JSON.stringify(validSummaryBody))

    const result = await summarizeModule(makeContext())

    expect(result.success).toBe(true)
    expect(result.durationMs).toBeDefined()
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })
})

describe('shouldSummarize', () => {
  it('returns false for a small module (1 file, 20 lines)', () => {
    const structural = makeStructural({ fileCount: 1, totalLines: 20 })
    expect(shouldSummarize(structural)).toBe(false)
  })

  it('returns true when fileCount >= 3', () => {
    const structural = makeStructural({ fileCount: 3, totalLines: 30 })
    expect(shouldSummarize(structural)).toBe(true)
  })

  it('returns true when totalLines >= 50 even with 1 file', () => {
    const structural = makeStructural({ fileCount: 1, totalLines: 200 })
    expect(shouldSummarize(structural)).toBe(true)
  })
})

describe('selectSourceSnippets', () => {
  const baseFiles = [
    { relativePath: 'src/mod/utils.ts', size: 500, language: 'typescript', imports: [] },
    { relativePath: 'src/mod/index.ts', size: 100, language: 'typescript', imports: [] },
    { relativePath: 'src/mod/types.ts', size: 200, language: 'typescript', imports: [] },
    { relativePath: 'src/mod/BigComponent.tsx', size: 2000, language: 'tsx', imports: ['react'] },
    { relativePath: 'src/mod/helpers.ts', size: 800, language: 'typescript', imports: [] },
    { relativePath: 'src/mod/api.ts', size: 1500, language: 'typescript', imports: [] },
    { relativePath: 'src/mod/constants.ts', size: 300, language: 'typescript', imports: [] },
    { relativePath: 'src/mod/model.d.ts', size: 400, language: 'typescript', imports: [] },
  ]

  it('prioritises index.ts, then largest files, then type definitions', () => {
    const result = selectSourceSnippets({
      files: baseFiles,
      workspaceRoot: '/project',
      moduleRootPath: 'src/mod',
      maxSnippets: 5,
    })

    expect(result).toHaveLength(5)

    // index.ts should be first (entry point)
    expect(result[0].relativePath).toBe('src/mod/index.ts')

    // Remaining slots filled by largest files
    const paths = result.map((r) => r.relativePath)
    expect(paths).toContain('src/mod/BigComponent.tsx')
    expect(paths).toContain('src/mod/api.ts')
    expect(paths).toContain('src/mod/helpers.ts')
  })

  it('respects maxSnippets limit', () => {
    const result = selectSourceSnippets({
      files: baseFiles,
      workspaceRoot: '/project',
      moduleRootPath: 'src/mod',
      maxSnippets: 3,
    })

    expect(result).toHaveLength(3)
  })

  it('returns absolute paths based on workspace root', () => {
    const result = selectSourceSnippets({
      files: [baseFiles[1]], // just index.ts
      workspaceRoot: '/project',
      moduleRootPath: 'src/mod',
    })

    expect(result[0].absolutePath).toMatch(/[/\\]project[/\\]src[/\\]mod[/\\]index\.ts$/)
  })

  it('returns empty array for empty file list', () => {
    const result = selectSourceSnippets({
      files: [],
      workspaceRoot: '/project',
      moduleRootPath: 'src/mod',
    })

    expect(result).toEqual([])
  })

  it('deduplicates files that match multiple criteria', () => {
    // index.ts is both an entry point and might appear in "largest" sort
    const files = [
      { relativePath: 'src/mod/index.ts', size: 5000, language: 'typescript', imports: [] },
      { relativePath: 'src/mod/other.ts', size: 100, language: 'typescript', imports: [] },
    ]

    const result = selectSourceSnippets({
      files,
      workspaceRoot: '/project',
      moduleRootPath: 'src/mod',
      maxSnippets: 5,
    })

    // index.ts appears only once despite matching entry point AND largest
    const indexCount = result.filter((r) => r.relativePath === 'src/mod/index.ts').length
    expect(indexCount).toBe(1)
    expect(result).toHaveLength(2)
  })
})

describe('estimateTokens', () => {
  it('returns ceil(length / 4) for a short string', () => {
    // "hello world" is 11 chars → ceil(11/4) = 3
    expect(estimateTokens('hello world')).toBe(3)
  })

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('handles exact multiples of 4', () => {
    // 8 chars → ceil(8/4) = 2
    expect(estimateTokens('12345678')).toBe(2)
  })
})
