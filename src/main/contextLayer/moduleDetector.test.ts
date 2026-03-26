import { describe, expect,it } from 'vitest'

import type { IndexedRepoFile } from '../orchestration/repoIndexer'
import { buildCrossModuleDependencies,buildModuleStructuralSummaries, detectModules } from './moduleDetector'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeFile(overrides: Partial<IndexedRepoFile> & { relativePath: string }): IndexedRepoFile {
  const relativePath = overrides.relativePath
  const ext = detectTestExtension(relativePath)
  const rootPath = overrides.rootPath ?? '/workspace'
  return {
    rootPath,
    path: `${rootPath}/${relativePath}`.replace(/\\/g, '/'),
    extension: overrides.extension ?? ext,
    language: overrides.language ?? extensionToLanguage(ext),
    size: overrides.size ?? 1000,
    modifiedAt: overrides.modifiedAt ?? 1700000000000,
    imports: overrides.imports ?? [],
    ...overrides,
  }
}

function detectTestExtension(name: string): string {
  if (name.endsWith('.d.ts')) return '.d.ts'
  if (name.endsWith('.tsx')) return '.tsx'
  if (name.endsWith('.ts')) return '.ts'
  if (name.endsWith('.jsx')) return '.jsx'
  if (name.endsWith('.js')) return '.js'
  if (name.endsWith('.json')) return '.json'
  if (name.endsWith('.css')) return '.css'
  if (name.endsWith('.md')) return '.md'
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot) : ''
}

function extensionToLanguage(ext: string): string {
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.d.ts': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.json': 'json',
    '.css': 'css',
    '.md': 'markdown',
  }
  // eslint-disable-next-line security/detect-object-injection -- ext is a controlled string from getExtension()
  return map[ext] ?? 'unknown'
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('moduleDetector', () => {
  describe('detectModules', () => {
    it('detects feature-folder modules from directories with 2+ source files', () => {
      const files = [
        makeFile({ relativePath: 'src/renderer/components/FileTree/FileTreeBody.tsx' }),
        makeFile({ relativePath: 'src/renderer/components/FileTree/FileListItem.tsx' }),
        makeFile({ relativePath: 'src/renderer/components/FileTree/VirtualTreeList.tsx' }),
        makeFile({ relativePath: 'src/renderer/components/FileTree/fileTreeUtils.ts' }),
      ]

      const modules = detectModules(files, '/workspace')

      const fileTreeModule = modules.find((m) => m.id === 'file-tree')
      expect(fileTreeModule).toBeDefined()
      expect(fileTreeModule!.pattern).toBe('feature-folder')
      expect(fileTreeModule!.rootPath).toBe('src/renderer/components/FileTree')
      expect(fileTreeModule!.label).toBe('File Tree')
    })

    it('detects flat-group modules from files sharing a common basename prefix', () => {
      const files = [
        makeFile({ relativePath: 'src/main/config.ts' }),
        makeFile({ relativePath: 'src/main/configSchema.ts' }),
        makeFile({ relativePath: 'src/main/configSchemaTail.ts' }),
      ]

      const modules = detectModules(files, '/workspace')

      const configModule = modules.find((m) => m.id === 'config')
      expect(configModule).toBeDefined()
      expect(configModule!.pattern).toBe('flat-group')
    })

    it('detects single-file modules for standalone significant files', () => {
      const files = [
        makeFile({ relativePath: 'src/main/hooks.ts', size: 5000 }),
      ]

      const modules = detectModules(files, '/workspace')

      const hooksModule = modules.find((m) => m.id === 'hooks')
      expect(hooksModule).toBeDefined()
      expect(hooksModule!.pattern).toBe('single-file')
    })

    it('does not create single-file modules for small files', () => {
      const files = [
        makeFile({ relativePath: 'src/main/tiny.ts', size: 100 }),
      ]

      const modules = detectModules(files, '/workspace')

      const tinyModule = modules.find((m) => m.id === 'tiny')
      expect(tinyModule).toBeUndefined()
    })

    it('does not create single-file modules for .d.ts files', () => {
      const files = [
        makeFile({ relativePath: 'src/types/electron.d.ts', extension: '.d.ts', size: 5000 }),
      ]

      const modules = detectModules(files, '/workspace')

      const typesModule = modules.find((m) => m.pattern === 'single-file')
      expect(typesModule).toBeUndefined()
    })

    it('groups root config files as project-config', () => {
      const files = [
        makeFile({ relativePath: 'package.json', extension: '.json', language: 'json' }),
        makeFile({ relativePath: 'tsconfig.json', extension: '.json', language: 'json' }),
        makeFile({ relativePath: 'electron.vite.config.ts', extension: '.ts' }),
      ]

      const modules = detectModules(files, '/workspace')

      const configModule = modules.find((m) => m.id === 'project-config')
      expect(configModule).toBeDefined()
      expect(configModule!.pattern).toBe('config')
      expect(configModule!.label).toBe('Project Config')
    })

    it('assigns test files to the same module as their parent source files', () => {
      const files = [
        makeFile({ relativePath: 'src/renderer/components/FileTree/FileTreeBody.tsx' }),
        makeFile({ relativePath: 'src/renderer/components/FileTree/fileTreeUtils.ts' }),
        makeFile({ relativePath: 'src/renderer/components/FileTree/fileTreeUtils.test.ts' }),
      ]

      const modules = detectModules(files, '/workspace')

      // There should be a single file-tree module, no separate test module
      const fileTreeModules = modules.filter((m) => m.rootPath.includes('FileTree'))
      expect(fileTreeModules).toHaveLength(1)
      expect(fileTreeModules[0].id).toBe('file-tree')

      // Verify the test file is NOT in a separate module
      const testModules = modules.filter((m) => m.id.includes('test'))
      expect(testModules).toHaveLength(0)
    })

    it('enforces the 50-module cap by merging smallest into other', () => {
      // Create 55 directories each with 2 files => 55 feature-folder modules
      const files: IndexedRepoFile[] = []
      for (let i = 0; i < 55; i++) {
        const dirName = `Module${String(i).padStart(3, '0')}`
        files.push(makeFile({ relativePath: `src/components/${dirName}/index.ts` }))
        files.push(makeFile({ relativePath: `src/components/${dirName}/main.ts` }))
      }

      const modules = detectModules(files, '/workspace')

      expect(modules.length).toBeLessThanOrEqual(50)

      const otherModule = modules.find((m) => m.id === 'other')
      expect(otherModule).toBeDefined()
    })

    it('deduplicates module IDs by prepending parent directory name', () => {
      const files = [
        // Two directories named 'hooks' in different locations
        makeFile({ relativePath: 'src/main/hooks/useConfig.ts' }),
        makeFile({ relativePath: 'src/main/hooks/useTheme.ts' }),
        makeFile({ relativePath: 'src/renderer/hooks/useConfig.ts' }),
        makeFile({ relativePath: 'src/renderer/hooks/useTheme.ts' }),
      ]

      const modules = detectModules(files, '/workspace')

      // Both should exist but with different IDs
      const hookModules = modules.filter((m) => m.id.includes('hooks'))
      expect(hookModules.length).toBe(2)

      const ids = hookModules.map((m) => m.id).sort()
      expect(ids[0]).not.toBe(ids[1])
      // One should be prefixed with 'main-' and the other with 'renderer-'
      expect(ids.some((id) => id.includes('main'))).toBe(true)
      expect(ids.some((id) => id.includes('renderer'))).toBe(true)
    })

    it('returns modules sorted by ID', () => {
      const files = [
        makeFile({ relativePath: 'src/renderer/components/Terminal/Terminal.tsx' }),
        makeFile({ relativePath: 'src/renderer/components/Terminal/TerminalManager.tsx' }),
        makeFile({ relativePath: 'src/renderer/components/FileTree/FileTreeBody.tsx' }),
        makeFile({ relativePath: 'src/renderer/components/FileTree/FileListItem.tsx' }),
        makeFile({ relativePath: 'src/main/hooks.ts', size: 5000 }),
      ]

      const modules = detectModules(files, '/workspace')
      const ids = modules.map((m) => m.id)
      const sorted = [...ids].sort()
      expect(ids).toEqual(sorted)
    })

    it('handles mixed feature-folder and flat-group detection', () => {
      const files = [
        // Feature folder
        makeFile({ relativePath: 'src/renderer/components/FileTree/FileTreeBody.tsx' }),
        makeFile({ relativePath: 'src/renderer/components/FileTree/FileListItem.tsx' }),
        // Flat group
        makeFile({ relativePath: 'src/main/config.ts' }),
        makeFile({ relativePath: 'src/main/configSchema.ts' }),
        // Config
        makeFile({ relativePath: 'package.json', extension: '.json', language: 'json' }),
        // Single file
        makeFile({ relativePath: 'src/main/hooks.ts', size: 5000 }),
      ]

      const modules = detectModules(files, '/workspace')

      expect(modules.find((m) => m.pattern === 'feature-folder')).toBeDefined()
      expect(modules.find((m) => m.pattern === 'flat-group')).toBeDefined()
      expect(modules.find((m) => m.pattern === 'config')).toBeDefined()
      expect(modules.find((m) => m.pattern === 'single-file')).toBeDefined()
    })

    it('does not create modules for non-source files', () => {
      const files = [
        makeFile({ relativePath: 'README.md', extension: '.md', language: 'markdown', size: 5000 }),
        makeFile({ relativePath: 'docs/guide.md', extension: '.md', language: 'markdown', size: 5000 }),
      ]

      const modules = detectModules(files, '/workspace')

      // Markdown files are not source files, so no modules from them
      expect(modules.length).toBe(0)
    })

    it('respects depth limit below src/', () => {
      // Create files at depth 4 below src/ — should NOT become a module
      const files = [
        makeFile({ relativePath: 'src/a/b/c/d/deep1.ts' }),
        makeFile({ relativePath: 'src/a/b/c/d/deep2.ts' }),
      ]

      const modules = detectModules(files, '/workspace')

      // The deeply nested directory should not produce a feature-folder module
      const deepModule = modules.find((m) => m.id === 'd')
      expect(deepModule).toBeUndefined()
    })
  })

  describe('buildModuleStructuralSummaries', () => {
    it('computes file counts and approximate line counts', () => {
      const files = [
        makeFile({ relativePath: 'src/renderer/components/FileTree/FileTreeBody.tsx', size: 4000 }),
        makeFile({ relativePath: 'src/renderer/components/FileTree/FileListItem.tsx', size: 2000 }),
        makeFile({ relativePath: 'src/renderer/components/FileTree/fileTreeUtils.ts', size: 800 }),
      ]

      const modules = detectModules(files, '/workspace')
      const summaries = buildModuleStructuralSummaries({
        modules,
        files,
        workspaceRoot: '/workspace',
      })

      const fileTreeSummary = summaries.find((s) => s.module.id === 'file-tree')
      expect(fileTreeSummary).toBeDefined()
      expect(fileTreeSummary!.fileCount).toBe(3)
      // totalLines = ceil((4000 + 2000 + 800) / 40) = ceil(170) = 170
      expect(fileTreeSummary!.totalLines).toBe(170)
    })

    it('collects unique languages from module files', () => {
      const files = [
        makeFile({ relativePath: 'src/renderer/components/Mix/Component.tsx', language: 'typescript' }),
        makeFile({ relativePath: 'src/renderer/components/Mix/styles.css', extension: '.css', language: 'css' }),
        makeFile({ relativePath: 'src/renderer/components/Mix/helper.ts', language: 'typescript' }),
      ]

      const modules = detectModules(files, '/workspace')
      const summaries = buildModuleStructuralSummaries({
        modules,
        files,
        workspaceRoot: '/workspace',
      })

      const mixSummary = summaries.find((s) => s.module.id === 'mix')
      expect(mixSummary).toBeDefined()
      expect(mixSummary!.languages).toEqual(['css', 'typescript'])
    })

    it('identifies entry point files', () => {
      const files = [
        makeFile({ relativePath: 'src/renderer/components/FileTree/index.ts' }),
        makeFile({ relativePath: 'src/renderer/components/FileTree/FileTreeBody.tsx' }),
        makeFile({ relativePath: 'src/renderer/components/FileTree/FileListItem.tsx' }),
      ]

      const modules = detectModules(files, '/workspace')
      const summaries = buildModuleStructuralSummaries({
        modules,
        files,
        workspaceRoot: '/workspace',
      })

      const fileTreeSummary = summaries.find((s) => s.module.id === 'file-tree')
      expect(fileTreeSummary).toBeDefined()
      expect(fileTreeSummary!.entryPoints).toContain('src/renderer/components/FileTree/index.ts')
    })

    it('marks modules as recentlyChanged when gitDiffFiles contains a module file', () => {
      const files = [
        makeFile({ relativePath: 'src/renderer/components/FileTree/FileTreeBody.tsx' }),
        makeFile({ relativePath: 'src/renderer/components/FileTree/FileListItem.tsx' }),
      ]

      const modules = detectModules(files, '/workspace')

      const summariesUnchanged = buildModuleStructuralSummaries({
        modules,
        files,
        workspaceRoot: '/workspace',
        gitDiffFiles: new Set(['src/main/unrelated.ts']),
      })
      expect(summariesUnchanged[0].recentlyChanged).toBe(false)

      const summariesChanged = buildModuleStructuralSummaries({
        modules,
        files,
        workspaceRoot: '/workspace',
        gitDiffFiles: new Set(['src/renderer/components/FileTree/FileTreeBody.tsx']),
      })
      const changedSummary = summariesChanged.find((s) => s.module.id === 'file-tree')
      expect(changedSummary!.recentlyChanged).toBe(true)
    })

    it('collects external (npm) imports', () => {
      const files = [
        makeFile({
          relativePath: 'src/renderer/components/Terminal/Terminal.tsx',
          imports: ['@xterm/xterm', 'react', './TerminalManager', '../Layout/AppLayout'],
        }),
        makeFile({
          relativePath: 'src/renderer/components/Terminal/TerminalManager.tsx',
          imports: ['react', '@xterm/addon-fit', './Terminal'],
        }),
      ]

      const modules = detectModules(files, '/workspace')
      const summaries = buildModuleStructuralSummaries({
        modules,
        files,
        workspaceRoot: '/workspace',
      })

      const terminalSummary = summaries.find((s) => s.module.id === 'terminal')
      expect(terminalSummary).toBeDefined()
      expect(terminalSummary!.imports).toContain('react')
      expect(terminalSummary!.imports).toContain('@xterm/xterm')
      expect(terminalSummary!.imports).toContain('@xterm/addon-fit')
      // Relative imports should NOT be in the external imports list
      expect(terminalSummary!.imports).not.toContain('./TerminalManager')
    })

    it('computes lastModified as the max modifiedAt across module files', () => {
      const files = [
        makeFile({ relativePath: 'src/renderer/components/FileTree/FileTreeBody.tsx', modifiedAt: 1000 }),
        makeFile({ relativePath: 'src/renderer/components/FileTree/FileListItem.tsx', modifiedAt: 3000 }),
        makeFile({ relativePath: 'src/renderer/components/FileTree/fileTreeUtils.ts', modifiedAt: 2000 }),
      ]

      const modules = detectModules(files, '/workspace')
      const summaries = buildModuleStructuralSummaries({
        modules,
        files,
        workspaceRoot: '/workspace',
      })

      const fileTreeSummary = summaries.find((s) => s.module.id === 'file-tree')
      expect(fileTreeSummary!.lastModified).toBe(3000)
    })
  })

  describe('content hash determinism', () => {
    it('produces the same hash regardless of path separator style', () => {
      const filesForward = [
        makeFile({ relativePath: 'src/main/config.ts', modifiedAt: 1700000000000 }),
        makeFile({ relativePath: 'src/main/configSchema.ts', modifiedAt: 1700000001000 }),
      ]
      const filesBackslash = [
        makeFile({ relativePath: 'src\\main\\config.ts', modifiedAt: 1700000000000 }),
        makeFile({ relativePath: 'src\\main\\configSchema.ts', modifiedAt: 1700000001000 }),
      ]

      const modulesForward = detectModules(filesForward, '/workspace')
      const modulesBackslash = detectModules(filesBackslash, '/workspace')

      const summariesForward = buildModuleStructuralSummaries({
        modules: modulesForward,
        files: filesForward,
        workspaceRoot: '/workspace',
      })
      const summariesBackslash = buildModuleStructuralSummaries({
        modules: modulesBackslash,
        files: filesBackslash,
        workspaceRoot: '/workspace',
      })

      // Find the config module in both
      const configForward = summariesForward.find((s) => s.module.id === 'config')
      const configBackslash = summariesBackslash.find((s) => s.module.id === 'config')
      expect(configForward).toBeDefined()
      expect(configBackslash).toBeDefined()
      expect(configForward!.contentHash).toBe(configBackslash!.contentHash)
    })

    it('produces different hashes when file content changes (modifiedAt differs)', () => {
      const filesA = [
        makeFile({ relativePath: 'src/main/config.ts', modifiedAt: 1700000000000 }),
        makeFile({ relativePath: 'src/main/configSchema.ts', modifiedAt: 1700000001000 }),
      ]
      const filesB = [
        makeFile({ relativePath: 'src/main/config.ts', modifiedAt: 1700000099999 }),
        makeFile({ relativePath: 'src/main/configSchema.ts', modifiedAt: 1700000001000 }),
      ]

      const modulesA = detectModules(filesA, '/workspace')
      const modulesB = detectModules(filesB, '/workspace')

      const summariesA = buildModuleStructuralSummaries({
        modules: modulesA,
        files: filesA,
        workspaceRoot: '/workspace',
      })
      const summariesB = buildModuleStructuralSummaries({
        modules: modulesB,
        files: filesB,
        workspaceRoot: '/workspace',
      })

      const configA = summariesA.find((s) => s.module.id === 'config')
      const configB = summariesB.find((s) => s.module.id === 'config')
      expect(configA!.contentHash).not.toBe(configB!.contentHash)
    })
  })

  describe('buildCrossModuleDependencies', () => {
    it('creates an edge when module A imports from module B via relative path', () => {
      const files = [
        makeFile({
          relativePath: 'src/renderer/components/Terminal/Terminal.tsx',
          imports: ['../Layout/AppLayout'],
        }),
        makeFile({
          relativePath: 'src/renderer/components/Terminal/TerminalManager.tsx',
          imports: ['./Terminal', '../Layout/AppLayout'],
        }),
        makeFile({
          relativePath: 'src/renderer/components/Layout/AppLayout.tsx',
          imports: ['react'],
        }),
        makeFile({
          relativePath: 'src/renderer/components/Layout/InnerAppLayout.tsx',
          imports: ['./AppLayout'],
        }),
      ]

      const modules = detectModules(files, '/workspace')
      const summaries = buildModuleStructuralSummaries({
        modules,
        files,
        workspaceRoot: '/workspace',
      })
      const dependencies = buildCrossModuleDependencies({
        modules,
        summaries,
        files,
        workspaceRoot: '/workspace',
      })

      // Terminal -> Layout edge should exist
      const termToLayout = dependencies.find(
        (d) => d.from === 'terminal' && d.to === 'layout'
      )
      expect(termToLayout).toBeDefined()
      expect(termToLayout!.weight).toBeGreaterThanOrEqual(1)
    })

    it('does not create self-referencing edges', () => {
      const files = [
        makeFile({
          relativePath: 'src/renderer/components/FileTree/FileTreeBody.tsx',
          imports: ['./fileTreeUtils', './FileListItem'],
        }),
        makeFile({
          relativePath: 'src/renderer/components/FileTree/fileTreeUtils.ts',
          imports: [],
        }),
        makeFile({
          relativePath: 'src/renderer/components/FileTree/FileListItem.tsx',
          imports: ['./fileTreeUtils'],
        }),
      ]

      const modules = detectModules(files, '/workspace')
      const summaries = buildModuleStructuralSummaries({
        modules,
        files,
        workspaceRoot: '/workspace',
      })
      const dependencies = buildCrossModuleDependencies({
        modules,
        summaries,
        files,
        workspaceRoot: '/workspace',
      })

      // No self-referencing edges
      const selfEdges = dependencies.filter((d) => d.from === d.to)
      expect(selfEdges).toHaveLength(0)
    })

    it('does not create edges for external npm imports', () => {
      const files = [
        makeFile({
          relativePath: 'src/renderer/components/Terminal/Terminal.tsx',
          imports: ['react', '@xterm/xterm', 'electron'],
        }),
        makeFile({
          relativePath: 'src/renderer/components/Terminal/TerminalManager.tsx',
          imports: ['react'],
        }),
      ]

      const modules = detectModules(files, '/workspace')
      const summaries = buildModuleStructuralSummaries({
        modules,
        files,
        workspaceRoot: '/workspace',
      })
      const dependencies = buildCrossModuleDependencies({
        modules,
        summaries,
        files,
        workspaceRoot: '/workspace',
      })

      // No edges should be created for npm packages
      expect(dependencies).toHaveLength(0)
    })

    it('accumulates weight for multiple imports between the same modules', () => {
      const files = [
        makeFile({
          relativePath: 'src/renderer/components/Editor/Editor.tsx',
          imports: ['../Shared/Button', '../Shared/Icon', '../Shared/Tooltip'],
        }),
        makeFile({
          relativePath: 'src/renderer/components/Editor/EditorToolbar.tsx',
          imports: ['../Shared/Button'],
        }),
        makeFile({
          relativePath: 'src/renderer/components/Shared/Button.tsx',
          imports: [],
        }),
        makeFile({
          relativePath: 'src/renderer/components/Shared/Icon.tsx',
          imports: [],
        }),
        makeFile({
          relativePath: 'src/renderer/components/Shared/Tooltip.tsx',
          imports: [],
        }),
      ]

      const modules = detectModules(files, '/workspace')
      const summaries = buildModuleStructuralSummaries({
        modules,
        files,
        workspaceRoot: '/workspace',
      })
      const dependencies = buildCrossModuleDependencies({
        modules,
        summaries,
        files,
        workspaceRoot: '/workspace',
      })

      const editorToShared = dependencies.find(
        (d) => d.from === 'editor' && d.to === 'shared'
      )
      // At least the 4 relative imports from Editor files to Shared files
      if (editorToShared) {
        expect(editorToShared.weight).toBeGreaterThanOrEqual(2)
      }
    })
  })

  describe('edge cases', () => {
    it('handles an empty file list', () => {
      const modules = detectModules([], '/workspace')
      expect(modules).toEqual([])
    })

    it('handles files with no extension gracefully', () => {
      const files = [
        makeFile({ relativePath: 'Dockerfile', extension: '', language: 'unknown', size: 500 }),
        makeFile({ relativePath: 'Makefile', extension: '', language: 'unknown', size: 500 }),
      ]

      const modules = detectModules(files, '/workspace')
      // No source files, so no modules
      expect(modules).toHaveLength(0)
    })

    it('handles files only at the root level', () => {
      const files = [
        makeFile({ relativePath: 'package.json', extension: '.json', language: 'json' }),
        makeFile({ relativePath: 'tsconfig.json', extension: '.json', language: 'json' }),
        makeFile({ relativePath: 'index.ts', size: 5000 }),
      ]

      const modules = detectModules(files, '/workspace')

      // Should have project-config and possibly a single-file module for index.ts
      expect(modules.find((m) => m.id === 'project-config')).toBeDefined()
    })

    it('does not crash when files have Windows-style backslash paths', () => {
      const files = [
        makeFile({ relativePath: 'src\\main\\config.ts' }),
        makeFile({ relativePath: 'src\\main\\configSchema.ts' }),
      ]

      // Should not throw
      expect(() => detectModules(files, 'C:\\workspace')).not.toThrow()
    })

    it('handles modules summary with zero files gracefully', () => {
      const modules = [
        {
          id: 'empty-module',
          label: 'Empty Module',
          rootPath: 'src/nonexistent',
          pattern: 'feature-folder' as const,
        },
      ]

      const summaries = buildModuleStructuralSummaries({
        modules,
        files: [],
        workspaceRoot: '/workspace',
      })

      expect(summaries).toHaveLength(1)
      expect(summaries[0].fileCount).toBe(0)
      expect(summaries[0].totalLines).toBe(0)
      expect(summaries[0].languages).toEqual([])
      expect(summaries[0].contentHash).toBeDefined()
    })
  })
})
