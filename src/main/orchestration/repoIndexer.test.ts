import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { filePathToUri } from '../lspHelpers'
import { servers } from '../lspState'
import type { LspDiagnostic, LspServerInstance } from '../lspTypes'
import { buildLspDiagnosticsSummary } from './lspDiagnosticsProvider'
import { buildRepoIndexSnapshot, clearRepoIndexCache } from './repoIndexer'

const createdRoots: string[] = []

async function createTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ouroboros-repo-indexer-'))
  createdRoots.push(root)
  return root
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
}

function createServer(root: string, filePath: string, diagnostics: LspDiagnostic[]): LspServerInstance {
  return {
    process: {} as LspServerInstance['process'],
    connection: {} as LspServerInstance['connection'],
    root,
    language: 'typescript',
    status: 'running',
    documentVersions: new Map(),
    diagnosticsCache: new Map([[filePathToUri(filePath), diagnostics]]),
    restartCount: 0,
    lastRestartTime: 0,
  }
}

function registerDeterministicRepoFactsTest(): void {
  it('builds deterministic repo facts with imports and diagnostics summaries', async () => {
    const root = await createTempRoot()
    const entryFile = path.join(root, 'src', 'index.ts')
    const utilFile = path.join(root, 'src', 'util.ts')

    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture' }, null, 2))
    await writeFile(entryFile, "import React from 'react'\nimport { answer } from './util'\nexport const value = answer\n")
    await writeFile(utilFile, 'export const answer = 42\n')
    servers.set('fixture-server', createServer(root, entryFile, [
      { message: 'broken type', severity: 'error', range: { startLine: 0, startChar: 0, endLine: 0, endChar: 1 } },
      { message: 'unused import', severity: 'warning', range: { startLine: 1, startChar: 0, endLine: 1, endChar: 6 } },
    ]))

    const snapshot = await buildRepoIndexSnapshot([root], { now: 123, diagnosticsProvider: buildLspDiagnosticsSummary })
    const rootSnapshot = snapshot.roots[0]
    const indexedEntry = rootSnapshot.files.find((file) => file.path === entryFile)

    expect(snapshot.repoFacts.workspaceRoots).toEqual([root])
    expect(snapshot.repoFacts.roots).toHaveLength(1)
    expect(rootSnapshot.workspaceFact.entryPoints).toContain('src/index.ts')
    expect(rootSnapshot.workspaceFact.languages).toEqual(['typescript', 'json'])
    expect(rootSnapshot.workspaceFact.fileCount).toBe(3)
    expect(rootSnapshot.workspaceFact.directoryCount).toBe(1)
    expect(rootSnapshot.workspaceFact.recentlyEditedFiles).toContain(entryFile)
    expect(indexedEntry?.imports).toEqual(['./util', 'react'])
    expect(indexedEntry?.diagnostics).toEqual({ errors: 1, warnings: 1, infos: 0, hints: 0, total: 2 })
    expect(snapshot.repoFacts.diagnostics).toEqual({
      files: [{
        filePath: entryFile,
        errors: 1,
        warnings: 1,
        infos: 0,
        hints: 0,
        messages: [
          { severity: 'error', line: 1, character: 0, message: 'broken type' },
          { severity: 'warning', line: 2, character: 0, message: 'unused import' },
        ],
      }],
      totalErrors: 1,
      totalWarnings: 1,
      totalInfos: 0,
      totalHints: 0,
      generatedAt: 123,
    })
    expect(snapshot.repoFacts.gitDiff.changedFiles).toEqual([])
    expect(snapshot.repoFacts.recentEdits).toEqual({ files: snapshot.repoFacts.recentEdits.files, generatedAt: 123 })
  })
}

function registerRootCacheReuseTest(): void {
  it('reuses cached root snapshots when the caller supplies matching state keys', async () => {
    const root = await createTempRoot()
    const entryFile = path.join(root, 'src', 'index.ts')

    await writeFile(entryFile, 'export const one = 1\n')
    const first = await buildRepoIndexSnapshot([root], { now: 100 })
    const second = await buildRepoIndexSnapshot([root], { now: 200, rootStateKeys: { [root]: first.roots[0].stateKey } })

    expect(second.cache.roots).toEqual([{ rootPath: root, key: first.roots[0].stateKey, hit: true }])
    expect(second.roots[0]).toBe(first.roots[0])

    await writeFile(entryFile, 'export const one = 2\n')
    const third = await buildRepoIndexSnapshot([root], { now: 300 })

    expect(third.cache.roots[0].hit).toBe(false)
    expect(third.roots[0].stateKey).not.toBe(first.roots[0].stateKey)
  })
}

function registerWorkspaceCacheReuseTest(): void {
  it('reuses cached workspace snapshots when the caller supplies the matching workspace state key', async () => {
    const root = await createTempRoot()
    const entryFile = path.join(root, 'src', 'index.ts')

    await writeFile(entryFile, 'export const one = 1\n')
    const first = await buildRepoIndexSnapshot([root], { now: 400 })
    const second = await buildRepoIndexSnapshot([root], { now: 500, workspaceStateKey: first.cache.key })

    expect(second.cache.hit).toBe(true)
    expect(second.cache.key).toBe(first.cache.key)
    expect(second.cache.roots).toEqual([{ rootPath: root, key: first.roots[0].stateKey, hit: true }])
    expect(second.repoFacts).toEqual(first.repoFacts)
    expect(second.roots[0]).toBe(first.roots[0])
  })
}

afterEach(async () => {
  clearRepoIndexCache()
  servers.clear()
  await Promise.all(createdRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('repoIndexer', () => {
  registerDeterministicRepoFactsTest()
  registerRootCacheReuseTest()
  registerWorkspaceCacheReuseTest()
})
