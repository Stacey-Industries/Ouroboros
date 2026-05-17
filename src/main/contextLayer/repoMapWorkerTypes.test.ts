/**
 * repoMapWorkerTypes.test.ts — Smoke tests for repoMapWorkerTypes.ts.
 *
 * The types file contains only type definitions and discriminated unions —
 * no runtime logic. These tests assert the structural shape of literal values
 * that conform to the types, catching any breaking rename or field removal.
 */

import { describe, expect, it } from 'vitest';

import type { RepoIndexSnapshot } from '../orchestration/repoIndexer';
import type { RepoFacts } from '../orchestration/types';
import type {
  GenerateRepoMapRequest,
  RepoMapWorkerErrorResponse,
  RepoMapWorkerReadyResponse,
  RepoMapWorkerRequest,
  RepoMapWorkerResponse,
  RepoMapWorkerResultResponse,
} from './repoMapWorkerTypes';

// Minimal valid fixture for tests — only fields required at runtime
const minimalRepoFacts = {
  workspaceRoots: [],
  roots: [],
  gitDiff: { changedFiles: [], totalAdditions: 0, totalDeletions: 0, changedFileCount: 0, generatedAt: 0 },
  diagnostics: { items: [], generatedAt: 0 },
  recentEdits: { files: [], generatedAt: 0 },
} as unknown as RepoFacts;

const minimalRepoIndex = { roots: [] } as unknown as RepoIndexSnapshot;

describe('repoMapWorkerTypes — structural shape', () => {
  it('GenerateRepoMapRequest has type=generateRepoMap, id, repoFacts, repoIndex, workspaceRoot', () => {
    const req: GenerateRepoMapRequest = {
      type: 'generateRepoMap',
      id: 'req-1',
      repoFacts: minimalRepoFacts,
      repoIndex: minimalRepoIndex,
      workspaceRoot: '/tmp/repo',
    };
    expect(req.type).toBe('generateRepoMap');
    expect(req.id).toBe('req-1');
    expect(req.workspaceRoot).toBe('/tmp/repo');
  });

  it('GenerateRepoMapRequest accepts optional model field', () => {
    const req: GenerateRepoMapRequest = {
      type: 'generateRepoMap',
      id: 'req-2',
      repoFacts: minimalRepoFacts,
      repoIndex: minimalRepoIndex,
      workspaceRoot: '/tmp/repo',
      model: 'claude-sonnet-4-6',
    };
    expect(req.model).toBe('claude-sonnet-4-6');
  });

  it('RepoMapWorkerRequest union is satisfied by GenerateRepoMapRequest', () => {
    const req: RepoMapWorkerRequest = {
      type: 'generateRepoMap',
      id: 'req-3',
      repoFacts: minimalRepoFacts,
      repoIndex: minimalRepoIndex,
      workspaceRoot: '/tmp/repo',
    };
    expect(req.type).toBe('generateRepoMap');
  });

  it('RepoMapWorkerReadyResponse has type=ready', () => {
    const resp: RepoMapWorkerReadyResponse = { type: 'ready' };
    expect(resp.type).toBe('ready');
  });

  it('RepoMapWorkerResultResponse has type=repoMapReady, id, repoMap, durationMs', () => {
    const resp: RepoMapWorkerResultResponse = {
      type: 'repoMapReady',
      id: 'req-1',
      repoMap: {
        version: 1,
        generatedAt: 1000,
        workspaceRoot: '/tmp/repo',
        projectName: 'repo',
        languages: [],
        frameworks: [],
        moduleCount: 0,
        totalFileCount: 0,
        modules: [],
        crossModuleDependencies: [],
      },
      durationMs: 42,
    };
    expect(resp.type).toBe('repoMapReady');
    expect(resp.id).toBe('req-1');
    expect(resp.durationMs).toBe(42);
  });

  it('RepoMapWorkerErrorResponse has type=error, id, message', () => {
    const resp: RepoMapWorkerErrorResponse = {
      type: 'error',
      id: 'req-1',
      message: 'something went wrong',
    };
    expect(resp.type).toBe('error');
    expect(resp.id).toBe('req-1');
    expect(resp.message).toBe('something went wrong');
  });

  it('RepoMapWorkerResponse union discriminates on type field', () => {
    const responses: RepoMapWorkerResponse[] = [
      { type: 'ready' },
      {
        type: 'repoMapReady',
        id: 'r1',
        repoMap: {
          version: 1,
          generatedAt: 0,
          workspaceRoot: '/',
          projectName: 'p',
          languages: [],
          frameworks: [],
          moduleCount: 0,
          totalFileCount: 0,
          modules: [],
          crossModuleDependencies: [],
        },
        durationMs: 0,
      },
      { type: 'error', id: 'r2', message: 'err' },
    ];
    const types = responses.map((r) => r.type);
    expect(types).toEqual(['ready', 'repoMapReady', 'error']);
  });
});
