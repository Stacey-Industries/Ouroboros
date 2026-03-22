import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModelSlotAssignments } from '../config'
import { getConfigValue } from '../config'
import type { AgentChatSendMessageRequest } from './types'
import type { ResolvedAgentChatSettings } from './settingsResolver'
import {
  CLAUDE_CLI_SETTINGS_FALLBACK,
  CODEX_CLI_SETTINGS_FALLBACK,
} from './settingsResolver'
import { resolveSendOptions } from './chatOrchestrationRequestSupport'

vi.mock('../config', () => ({
  getConfigValue: vi.fn(),
}))

function createSettings(overrides?: Partial<ResolvedAgentChatSettings>): ResolvedAgentChatSettings {
  return {
    defaultProvider: 'claude-code',
    defaultVerificationProfile: 'default',
    contextBehavior: 'auto',
    showAdvancedControls: false,
    openDetailsOnFailure: false,
    defaultView: 'chat',
    claudeCliSettings: {
      ...CLAUDE_CLI_SETTINGS_FALLBACK,
      model: 'claude-sonnet-4-6',
      permissionMode: 'plan',
    },
    codexCliSettings: {
      ...CODEX_CLI_SETTINGS_FALLBACK,
      model: 'gpt-5.4',
    },
    ...overrides,
  }
}

function createRequest(
  overrides?: AgentChatSendMessageRequest['overrides'],
): AgentChatSendMessageRequest {
  return {
    workspaceRoot: 'C:/repo',
    content: 'Fix the bug',
    overrides,
  }
}

describe('resolveSendOptions', () => {
  const getConfigValueMock = vi.mocked(getConfigValue)

  beforeEach(() => {
    getConfigValueMock.mockReset()
    getConfigValueMock.mockReturnValue(undefined)
  })

  it('uses Codex CLI defaults when the provider resolves to codex', () => {
    const result = resolveSendOptions(
      createSettings({ defaultProvider: 'codex' }),
      createRequest(),
    )

    expect(result.provider).toBe('codex')
    expect(result.model).toBe('gpt-5.4')
    expect(result.permissionMode).toBe('default')
  })

  it('uses Codex CLI defaults when the request explicitly targets codex', () => {
    const result = resolveSendOptions(
      createSettings(),
      createRequest({ provider: 'codex' }),
    )

    expect(result.provider).toBe('codex')
    expect(result.model).toBe('gpt-5.4')
    expect(result.permissionMode).toBe('default')
  })

  it('keeps the agent chat model slot as the highest-precedence fallback', () => {
    const slots: ModelSlotAssignments = {
      terminal: '',
      agentChat: 'gpt-5.4-mini',
      claudeMdGeneration: '',
    }
    getConfigValueMock.mockReturnValue(slots)

    const result = resolveSendOptions(
      createSettings({ defaultProvider: 'codex' }),
      createRequest(),
    )

    expect(result.provider).toBe('codex')
    expect(result.model).toBe('gpt-5.4-mini')
  })
})
