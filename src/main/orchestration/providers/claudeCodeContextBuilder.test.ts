/**
 * claudeCodeContextBuilder.test.ts — Unit tests for lean vs full packet mode.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock config module before importing the builder
vi.mock('../../config', () => ({
  getConfigValue: vi.fn(),
}))

// Mock contextPacketBuilderSupport
vi.mock('../contextPacketBuilderSupport', () => ({
  getModelBudgets: () => ({ maxFiles: 20, maxBytes: 72000, maxTokens: 18000 }),
}))

import { getConfigValue } from '../../config'
import {
  buildProjectStructureSection,
  buildRelevantCodeSection,
  buildXmlContextBlock,
} from './claudeCodeContextBuilder'
import type { ProviderLaunchContext } from './providerAdapter'

const mockGetConfigValue = vi.mocked(getConfigValue)

function makePacket(fileCount: number) {
  const files = Array.from({ length: fileCount }, (_, i) => ({
    filePath: `/src/file${i}.ts`,
    score: 90 - i,
    confidence: 'high' as const,
    reasons: [{ kind: 'git_diff' as const, weight: 56, detail: `reason${i}` }],
    snippets: [],
    truncationNotes: [],
    pagerank_score: null,
  }))
  return {
    version: 1 as const,
    id: 'test-packet',
    createdAt: Date.now(),
    task: { taskId: 't1', goal: 'test', mode: 'chat' as const, provider: 'claude-code' as const, verificationProfile: 'default' as const },
    repoFacts: {
      gitDiff: { changedFileCount: 0 },
      diagnostics: { totalErrors: 0, totalWarnings: 0, files: [] },
      recentCommits: [],
      recentEdits: { files: [] },
    },
    liveIdeState: { selectedFiles: [], openFiles: [], dirtyFiles: [], dirtyBuffers: [], collectedAt: 0 },
    files,
    omittedCandidates: [],
    budget: { estimatedBytes: 0, estimatedTokens: 0, droppedContentNotes: [] },
    repoMap: { projectName: 'TestProject', languages: ['TypeScript'], frameworks: [], moduleCount: 5 },
    systemInstructions: 'follow rules',
  }
}

function makeContext(packet: ReturnType<typeof makePacket>): ProviderLaunchContext {
  return {
    taskId: 't1',
    request: { goal: 'test goal', conversationHistory: [] },
    contextPacket: packet as never,
  } as unknown as ProviderLaunchContext
}

describe('buildRelevantCodeSection', () => {
  it('respects maxFilesOverride when provided', () => {
    const packet = makePacket(10)
    const result = buildRelevantCodeSection(packet as never, 'sonnet', 6)
    const matches = result.match(/<file /g) ?? []
    expect(matches.length).toBe(6)
  })

  it('uses budget maxFiles when no override is given', () => {
    const packet = makePacket(10)
    const result = buildRelevantCodeSection(packet as never, 'sonnet')
    const matches = result.match(/<file /g) ?? []
    expect(matches.length).toBe(10) // all 10 fit within budget maxFiles=20
  })
})

describe('buildProjectStructureSection', () => {
  it('emits project_structure block', () => {
    const packet = makePacket(0)
    const result = buildProjectStructureSection(packet as never)
    expect(result).toContain('<project_structure')
    expect(result).toContain('</project_structure>')
    expect(result).toContain('TestProject')
  })
})

describe('buildXmlContextBlock — full mode', () => {
  beforeEach(() => {
    mockGetConfigValue.mockReturnValue({ packetMode: 'full', provenanceWeights: true, pagerank: true, pagerankSeeds: { pinned: 0.5, symbol: 0.3, user_edit: 0.2 } })
  })

  it('includes project_structure in full mode', () => {
    const packet = makePacket(3)
    const context = makeContext(packet)
    const result = buildXmlContextBlock(context, 'sonnet')
    expect(result).toContain('<project_structure')
  })

  it('includes all files up to budget in full mode', () => {
    const packet = makePacket(10)
    const context = makeContext(packet)
    const result = buildXmlContextBlock(context, 'sonnet')
    const matches = result.match(/<file /g) ?? []
    expect(matches.length).toBe(10)
  })
})

describe('buildXmlContextBlock — lean mode', () => {
  beforeEach(() => {
    mockGetConfigValue.mockReturnValue({ packetMode: 'lean', provenanceWeights: true, pagerank: true, pagerankSeeds: { pinned: 0.5, symbol: 0.3, user_edit: 0.2 } })
  })

  it('omits project_structure in lean mode', () => {
    const packet = makePacket(3)
    const context = makeContext(packet)
    const result = buildXmlContextBlock(context, 'sonnet')
    expect(result).not.toContain('<project_structure')
  })

  it('caps relevant_code to 6 files in lean mode', () => {
    const packet = makePacket(10)
    const context = makeContext(packet)
    const result = buildXmlContextBlock(context, 'sonnet')
    const matches = result.match(/<file /g) ?? []
    expect(matches.length).toBeLessThanOrEqual(6)
  })

  it('preserves workspace_state in lean mode', () => {
    const packet = makePacket(3)
    const context = makeContext(packet)
    const result = buildXmlContextBlock(context, 'sonnet')
    expect(result).toContain('<workspace_state')
  })

  it('preserves current_focus in lean mode', () => {
    const packet = makePacket(3)
    const context = makeContext(packet)
    const result = buildXmlContextBlock(context, 'sonnet')
    expect(result).toContain('<current_focus>')
  })

  it('preserves system_instructions in lean mode', () => {
    const packet = makePacket(3)
    const context = makeContext(packet)
    const result = buildXmlContextBlock(context, 'sonnet')
    expect(result).toContain('<system_instructions>')
    expect(result).toContain('follow rules')
  })

  it('returns empty string when no context packet', () => {
    const context = { ...makeContext(makePacket(0)), contextPacket: undefined } as unknown as ProviderLaunchContext
    expect(buildXmlContextBlock(context, 'sonnet')).toBe('')
  })
})
