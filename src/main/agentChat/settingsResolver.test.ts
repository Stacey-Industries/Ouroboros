import { describe, expect, it } from 'vitest'

import {
  AGENT_CHAT_SETTINGS_DEFAULTS,
  CLAUDE_CLI_SETTINGS_FALLBACK,
  CODEX_CLI_SETTINGS_FALLBACK,
  resolveAgentChatSettings,
  resolveClaudeCliSettings,
  resolveCodexCliSettings,
} from './settingsResolver'

function registerDefaultsTest(): void {
  it('returns the frozen v1 defaults when config values are missing', () => {
    expect(resolveAgentChatSettings()).toEqual({
      ...AGENT_CHAT_SETTINGS_DEFAULTS,
      claudeCliSettings: CLAUDE_CLI_SETTINGS_FALLBACK,
      codexCliSettings: CODEX_CLI_SETTINGS_FALLBACK,
    })
  })
}

function registerPreserveStoredValuesTest(): void {
  it('preserves stored agent chat defaults and existing Claude CLI settings', () => {
    expect(resolveAgentChatSettings({
      agentChatSettings: {
        defaultProvider: 'codex',
        defaultVerificationProfile: 'full',
        contextBehavior: 'manual',
        showAdvancedControls: true,
        openDetailsOnFailure: true,
        defaultView: 'monitor',
      },
      claudeCliSettings: {
        permissionMode: 'plan',
        model: 'sonnet',
        addDirs: ['c:/repo'],
        verbose: true,
      },
      codexCliSettings: {
        model: 'gpt-5.4',
        sandbox: 'read-only',
        search: true,
      },
    })).toEqual({
      defaultProvider: 'codex',
      defaultVerificationProfile: 'full',
      contextBehavior: 'manual',
      showAdvancedControls: true,
      openDetailsOnFailure: true,
      defaultView: 'monitor',
      claudeCliSettings: {
        ...CLAUDE_CLI_SETTINGS_FALLBACK,
        permissionMode: 'plan',
        model: 'sonnet',
        addDirs: ['c:/repo'],
        verbose: true,
      },
      codexCliSettings: {
        ...CODEX_CLI_SETTINGS_FALLBACK,
        model: 'gpt-5.4',
        sandbox: 'read-only',
        search: true,
      },
    })
  })
}

function registerFallbackNormalizationTest(): void {
  it('falls back for invalid enum values while normalizing Claude settings field-by-field', () => {
    expect(resolveAgentChatSettings({
      agentChatSettings: {
        defaultProvider: 'invalid-provider' as never,
        defaultVerificationProfile: 'invalid-profile' as never,
        contextBehavior: 'invalid-context' as never,
        defaultView: 'invalid-view' as never,
      },
      claudeCliSettings: {
        permissionMode: 'acceptEdits',
        maxBudgetUsd: Number.NaN,
        addDirs: ['c:/repo', 42 as never],
        dangerouslySkipPermissions: true,
      },
      codexCliSettings: {
        sandbox: 'invalid-sandbox' as never,
        approvalPolicy: 'invalid-policy' as never,
        addDirs: ['c:/repo', 42 as never],
        dangerouslyBypassApprovalsAndSandbox: true,
      },
    })).toEqual({
      ...AGENT_CHAT_SETTINGS_DEFAULTS,
      claudeCliSettings: {
        ...CLAUDE_CLI_SETTINGS_FALLBACK,
        permissionMode: 'acceptEdits',
        addDirs: ['c:/repo'],
        dangerouslySkipPermissions: true,
      },
      codexCliSettings: {
        ...CODEX_CLI_SETTINGS_FALLBACK,
        addDirs: ['c:/repo'],
        dangerouslyBypassApprovalsAndSandbox: true,
      },
    })
  })
}

function registerClaudeOnlyResolverTest(): void {
  it('resolves Claude CLI settings independently for narrow reuse sites', () => {
    expect(resolveClaudeCliSettings({
      appendSystemPrompt: 'Focus on tests',
      chrome: true,
      worktree: true,
    })).toEqual({
      ...CLAUDE_CLI_SETTINGS_FALLBACK,
      appendSystemPrompt: 'Focus on tests',
      chrome: true,
      worktree: true,
    })
  })
}

function registerCodexOnlyResolverTest(): void {
  it('resolves Codex CLI settings independently for Codex request paths', () => {
    expect(resolveCodexCliSettings({
      model: 'gpt-5.4-mini',
      approvalPolicy: 'never',
      skipGitRepoCheck: true,
    })).toEqual({
      ...CODEX_CLI_SETTINGS_FALLBACK,
      model: 'gpt-5.4-mini',
      approvalPolicy: 'never',
      skipGitRepoCheck: true,
    })
  })
}

describe('agent chat settings resolver', () => {
  registerDefaultsTest()
  registerPreserveStoredValuesTest()
  registerFallbackNormalizationTest()
  registerClaudeOnlyResolverTest()
  registerCodexOnlyResolverTest()
})
