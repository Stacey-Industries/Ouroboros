import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModelSlotAssignments } from '../config';
import { getConfigValue } from '../config';
import { logRoutingDecision, routePromptSync } from '../router';
import { resolveSendOptions } from './chatOrchestrationRequestSupport';
import type { ResolvedAgentChatSettings } from './settingsResolver';
import { CLAUDE_CLI_SETTINGS_FALLBACK, CODEX_CLI_SETTINGS_FALLBACK } from './settingsResolver';
import type { AgentChatSendMessageRequest } from './types';

vi.mock('../config', () => ({
  getConfigValue: vi.fn(),
}));

vi.mock('../router', () => ({
  routePromptSync: vi.fn(),
  logRoutingDecision: vi.fn(),
  logRouterOverride: vi.fn(),
}));

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
  };
}

function createRequest(
  overrides?: AgentChatSendMessageRequest['overrides'],
): AgentChatSendMessageRequest {
  return {
    workspaceRoot: 'C:/repo',
    content: 'Fix the bug',
    overrides,
  };
}

describe('resolveSendOptions', () => {
  const getConfigValueMock = vi.mocked(getConfigValue);
  const routePromptSyncMock = vi.mocked(routePromptSync);
  const logRoutingDecisionMock = vi.mocked(logRoutingDecision);

  beforeEach(() => {
    getConfigValueMock.mockReset();
    routePromptSyncMock.mockReset();
    logRoutingDecisionMock.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getConfigValueMock.mockReturnValue(undefined as any);
  });

  it('uses Codex CLI defaults when the provider resolves to codex', () => {
    const result = resolveSendOptions(
      createSettings({ defaultProvider: 'codex' }),
      createRequest(),
    );

    expect(result.provider).toBe('codex');
    expect(result.model).toBe('gpt-5.4');
    expect(result.permissionMode).toBe('default');
  });

  it('uses Codex CLI defaults when the request explicitly targets codex', () => {
    const result = resolveSendOptions(createSettings(), createRequest({ provider: 'codex' }));

    expect(result.provider).toBe('codex');
    expect(result.model).toBe('gpt-5.4');
    expect(result.permissionMode).toBe('default');
  });

  it('keeps the agent chat model slot as the highest-precedence fallback', () => {
    const slots: ModelSlotAssignments = {
      terminal: '',
      agentChat: 'gpt-5.4-mini',
      claudeMdGeneration: '',
      inlineCompletion: '',
    };
    getConfigValueMock.mockReturnValue(slots);

    const result = resolveSendOptions(
      createSettings({ defaultProvider: 'codex' }),
      createRequest(),
    );

    expect(result.provider).toBe('codex');
    expect(result.model).toBe('gpt-5.4-mini');
  });

  it('ignores the agent chat slot when the request explicitly selects Claude provider without a model', () => {
    const slots: ModelSlotAssignments = {
      terminal: '',
      agentChat: 'gpt-5.4',
      claudeMdGeneration: '',
      inlineCompletion: '',
    };
    getConfigValueMock.mockReturnValue(slots);

    const result = resolveSendOptions(
      createSettings({ defaultProvider: 'codex' }),
      createRequest({ provider: 'claude-code' }),
    );

    expect(result.provider).toBe('claude-code');
    expect(result.model).toBe('claude-sonnet-4-6');
  });

  it('ignores the agent chat slot when the request explicitly selects Codex provider without a model', () => {
    const slots: ModelSlotAssignments = {
      terminal: '',
      agentChat: 'sonnet',
      claudeMdGeneration: '',
      inlineCompletion: '',
    };
    getConfigValueMock.mockReturnValue(slots);

    const result = resolveSendOptions(
      createSettings(),
      createRequest({ provider: 'codex' }),
    );

    expect(result.provider).toBe('codex');
    expect(result.model).toBe('gpt-5.4');
  });

  it('injects a router-selected model when routing is enabled and no model is explicitly chosen', () => {
    getConfigValueMock.mockImplementation((key) => {
      if (key === 'routerSettings') {
        return {
          enabled: true,
          layer1Enabled: true,
          layer2Enabled: true,
          layer3Enabled: true,
          layer2ConfidenceThreshold: 0.6,
          paranoidMode: false,
        };
      }
      return undefined;
    });
    routePromptSyncMock.mockReturnValue({
      tier: 'OPUS',
      model: 'claude-opus-4-6',
      routedBy: 'rule',
      confidence: 1,
      latencyMs: 0,
      rule: 'CMD',
    });

    const result = resolveSendOptions(createSettings(), createRequest());

    expect(routePromptSyncMock).toHaveBeenCalledWith('Fix the bug', undefined, {
      enabled: true,
      layer1Enabled: true,
      layer2Enabled: true,
      layer3Enabled: true,
      layer2ConfidenceThreshold: 0.6,
      paranoidMode: false,
    });
    expect(logRoutingDecisionMock).toHaveBeenCalled();
    expect(result.model).toBe('claude-opus-4-6');
    expect(result.routedBy).toBe('rule');
  });

  it('runs the router for override logging when the request specifies a model override', () => {
    getConfigValueMock.mockImplementation((key) => {
      if (key === 'routerSettings') {
        return {
          enabled: true,
          layer1Enabled: true,
          layer2Enabled: true,
          layer3Enabled: true,
          layer2ConfidenceThreshold: 0.6,
          paranoidMode: false,
        };
      }
      return undefined;
    });

    const result = resolveSendOptions(
      createSettings(),
      createRequest({ model: 'claude-haiku-4-5-20251001' }),
    );

    expect(routePromptSyncMock).toHaveBeenCalled();
    expect(result.model).toBe('claude-haiku-4-5-20251001');
    expect(result.routedBy).toBe('user');
  });

  it('resolves "auto" effort to "medium" when the router selects SONNET', () => {
    getConfigValueMock.mockImplementation((key) => {
      if (key === 'routerSettings') {
        return { enabled: true, layer1Enabled: true, layer2Enabled: true,
          layer3Enabled: true, layer2ConfidenceThreshold: 0.6, paranoidMode: false };
      }
      return undefined;
    });
    routePromptSyncMock.mockReturnValue({
      tier: 'SONNET', model: 'claude-sonnet-4-6', routedBy: 'rule',
      confidence: 1, latencyMs: 0, rule: 'S1',
    });
    const result = resolveSendOptions(createSettings(), createRequest({ effort: 'auto' }));
    expect(result.effort).toBe('medium');
  });

  it('resolves "auto" effort to "high" when the router selects OPUS', () => {
    getConfigValueMock.mockImplementation((key) => {
      if (key === 'routerSettings') {
        return { enabled: true, layer1Enabled: true, layer2Enabled: true,
          layer3Enabled: true, layer2ConfidenceThreshold: 0.6, paranoidMode: false };
      }
      return undefined;
    });
    routePromptSyncMock.mockReturnValue({
      tier: 'OPUS', model: 'claude-opus-4-6', routedBy: 'rule',
      confidence: 1, latencyMs: 0, rule: 'O1',
    });
    const result = resolveSendOptions(createSettings(), createRequest({ effort: 'auto' }));
    expect(result.effort).toBe('high');
  });

  it('resolves "auto" effort from model name when user explicitly picks a model', () => {
    getConfigValueMock.mockImplementation((key) => {
      if (key === 'routerSettings') {
        return { enabled: true, layer1Enabled: true, layer2Enabled: true,
          layer3Enabled: true, layer2ConfidenceThreshold: 0.6, paranoidMode: false };
      }
      return undefined;
    });
    const result = resolveSendOptions(
      createSettings(),
      createRequest({ model: 'claude-opus-4-6', effort: 'auto' }),
    );
    expect(result.effort).toBe('high');
    expect(result.model).toBe('claude-opus-4-6');
  });

  it('keeps explicit effort when not "auto"', () => {
    const result = resolveSendOptions(createSettings(), createRequest({ effort: 'low' }));
    expect(result.effort).toBe('low');
  });
});
