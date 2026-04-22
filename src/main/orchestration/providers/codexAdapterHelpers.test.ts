import { describe, expect, it, vi, beforeEach } from 'vitest';

import { getConfigValue, type AppConfig } from '../../config';
import {
  getCodexTransportDecision,
  resolveCodexSettings,
  resetCodexAppServerCapabilityCacheForTests,
  setCodexAppServerCapabilityProbeForTests,
  supportsCodexChatPermissionMode,
} from './codexAdapterHelpers';
import type { ProviderLaunchContext } from './providerAdapter';

vi.mock('../../config', () => ({
  getConfigValue: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
}));

function makeContext(permissionMode?: string): ProviderLaunchContext {
  return {
    taskId: 'task-1',
    sessionId: 'session-1',
    attemptId: 'attempt-1',
    request: {
      taskId: 'task-1',
      sessionId: 'session-1',
      workspaceRoots: ['C:/repo'],
      goal: 'Fix the bug',
      mode: 'edit',
      provider: 'codex',
      verificationProfile: 'default',
      permissionMode,
    },
    contextPacket: {
      version: 1,
      id: 'ctx-1',
      createdAt: 1,
      task: {
        taskId: 'task-1',
        goal: 'Fix the bug',
        mode: 'edit',
        provider: 'codex',
        verificationProfile: 'default',
      },
      repoFacts: {
        workspaceRoots: ['C:/repo'],
        roots: [],
        gitDiff: { changedFiles: [], totalAdditions: 0, totalDeletions: 0, changedFileCount: 0, generatedAt: 1 },
        diagnostics: { files: [], totalErrors: 0, totalWarnings: 0, totalInfos: 0, totalHints: 0, generatedAt: 1 },
        recentEdits: { files: [], generatedAt: 1 },
      },
      liveIdeState: { selectedFiles: [], openFiles: [], dirtyFiles: [], dirtyBuffers: [], collectedAt: 1 },
      files: [],
      omittedCandidates: [],
      budget: { estimatedBytes: 0, estimatedTokens: 0, droppedContentNotes: [] },
    },
  };
}

describe('codexAdapterHelpers', () => {
  const getConfigValueMock = vi.mocked(getConfigValue);

  beforeEach(() => {
    resetCodexAppServerCapabilityCacheForTests();
    getConfigValueMock.mockImplementation((key: keyof AppConfig) => {
      if (key === 'ecosystem') return { codexAppServerTransport: false } as AppConfig['ecosystem'];
      return {
        model: 'gpt-5.4',
        reasoningEffort: 'medium',
        sandbox: 'workspace-write',
        approvalPolicy: 'never',
        profile: '',
        addDirs: [],
        search: false,
        skipGitRepoCheck: false,
        dangerouslyBypassApprovalsAndSandbox: false,
      };
    });
  });

  it('treats never-approval Codex settings as chat-safe on exec transport', () => {
    expect(
      supportsCodexChatPermissionMode({
        model: 'gpt-5.4',
        reasoningEffort: 'medium',
        sandbox: 'workspace-write',
        approvalPolicy: 'never',
        profile: '',
        addDirs: [],
        search: false,
        skipGitRepoCheck: false,
        dangerouslyBypassApprovalsAndSandbox: false,
      }),
    ).toBe(true);
  });

  it('allows interactive settings on app-server transport', () => {
    getConfigValueMock.mockImplementation((key: keyof AppConfig) => {
      if (key === 'ecosystem') return { codexAppServerTransport: true } as AppConfig['ecosystem'];
      return {
        model: 'gpt-5.4',
        reasoningEffort: 'medium',
        sandbox: 'workspace-write',
        approvalPolicy: 'on-request',
        profile: '',
        addDirs: [],
        search: false,
        skipGitRepoCheck: false,
        dangerouslyBypassApprovalsAndSandbox: false,
      };
    });
    setCodexAppServerCapabilityProbeForTests(() => ({ available: true, version: '0.122.0' }));

    expect(() => resolveCodexSettings(makeContext('acceptEdits'), 'app-server')).not.toThrow();
  });

  it('rejects interactive approval modes for Codex exec chat', () => {
    getConfigValueMock.mockImplementation((key: keyof AppConfig) => {
      if (key === 'ecosystem') return { codexAppServerTransport: false } as AppConfig['ecosystem'];
      return {
        model: 'gpt-5.4',
        reasoningEffort: 'medium',
        sandbox: 'workspace-write',
        approvalPolicy: 'on-request',
        profile: '',
        addDirs: [],
        search: false,
        skipGitRepoCheck: false,
        dangerouslyBypassApprovalsAndSandbox: false,
      };
    });

    expect(() => resolveCodexSettings(makeContext('acceptEdits'))).toThrow(
      'Codex chat cannot use interactive approval modes on the current exec transport.',
    );
  });

  it('allows bypass mode for Codex exec chat', () => {
    getConfigValueMock.mockImplementation((key: keyof AppConfig) => {
      if (key === 'ecosystem') return { codexAppServerTransport: false } as AppConfig['ecosystem'];
      return {
        model: 'gpt-5.4',
        reasoningEffort: 'medium',
        sandbox: 'workspace-write',
        approvalPolicy: 'on-request',
        profile: '',
        addDirs: [],
        search: false,
        skipGitRepoCheck: false,
        dangerouslyBypassApprovalsAndSandbox: false,
      };
    });

    expect(() => resolveCodexSettings(makeContext('bypassPermissions'))).not.toThrow();
  });

  it('keeps exec transport and skips probing when the flag is off', () => {
    const probe = vi.fn(() => ({ available: true, version: '0.122.0' }));
    setCodexAppServerCapabilityProbeForTests(probe);

    expect(getCodexTransportDecision(makeContext('auto')).transport).toBe('exec');
    expect(probe).not.toHaveBeenCalled();
  });

  it('uses app-server when the flag is on and capability is available', () => {
    getConfigValueMock.mockImplementation((key: keyof AppConfig) => {
      if (key === 'ecosystem') return { codexAppServerTransport: true } as AppConfig['ecosystem'];
      return {
        model: 'gpt-5.4',
        reasoningEffort: 'medium',
        sandbox: 'workspace-write',
        approvalPolicy: 'never',
        profile: '',
        addDirs: [],
        search: false,
        skipGitRepoCheck: false,
        dangerouslyBypassApprovalsAndSandbox: false,
      };
    });
    setCodexAppServerCapabilityProbeForTests(() => ({ available: true, version: '0.122.0' }));

    expect(getCodexTransportDecision(makeContext('auto')).transport).toBe('app-server');
  });

  it('falls back to exec with a warning when capability is missing', () => {
    getConfigValueMock.mockImplementation((key: keyof AppConfig) => {
      if (key === 'ecosystem') return { codexAppServerTransport: true } as AppConfig['ecosystem'];
      return {
        model: 'gpt-5.4',
        reasoningEffort: 'medium',
        sandbox: 'workspace-write',
        approvalPolicy: 'never',
        profile: '',
        addDirs: [],
        search: false,
        skipGitRepoCheck: false,
        dangerouslyBypassApprovalsAndSandbox: false,
      };
    });
    setCodexAppServerCapabilityProbeForTests(() => ({
      available: false,
      reason: 'Installed Codex CLI does not expose the app-server subcommand.',
      version: '0.122.0',
    }));

    const decision = getCodexTransportDecision(makeContext('plan'));
    expect(decision.transport).toBe('exec');
    expect(decision.warning).toContain('app-server transport unavailable');
  });
});
