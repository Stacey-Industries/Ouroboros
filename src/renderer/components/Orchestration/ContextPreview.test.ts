import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { TaskResult, TaskSessionRecord } from '../../types/electron';
import { ContextPreview } from './ContextPreview';

function createSession(): TaskSessionRecord {
  return {
    version: 1,
    id: 'session-1',
    taskId: 'task-1',
    workspaceRoots: ['C:\\repo'],
    createdAt: 1,
    updatedAt: 2,
    request: {
      workspaceRoots: ['C:\\repo'],
      goal: 'Inspect orchestration context reasons',
      mode: 'edit',
      provider: 'claude-code',
      verificationProfile: 'default',
      metadata: { origin: 'panel', label: 'Context preview' },
    },
    status: 'idle',
    attempts: [],
    unresolvedIssues: [],
    contextPacket: {
      version: 1,
      id: 'packet-1',
      createdAt: 3,
      task: {
        taskId: 'task-1',
        goal: 'Inspect orchestration context reasons',
        mode: 'edit',
        provider: 'claude-code',
        verificationProfile: 'default',
      },
      repoFacts: {
        workspaceRoots: ['C:\\repo'],
        roots: [],
        gitDiff: {
          changedFiles: [
            {
              filePath: 'src/App.tsx',
              additions: 10,
              deletions: 2,
              status: 'modified',
            },
          ],
          totalAdditions: 10,
          totalDeletions: 2,
          changedFileCount: 1,
          generatedAt: 3,
        },
        diagnostics: {
          files: [],
          totalErrors: 0,
          totalWarnings: 0,
          totalInfos: 0,
          totalHints: 0,
          generatedAt: 3,
        },
        recentEdits: {
          files: ['src/App.tsx'],
          generatedAt: 3,
        },
      },
      liveIdeState: {
        selectedFiles: [],
        openFiles: ['src/App.tsx'],
        dirtyFiles: [],
        dirtyBuffers: [],
        collectedAt: 3,
      },
      files: [
        {
          filePath: 'src/App.tsx',
          score: 98.2,
          pagerank_score: 0.85,
          confidence: 'high',
          reasons: [
            {
              kind: 'git_diff',
              weight: 0.9,
              detail: 'Modified in the active diff for this task.',
            },
            {
              kind: 'open_file',
              weight: 0.6,
              detail: 'Currently open in the editor.',
            },
          ],
          snippets: [
            {
              label: 'render shell',
              source: 'selection',
              range: { startLine: 10, endLine: 24 },
              content: 'return <main>Preview</main>;',
            },
          ],
          truncationNotes: [
            {
              reason: 'budget',
              detail: 'Only the most relevant snippet was retained.',
            },
          ],
        },
      ],
      omittedCandidates: [
        {
          filePath: 'src/legacy.ts',
          reason: 'Excluded manually from the context selection controls.',
        },
      ],
      budget: {
        estimatedBytes: 1200,
        estimatedTokens: 300,
        byteLimit: 5000,
        tokenLimit: 1200,
        droppedContentNotes: [],
      },
    },
  };
}

function createResult(): TaskResult {
  return {
    taskId: 'task-1',
    sessionId: 'session-1',
    status: 'needs_review',
    unresolvedIssues: ['Confirm context coverage for App.tsx'],
    message: 'Review the proposed edits.',
    diffSummary: {
      files: [
        {
          filePath: 'src/App.tsx',
          additions: 8,
          deletions: 1,
          summary: 'Adds the orchestration overview card.',
          risk: 'medium',
        },
      ],
      totalFiles: 1,
      totalAdditions: 8,
      totalDeletions: 1,
      summary: 'One UI file changed.',
    },
  };
}

describe('ContextPreview', () => {
  it('renders ranked file reasons, snippets, omitted candidates, and diff summaries', () => {
    const markup = renderToStaticMarkup(ContextPreview({
      session: createSession(),
      latestResult: createResult(),
    }));

    expect(markup).toContain('Why it was selected');
    expect(markup).toContain('git_diff');
    expect(markup).toContain('Modified in the active diff for this task.');
    expect(markup).toContain('Selected snippets');
    expect(markup).toContain('render shell');
    expect(markup).toContain('Omitted files');
    expect(markup).toContain('Excluded manually from the context selection controls.');
    expect(markup).toContain('Proposed file changes');
    expect(markup).toContain('Adds the orchestration overview card.');
  });
});
