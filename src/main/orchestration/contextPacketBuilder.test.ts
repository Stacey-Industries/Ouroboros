import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./contextSelectionSupport', async () => {
  const actual = await vi.importActual<typeof import('./contextSelectionSupport')>('./contextSelectionSupport')
  const fsModule = await import('fs/promises')

  return {
    ...actual,
    loadContextFileSnapshot: async (
      filePath: string,
      cache?: Map<string, { filePath: string; content: string | null; unsaved: boolean }>,
    ) => {
      const key = actual.toPathKey(filePath)
      const cached = cache?.get(key)
      if (cached) {
        return cached
      }

      let content: string | null = null
      try {
        content = await fsModule.readFile(filePath, 'utf-8')
      } catch {
        content = null
      }

      const snapshot = { filePath, content, unsaved: false }
      cache?.set(key, snapshot)
      return snapshot
    },
  }
})

import { buildContextPacket } from './contextPacketBuilder'
import type { LiveIdeState, RepoFacts } from './types'

const createdRoots: string[] = []

async function createTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ouroboros-context-packet-'))
  createdRoots.push(root)
  return root
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
}

function createRepoFacts(root: string): RepoFacts {
  return {
    workspaceRoots: [root],
    roots: [{ rootPath: root, languages: ['typescript'], entryPoints: [], recentlyEditedFiles: [], indexedAt: 1 }],
    gitDiff: { changedFiles: [], totalAdditions: 0, totalDeletions: 0, changedFileCount: 0, generatedAt: 1 },
    diagnostics: { files: [], totalErrors: 0, totalWarnings: 0, totalInfos: 0, totalHints: 0, generatedAt: 1 },
    recentEdits: { files: [], generatedAt: 1 },
  }
}

function createLiveIdeState(): LiveIdeState {
  return {
    selectedFiles: [],
    openFiles: [],
    dirtyFiles: [],
    dirtyBuffers: [],
    collectedAt: 1,
  }
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('contextPacketBuilder', () => {
  it('omits lower-ranked files when the byte budget is exhausted', async () => {
    const root = await createTempRoot()
    const alphaFile = path.join(root, 'src', 'alpha.ts')
    const betaFile = path.join(root, 'src', 'beta.ts')

    await writeFile(alphaFile, 'export const alpha = 1\n'.repeat(4))
    await writeFile(betaFile, 'export const beta = 2\n'.repeat(4))

    const firstFileBytes = Buffer.byteLength(await fs.readFile(alphaFile, 'utf-8'), 'utf-8')

    const result = await buildContextPacket({
      request: {
        workspaceRoots: [root],
        goal: 'include both files',
        mode: 'edit',
        provider: 'codex',
        verificationProfile: 'fast',
        budget: {
          maxFiles: 2,
          maxBytes: firstFileBytes + 5,
          maxTokens: 10_000,
        },
        contextSelection: {
          includedFiles: ['src/alpha.ts', 'src/beta.ts'],
        },
      },
      repoFacts: createRepoFacts(root),
      liveIdeState: createLiveIdeState(),
    })

    expect(result.packet.files).toHaveLength(1)
    expect(result.packet.files[0]?.filePath).toBe(alphaFile)
    expect(result.packet.omittedCandidates).toContainEqual({
      filePath: betaFile,
      reason: 'All snippets were omitted by packet budgeting rules',
    })
    expect(result.packet.budget.estimatedBytes).toBeGreaterThan(0)
    expect(result.packet.budget.estimatedBytes).toBeLessThanOrEqual(firstFileBytes + 5)
    expect(result.packet.budget.droppedContentNotes.some((note) => note.includes('beta.ts'))).toBe(true)
  })
})
