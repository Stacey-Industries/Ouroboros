/**
 * spawnTokenBudget.integration.test.ts — Wave 48 token-budget savings integration test.
 *
 * Proves that: (1) packet mode auto-detection produces smaller packets for casual goals,
 * (2) internalMcp scope decision matches goal shape, and (3) workspace state dedupe
 * suppresses unchanged blocks across turns.
 *
 * This is an integration test: real builders/classifiers, mocked config, no subprocess.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock config before importing modules that depend on it
vi.mock('../../config', () => ({
  getConfigValue: vi.fn(),
}));

// Mock contextPacketBuilderSupport (used by claudeCodeContextBuilder)
vi.mock('../contextPacketBuilderSupport', () => ({
  getModelBudgets: () => ({ maxFiles: 20, maxBytes: 72000, maxTokens: 18000 }),
}));

import { getConfigValue } from '../../config';
import {
  buildXmlContextBlock,
  buildProjectStructureSection,
  buildRelevantCodeSection,
} from './claudeCodeContextBuilder';
import { classifyGoal } from './goalClassifier';
import { resolveInternalMcpScope } from '../../internalMcp/internalMcpScope';
import {
  shouldSendWorkspaceState,
  _resetWorkspaceStateDedupe,
} from './workspaceStateDedupe';
import type { ProviderLaunchContext } from './providerAdapter';

const mockGetConfig = vi.mocked(getConfigValue);

function mockConfigValue(map: Record<string, unknown>) {
  mockGetConfig.mockImplementation(
    ((key: string) => (key in map ? map[key as keyof typeof map] : undefined)) as never,
  );
}

/**
 * Minimal ContextPacket builder for testing.
 * Allows control over file count, workspace state content, and project structure.
 */
function buildTestPacket(options: {
  fileCount?: number;
  workspaceStateContent?: string;
  includeProjectStructure?: boolean;
  includeSystemInstructions?: boolean;
} = {}) {
  const {
    fileCount = 8,
    workspaceStateContent = 'branch="main" changed_files="3" errors="0" warnings="2"',
    includeProjectStructure = true,
    includeSystemInstructions = true,
  } = options;

  const files = Array.from({ length: fileCount }, (_, i) => ({
    filePath: `/src/file${i}.ts`,
    score: 90 - i,
    confidence: 'high' as const,
    reasons: [{ kind: 'git_diff' as const, weight: 56, detail: `git_diff_${i}` }],
    snippets: [],
    truncationNotes: [],
    pagerank_score: null,
  }));

  const repoMap = includeProjectStructure
    ? {
        projectName: 'TestProject',
        languages: ['TypeScript'],
        frameworks: [],
        moduleCount: 5,
      }
    : undefined;

  const systemInstructions = includeSystemInstructions ? 'Test system instructions.' : undefined;

  return {
    version: 1 as const,
    id: 'test-packet',
    createdAt: Date.now(),
    task: {
      taskId: 't1',
      goal: 'test',
      mode: 'chat' as const,
      provider: 'claude-code' as const,
      verificationProfile: 'default' as const,
    },
    repoFacts: {
      workspaceRoots: [],
      roots: [],
      gitDiff: {
        changedFiles: [],
        totalAdditions: 0,
        totalDeletions: 0,
        changedFileCount: 3,
        currentBranch: 'main',
        generatedAt: Date.now(),
      },
      diagnostics: {
        files: [],
        totalErrors: 0,
        totalWarnings: 2,
        totalInfos: 0,
        totalHints: 0,
        generatedAt: Date.now(),
      },
      recentEdits: { files: [], generatedAt: Date.now() },
      recentCommits: [],
    },
    liveIdeState: {
      selectedFiles: [],
      openFiles: [],
      dirtyFiles: [],
      dirtyBuffers: [],
      collectedAt: 0,
      terminalSnapshots: [],
    },
    files,
    omittedCandidates: [],
    budget: { estimatedBytes: 0, estimatedTokens: 0, droppedContentNotes: [] },
    repoMap,
    systemInstructions,
  };
}

function makeContext(
  packet: ReturnType<typeof buildTestPacket>,
  goal: string,
): ProviderLaunchContext {
  return {
    taskId: 't1',
    request: { goal, conversationHistory: [] },
    contextPacket: packet as never,
  } as unknown as ProviderLaunchContext;
}

describe('Wave 48 — Token Budget Savings Integration', () => {
  beforeEach(() => {
    mockGetConfig.mockClear();
    _resetWorkspaceStateDedupe();
  });

  describe('packet mode — casual vs code goals', () => {
    it('classifyGoal correctly identifies casual goals', () => {
      expect(classifyGoal('Hi')).toBe('casual');
      expect(classifyGoal('hello')).toBe('casual');
      expect(classifyGoal('thanks')).toBe('casual');
      expect(classifyGoal('')).toBe('casual');
    });

    it('classifyGoal correctly identifies code goals', () => {
      expect(classifyGoal('fix the bug in src/main/foo.ts where the parser breaks')).toBe('code');
      expect(classifyGoal('debug TypeError on line 42')).toBe('code');
      expect(classifyGoal('run npm test')).toBe('code');
    });

    it('with packetMode:auto, casual goal produces smaller context than code goal', () => {
      mockConfigValue({
        context: {
          packetMode: 'auto',
          provenanceWeights: true,
          pagerank: true,
          pagerankSeeds: { pinned: 0.5, symbol: 0.3, user_edit: 0.2 },
        },
      });

      // Casual goal packet
      const casualPacket = buildTestPacket({ fileCount: 12, includeProjectStructure: true });
      const casualContext = makeContext(casualPacket, 'Hi');
      const casualBlock = buildXmlContextBlock(casualContext, 'sonnet');

      // Code goal packet
      const codePacket = buildTestPacket({ fileCount: 12, includeProjectStructure: true });
      const codeContext = makeContext(codePacket, 'fix the bug in foo.ts');
      const codeBlock = buildXmlContextBlock(codeContext, 'sonnet');

      // Casual should be smaller due to lean mode (fewer files, no project_structure)
      expect(casualBlock.length).toBeLessThan(codeBlock.length);
    });

    it('casual goal in auto mode omits project_structure', () => {
      mockConfigValue({
        context: {
          packetMode: 'auto',
          provenanceWeights: true,
          pagerank: true,
          pagerankSeeds: { pinned: 0.5, symbol: 0.3, user_edit: 0.2 },
        },
      });

      const packet = buildTestPacket({ fileCount: 8, includeProjectStructure: true });
      const context = makeContext(packet, 'Hi');
      const block = buildXmlContextBlock(context, 'sonnet');

      expect(block).not.toContain('<project_structure');
    });

    it('casual goal in auto mode caps relevant_code to 6 files', () => {
      mockConfigValue({
        context: {
          packetMode: 'auto',
          provenanceWeights: true,
          pagerank: true,
          pagerankSeeds: { pinned: 0.5, symbol: 0.3, user_edit: 0.2 },
        },
      });

      const packet = buildTestPacket({ fileCount: 12 });
      const context = makeContext(packet, 'Hi');
      const block = buildXmlContextBlock(context, 'sonnet');

      const fileMatches = block.match(/<file /g) ?? [];
      expect(fileMatches.length).toBeLessThanOrEqual(6);
    });

    it('code goal in auto mode includes project_structure', () => {
      mockConfigValue({
        context: {
          packetMode: 'auto',
          provenanceWeights: true,
          pagerank: true,
          pagerankSeeds: { pinned: 0.5, symbol: 0.3, user_edit: 0.2 },
        },
      });

      const packet = buildTestPacket({ fileCount: 8, includeProjectStructure: true });
      const context = makeContext(packet, 'fix the bug in foo.ts');
      const block = buildXmlContextBlock(context, 'sonnet');

      expect(block).toContain('<project_structure');
    });

    it('code goal in auto mode includes more files', () => {
      mockConfigValue({
        context: {
          packetMode: 'auto',
          provenanceWeights: true,
          pagerank: true,
          pagerankSeeds: { pinned: 0.5, symbol: 0.3, user_edit: 0.2 },
        },
      });

      const packet = buildTestPacket({ fileCount: 12 });
      const context = makeContext(packet, 'fix the bug in foo.ts');
      const block = buildXmlContextBlock(context, 'sonnet');

      const fileMatches = block.match(/<file /g) ?? [];
      expect(fileMatches.length).toBeGreaterThan(6);
    });

    it('packetMode:full suppresses auto-detection for casual goals', () => {
      mockConfigValue({
        context: {
          packetMode: 'full',
          provenanceWeights: true,
          pagerank: true,
          pagerankSeeds: { pinned: 0.5, symbol: 0.3, user_edit: 0.2 },
        },
      });

      const packet = buildTestPacket({ fileCount: 8, includeProjectStructure: true });
      const context = makeContext(packet, 'Hi');
      const block = buildXmlContextBlock(context, 'sonnet');

      // Full mode should include project_structure even for casual goals
      expect(block).toContain('<project_structure');
    });

    it('packetMode:lean forces lean mode regardless of goal shape', () => {
      mockConfigValue({
        context: {
          packetMode: 'lean',
          provenanceWeights: true,
          pagerank: true,
          pagerankSeeds: { pinned: 0.5, symbol: 0.3, user_edit: 0.2 },
        },
      });

      const packet = buildTestPacket({ fileCount: 12, includeProjectStructure: true });
      const context = makeContext(packet, 'fix the bug in foo.ts');
      const block = buildXmlContextBlock(context, 'sonnet');

      // Lean mode should omit project_structure and cap files even for code goals
      expect(block).not.toContain('<project_structure');
      const fileMatches = block.match(/<file /g) ?? [];
      expect(fileMatches.length).toBeLessThanOrEqual(6);
    });
  });

  describe('internalMcp scope decision', () => {
    it('always scope injects for casual goals', () => {
      mockConfigValue({ internalMcpEnabled: true, internalMcpScope: 'always' });
      const result = resolveInternalMcpScope({ goalShape: 'casual' });
      expect(result.shouldInjectOuroboros).toBe(true);
    });

    it('always scope injects for code goals', () => {
      mockConfigValue({ internalMcpEnabled: true, internalMcpScope: 'always' });
      const result = resolveInternalMcpScope({ goalShape: 'code' });
      expect(result.shouldInjectOuroboros).toBe(true);
    });

    it('never scope blocks casual goals', () => {
      mockConfigValue({ internalMcpEnabled: true, internalMcpScope: 'never' });
      const result = resolveInternalMcpScope({ goalShape: 'casual' });
      expect(result.shouldInjectOuroboros).toBe(false);
    });

    it('never scope blocks code goals', () => {
      mockConfigValue({ internalMcpEnabled: true, internalMcpScope: 'never' });
      const result = resolveInternalMcpScope({ goalShape: 'code' });
      expect(result.shouldInjectOuroboros).toBe(false);
    });

    it('task-gated scope blocks casual goals', () => {
      mockConfigValue({ internalMcpEnabled: true, internalMcpScope: 'task-gated' });
      const result = resolveInternalMcpScope({ goalShape: 'casual' });
      expect(result.shouldInjectOuroboros).toBe(false);
      expect(result.reason).toContain('casual');
    });

    it('task-gated scope injects code goals', () => {
      mockConfigValue({ internalMcpEnabled: true, internalMcpScope: 'task-gated' });
      const result = resolveInternalMcpScope({ goalShape: 'code' });
      expect(result.shouldInjectOuroboros).toBe(true);
    });

    it('task-gated scope injects unknown goals (safe default)', () => {
      mockConfigValue({ internalMcpEnabled: true, internalMcpScope: 'task-gated' });
      const result = resolveInternalMcpScope({ goalShape: 'unknown' });
      expect(result.shouldInjectOuroboros).toBe(true);
    });

    it('task-gated is the default scope', () => {
      mockConfigValue({ internalMcpEnabled: true });
      // Unset scope should default to task-gated
      expect(resolveInternalMcpScope({ goalShape: 'casual' }).shouldInjectOuroboros).toBe(false);
      expect(resolveInternalMcpScope({ goalShape: 'code' }).shouldInjectOuroboros).toBe(true);
    });

    it('internalMcpEnabled:false overrides scope=always', () => {
      mockConfigValue({ internalMcpEnabled: false, internalMcpScope: 'always' });
      const result = resolveInternalMcpScope({ goalShape: 'code' });
      expect(result.shouldInjectOuroboros).toBe(false);
    });
  });

  describe('workspace state dedupe across turns', () => {
    it('shouldSendWorkspaceState returns true on first send', () => {
      const threadId = 'thread-1';
      const block = '<workspace_state branch="main" changed_files="3"></workspace_state>';

      const shouldSend = shouldSendWorkspaceState(threadId, block);
      expect(shouldSend).toBe(true);
    });

    it('shouldSendWorkspaceState returns false when block is unchanged on second turn', () => {
      const threadId = 'thread-1';
      const block = '<workspace_state branch="main" changed_files="3"></workspace_state>';

      // First turn: should send
      const firstSend = shouldSendWorkspaceState(threadId, block);
      expect(firstSend).toBe(true);

      // Second turn, same block: should suppress
      const secondSend = shouldSendWorkspaceState(threadId, block);
      expect(secondSend).toBe(false);
    });

    it('shouldSendWorkspaceState returns true when block changes', () => {
      const threadId = 'thread-1';
      const block1 = '<workspace_state branch="main" changed_files="3"></workspace_state>';
      const block2 = '<workspace_state branch="main" changed_files="4"></workspace_state>';

      // First turn
      const firstSend = shouldSendWorkspaceState(threadId, block1);
      expect(firstSend).toBe(true);

      // Second turn, different block: should send
      const secondSend = shouldSendWorkspaceState(threadId, block2);
      expect(secondSend).toBe(true);
    });

    it('shouldSendWorkspaceState returns true again after change', () => {
      const threadId = 'thread-1';
      const blockA = '<workspace_state branch="main" changed_files="3"></workspace_state>';
      const blockB = '<workspace_state branch="main" changed_files="4"></workspace_state>';

      shouldSendWorkspaceState(threadId, blockA); // first: true
      shouldSendWorkspaceState(threadId, blockB); // second: true (different)

      // Back to blockA: should send again
      const thirdSend = shouldSendWorkspaceState(threadId, blockA);
      expect(thirdSend).toBe(true);
    });

    it('shouldSendWorkspaceState treats empty threadId as no caching', () => {
      const block = '<workspace_state></workspace_state>';

      // Empty threadId should always return true
      expect(shouldSendWorkspaceState('', block)).toBe(true);
      expect(shouldSendWorkspaceState('', block)).toBe(true);
    });

    it('shouldSendWorkspaceState treats undefined threadId as no caching', () => {
      const block = '<workspace_state></workspace_state>';

      // Undefined threadId should always return true
      expect(shouldSendWorkspaceState(undefined, block)).toBe(true);
      expect(shouldSendWorkspaceState(undefined, block)).toBe(true);
    });

    it('shouldSendWorkspaceState tracks independent threads independently', () => {
      const block1 = '<workspace_state branch="main" changed_files="3"></workspace_state>';
      const block2 = '<workspace_state branch="main" changed_files="4"></workspace_state>';

      // Thread 1: send block1
      expect(shouldSendWorkspaceState('thread-1', block1)).toBe(true);
      expect(shouldSendWorkspaceState('thread-1', block1)).toBe(false);

      // Thread 2: send block2 (not cached)
      expect(shouldSendWorkspaceState('thread-2', block2)).toBe(true);
      expect(shouldSendWorkspaceState('thread-2', block2)).toBe(false);

      // Thread 1 again: should still be cached from block1
      expect(shouldSendWorkspaceState('thread-1', block1)).toBe(false);

      // Thread 2 again: should still be cached from block2
      expect(shouldSendWorkspaceState('thread-2', block2)).toBe(false);
    });

    it('workspace state dedupe works across multiple unchanged turns', () => {
      const threadId = 'thread-resume';
      const block = '<workspace_state branch="main" changed_files="0"></workspace_state>';

      // Simulate 5 consecutive resume turns with no workspace changes
      expect(shouldSendWorkspaceState(threadId, block)).toBe(true); // turn 1: send
      expect(shouldSendWorkspaceState(threadId, block)).toBe(false); // turn 2: suppress
      expect(shouldSendWorkspaceState(threadId, block)).toBe(false); // turn 3: suppress
      expect(shouldSendWorkspaceState(threadId, block)).toBe(false); // turn 4: suppress
      expect(shouldSendWorkspaceState(threadId, block)).toBe(false); // turn 5: suppress

      // Token savings = 4 turns × ~300 tokens per workspace_state block = ~1200 tokens saved
    });
  });

  describe('end-to-end Wave 48 behavior', () => {
    it('casual goal with task-gated scope produces optimal token savings', () => {
      mockConfigValue({
        context: {
          packetMode: 'auto',
          provenanceWeights: true,
          pagerank: true,
          pagerankSeeds: { pinned: 0.5, symbol: 0.3, user_edit: 0.2 },
        },
        internalMcpEnabled: true,
        internalMcpScope: 'task-gated',
      });

      const goal = 'Hi';
      const goalShape = classifyGoal(goal);

      // Packet mode should go lean
      const packet = buildTestPacket({ fileCount: 12 });
      const context = makeContext(packet, goal);
      const block = buildXmlContextBlock(context, 'sonnet');

      expect(block).not.toContain('<project_structure');
      const fileMatches = block.match(/<file /g) ?? [];
      expect(fileMatches.length).toBeLessThanOrEqual(6);

      // MCP scope should NOT inject
      const mcpDecision = resolveInternalMcpScope({ goalShape });
      expect(mcpDecision.shouldInjectOuroboros).toBe(false);
    });

    it('code goal with task-gated scope provides full context', () => {
      mockConfigValue({
        context: {
          packetMode: 'auto',
          provenanceWeights: true,
          pagerank: true,
          pagerankSeeds: { pinned: 0.5, symbol: 0.3, user_edit: 0.2 },
        },
        internalMcpEnabled: true,
        internalMcpScope: 'task-gated',
      });

      const goal = 'fix the bug in src/parser.ts where input validation fails';
      const goalShape = classifyGoal(goal);

      // Packet mode should stay full
      const packet = buildTestPacket({ fileCount: 12 });
      const context = makeContext(packet, goal);
      const block = buildXmlContextBlock(context, 'sonnet');

      expect(block).toContain('<project_structure');
      const fileMatches = block.match(/<file /g) ?? [];
      expect(fileMatches.length).toBeGreaterThan(6);

      // MCP scope SHOULD inject
      const mcpDecision = resolveInternalMcpScope({ goalShape });
      expect(mcpDecision.shouldInjectOuroboros).toBe(true);
    });

    it('multi-turn resume with workspace dedupe saves tokens', () => {
      mockConfigValue({
        context: {
          packetMode: 'auto',
          provenanceWeights: true,
          pagerank: true,
          pagerankSeeds: { pinned: 0.5, symbol: 0.3, user_edit: 0.2 },
        },
      });

      const threadId = 'session-1';
      const unchangedBlock =
        '<workspace_state branch="main" changed_files="2" errors="1" warnings="3"></workspace_state>';

      // Turn 1: initial launch, send workspace_state
      expect(shouldSendWorkspaceState(threadId, unchangedBlock)).toBe(true);

      // Turns 2-5: resume turns, no workspace changes
      for (let i = 2; i <= 5; i++) {
        const shouldSend = shouldSendWorkspaceState(threadId, unchangedBlock);
        expect(shouldSend).toBe(false);
      }

      // Turn 6: workspace changes (new file changed)
      const changedBlock =
        '<workspace_state branch="main" changed_files="3" errors="1" warnings="3"></workspace_state>';
      expect(shouldSendWorkspaceState(threadId, changedBlock)).toBe(true);

      // Turns 7-8: no changes again
      for (let i = 7; i <= 8; i++) {
        const shouldSend = shouldSendWorkspaceState(threadId, changedBlock);
        expect(shouldSend).toBe(false);
      }
    });
  });
});
