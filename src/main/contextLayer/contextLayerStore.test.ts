/* eslint-disable security/detect-non-literal-fs-filename -- test file uses temp dirs whose paths are constructed at runtime */
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { afterEach,beforeEach, describe, expect, it } from 'vitest'

import {
  contextDir,
  deleteModuleEntry,
  enforceSizeCap,
  ensureGitignore,
  initContextLayerStore,
  moduleEntryPath,
  modulesDir,
  readAllModuleEntries,
  readManifest,
  readModuleEntry,
  readRepoMap,
  sanitizeModuleId,
  writeManifest,
  writeModuleEntry,
  writeRepoMap,
} from './contextLayerStore'
import type { ContextLayerManifest, ModuleContextEntry, RepoMap } from './contextLayerTypes'

let testRoot: string

beforeEach(async () => {
  testRoot = await mkdtemp(path.join(tmpdir(), 'context-layer-test-'))
})

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeModuleEntry(overrides: Partial<ModuleContextEntry['structural']> = {}): ModuleContextEntry {
  return {
    structural: {
      module: {
        id: overrides.module?.id ?? 'test-module',
        label: overrides.module?.label ?? 'Test Module',
        rootPath: overrides.module?.rootPath ?? 'src/test',
        pattern: overrides.module?.pattern ?? 'feature-folder',
      },
      fileCount: 3,
      totalLines: 150,
      languages: ['typescript'],
      exports: ['foo', 'bar'],
      imports: ['react'],
      entryPoints: ['src/test/index.ts'],
      recentlyChanged: false,
      lastModified: Date.now(),
      contentHash: 'abc123',
      ...overrides,
    },
  }
}

function makeRepoMap(overrides: Partial<RepoMap> = {}): RepoMap {
  return {
    version: 1,
    generatedAt: Date.now(),
    workspaceRoot: testRoot,
    projectName: 'test-project',
    languages: ['typescript'],
    frameworks: ['react'],
    moduleCount: 1,
    totalFileCount: 5,
    modules: [makeModuleEntry()],
    crossModuleDependencies: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('contextLayerStore', () => {
  describe('initContextLayerStore', () => {
    it('creates .context/ and modules/ subdirectories and returns empty manifest', async () => {
      const manifest = await initContextLayerStore(testRoot)

      // Directories exist
      const ctxStat = await stat(contextDir(testRoot))
      expect(ctxStat.isDirectory()).toBe(true)
      const modStat = await stat(modulesDir(testRoot))
      expect(modStat.isDirectory()).toBe(true)

      // Manifest has expected shape
      expect(manifest.version).toBe(1)
      expect(manifest.lastFullRebuild).toBe(0)
      expect(manifest.lastIncrementalUpdate).toBe(0)
      expect(manifest.repoMapHash).toBe('')
      expect(manifest.moduleHashes).toEqual({})
      expect(manifest.totalSizeBytes).toBe(0)
    })

    it('returns existing manifest if already initialized', async () => {
      const first = await initContextLayerStore(testRoot)
      const updated: ContextLayerManifest = { ...first, repoMapHash: 'updated-hash' }
      await writeManifest(testRoot, updated)

      const second = await initContextLayerStore(testRoot)
      expect(second.repoMapHash).toBe('updated-hash')
    })
  })

  describe('writeRepoMap + readRepoMap', () => {
    it('round-trips a RepoMap through write and read', async () => {
      await initContextLayerStore(testRoot)
      const repoMap = makeRepoMap()
      await writeRepoMap(testRoot, repoMap)

      const result = await readRepoMap(testRoot)
      expect(result).not.toBeNull()
      expect(result!.projectName).toBe('test-project')
      expect(result!.version).toBe(1)
      expect(result!.modules).toHaveLength(1)
      expect(result!.modules[0].structural.module.id).toBe('test-module')
    })
  })

  describe('atomic write safety', () => {
    it('does not leave .tmp file behind after successful write', async () => {
      await initContextLayerStore(testRoot)
      const repoMap = makeRepoMap()
      await writeRepoMap(testRoot, repoMap)

      const files = await readdir(contextDir(testRoot))
      const tmpFiles = files.filter((f) => f.endsWith('.tmp'))
      expect(tmpFiles).toHaveLength(0)
    })
  })

  describe('readRepoMap with corrupt file', () => {
    it('returns null and deletes the corrupt file', async () => {
      await initContextLayerStore(testRoot)
      const filePath = path.join(contextDir(testRoot), 'repo-map.json')
      await writeFile(filePath, '{ this is not valid json!!!', 'utf-8')

      const result = await readRepoMap(testRoot)
      expect(result).toBeNull()

      // Corrupt file should be deleted
      let exists = true
      try {
        await stat(filePath)
      } catch {
        exists = false
      }
      expect(exists).toBe(false)
    })
  })

  describe('writeModuleEntry + readModuleEntry', () => {
    it('round-trips a ModuleContextEntry', async () => {
      await initContextLayerStore(testRoot)
      const entry = makeModuleEntry({ module: { id: 'file-tree', label: 'File Tree', rootPath: 'src/renderer/components/FileTree', pattern: 'feature-folder' } })
      await writeModuleEntry(testRoot, 'file-tree', entry)

      const result = await readModuleEntry(testRoot, 'file-tree')
      expect(result).not.toBeNull()
      expect(result!.structural.module.id).toBe('file-tree')
      expect(result!.structural.module.label).toBe('File Tree')
    })

    it('returns null for a module that does not exist', async () => {
      await initContextLayerStore(testRoot)
      const result = await readModuleEntry(testRoot, 'nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('readAllModuleEntries', () => {
    it('reads all module entries from the modules directory', async () => {
      await initContextLayerStore(testRoot)
      await writeModuleEntry(testRoot, 'alpha', makeModuleEntry({ module: { id: 'alpha', label: 'Alpha', rootPath: 'src/alpha', pattern: 'feature-folder' } }))
      await writeModuleEntry(testRoot, 'beta', makeModuleEntry({ module: { id: 'beta', label: 'Beta', rootPath: 'src/beta', pattern: 'feature-folder' } }))
      await writeModuleEntry(testRoot, 'gamma', makeModuleEntry({ module: { id: 'gamma', label: 'Gamma', rootPath: 'src/gamma', pattern: 'feature-folder' } }))

      const all = await readAllModuleEntries(testRoot)
      expect(all).toHaveLength(3)
      const ids = all.map((e) => e.structural.module.id).sort()
      expect(ids).toEqual(['alpha', 'beta', 'gamma'])
    })

    it('returns empty array when modules directory does not exist', async () => {
      const result = await readAllModuleEntries(testRoot)
      expect(result).toEqual([])
    })
  })

  describe('deleteModuleEntry', () => {
    it('deletes a module entry and readModuleEntry returns null after', async () => {
      await initContextLayerStore(testRoot)
      const entry = makeModuleEntry()
      await writeModuleEntry(testRoot, 'to-delete', entry)

      // Verify it exists
      const before = await readModuleEntry(testRoot, 'to-delete')
      expect(before).not.toBeNull()

      await deleteModuleEntry(testRoot, 'to-delete')

      const after = await readModuleEntry(testRoot, 'to-delete')
      expect(after).toBeNull()
    })

    it('does not throw when deleting a module that does not exist', async () => {
      await initContextLayerStore(testRoot)
      await expect(deleteModuleEntry(testRoot, 'nonexistent')).resolves.not.toThrow()
    })
  })

  describe('enforceSizeCap', () => {
    it('deletes oldest module entries when total size exceeds cap', async () => {
      await initContextLayerStore(testRoot)

      // Write several module entries with different lastModified timestamps
      // Use a large-ish payload to ensure meaningful file sizes
      const padding = 'x'.repeat(200)
      for (let i = 0; i < 5; i++) {
        const entry = makeModuleEntry({
          module: { id: `mod-${i}`, label: `Module ${i}`, rootPath: `src/mod-${i}`, pattern: 'feature-folder' },
          lastModified: 1000 + i * 1000, // mod-0 is oldest, mod-4 is newest
          exports: [padding],
        })
        await writeModuleEntry(testRoot, `mod-${i}`, entry)
      }

      // Calculate total size of all files
      const modPath = modulesDir(testRoot)
      const filesBefore = await readdir(modPath)
      let totalBefore = 0
      for (const f of filesBefore) {
        const s = await stat(path.join(modPath, f))
        totalBefore += s.size
      }

      // Set cap to roughly 60% of current total — should evict oldest entries
      const cap = Math.floor(totalBefore * 0.6)
      await enforceSizeCap(testRoot, cap)

      const filesAfter = await readdir(modPath)
      const jsonFiles = filesAfter.filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'))

      // Fewer module files than before
      expect(jsonFiles.length).toBeLessThan(filesBefore.length)

      // The oldest entries (mod-0, possibly mod-1) should be gone
      // The newest entries should survive
      const survivingIds = jsonFiles.map((f) => f.replace('.json', '')).sort()
      expect(survivingIds).toContain('mod-4')
    })

    it('does nothing when total size is under the cap', async () => {
      await initContextLayerStore(testRoot)
      await writeModuleEntry(testRoot, 'small', makeModuleEntry())

      // Very generous cap
      await enforceSizeCap(testRoot, 10 * 1024 * 1024)

      const result = await readModuleEntry(testRoot, 'small')
      expect(result).not.toBeNull()
    })
  })

  describe('ensureGitignore', () => {
    it('creates .gitignore with .context/ entry when file does not exist', async () => {
      await ensureGitignore(testRoot)

      const content = await readFile(path.join(testRoot, '.gitignore'), 'utf-8')
      expect(content).toContain('.context/')
    })

    it('appends .context/ to existing .gitignore', async () => {
      await writeFile(path.join(testRoot, '.gitignore'), 'node_modules/\ndist/\n', 'utf-8')
      await ensureGitignore(testRoot)

      const content = await readFile(path.join(testRoot, '.gitignore'), 'utf-8')
      expect(content).toContain('node_modules/')
      expect(content).toContain('.context/')
    })

    it('is idempotent — does not add .context/ twice', async () => {
      await ensureGitignore(testRoot)
      await ensureGitignore(testRoot)

      const content = await readFile(path.join(testRoot, '.gitignore'), 'utf-8')
      const matches = content.match(/\.context\//g)
      expect(matches).toHaveLength(1)
    })

    it('recognizes .context (without trailing slash) as already present', async () => {
      await writeFile(path.join(testRoot, '.gitignore'), '.context\n', 'utf-8')
      await ensureGitignore(testRoot)

      const content = await readFile(path.join(testRoot, '.gitignore'), 'utf-8')
      // Should not add a duplicate entry
      const contextLines = content.split(/\r?\n/).filter((line) => line.trim().startsWith('.context'))
      expect(contextLines).toHaveLength(1)
    })
  })

  describe('write mutex', () => {
    it('serializes concurrent writes to the same file without corruption', async () => {
      await initContextLayerStore(testRoot)

      // Fire 10 concurrent writes to the same repo map
      const promises: Promise<void>[] = []
      for (let i = 0; i < 10; i++) {
        const repoMap = makeRepoMap({ projectName: `project-${i}` })
        promises.push(writeRepoMap(testRoot, repoMap))
      }
      await Promise.all(promises)

      // File should be valid JSON (one of the 10 writes won)
      const result = await readRepoMap(testRoot)
      expect(result).not.toBeNull()
      expect(result!.projectName).toMatch(/^project-\d$/)
      expect(result!.version).toBe(1)
    })
  })

  describe('module ID sanitization', () => {
    it('strips special characters', () => {
      expect(sanitizeModuleId('hello world!')).toBe('hello-world')
    })

    it('converts to lowercase', () => {
      expect(sanitizeModuleId('FileTree')).toBe('filetree')
    })

    it('collapses consecutive dashes', () => {
      expect(sanitizeModuleId('a---b')).toBe('a-b')
    })

    it('trims leading and trailing dashes', () => {
      expect(sanitizeModuleId('--hello--')).toBe('hello')
    })

    it('truncates to 60 characters', () => {
      const long = 'a'.repeat(100)
      expect(sanitizeModuleId(long).length).toBe(60)
    })

    it('returns "unnamed" for empty input', () => {
      expect(sanitizeModuleId('')).toBe('unnamed')
    })

    it('returns "unnamed" for input with only special characters', () => {
      expect(sanitizeModuleId('!@#$%')).toBe('unnamed')
    })

    it('preserves valid kebab-case IDs', () => {
      expect(sanitizeModuleId('file-tree')).toBe('file-tree')
    })

    it('uses sanitized ID in module entry file path', () => {
      const filePath = moduleEntryPath(testRoot, 'My Module!')
      expect(filePath).toContain('my-module')
      expect(filePath).toContain('.json')
    })
  })

  describe('manifest read/write', () => {
    it('round-trips a manifest', async () => {
      await initContextLayerStore(testRoot)
      const manifest: ContextLayerManifest = {
        version: 1,
        lastFullRebuild: 1000,
        lastIncrementalUpdate: 2000,
        repoMapHash: 'abc123',
        moduleHashes: { 'file-tree': 'hash1', terminal: 'hash2' },
        totalSizeBytes: 4096,
      }
      await writeManifest(testRoot, manifest)

      const result = await readManifest(testRoot)
      expect(result).toEqual(manifest)
    })

    it('returns null when manifest does not exist', async () => {
      const result = await readManifest(testRoot)
      expect(result).toBeNull()
    })
  })
})
