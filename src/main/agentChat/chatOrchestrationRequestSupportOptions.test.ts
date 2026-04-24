/**
 * Smoke tests for chatOrchestrationRequestSupportOptions.
 *
 * Covers send-options resolution: model/slot resolution, provider-specific
 * permission mode mapping, effort defaults, and inference control merging.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AGENT_CHAT_SETTINGS_DEFAULTS,
  CLAUDE_CLI_SETTINGS_FALLBACK,
  CODEX_CLI_SETTINGS_FALLBACK,
  type ResolvedAgentChatSettings,
} from './settingsResolver';

vi.mock('../config', () => ({
  getConfigValue: vi.fn(),
}));
vi.mock('../profiles/profileStore', () => ({
  getProfileStore: vi.fn(() => null),
}));

import { getConfigValue } from '../config';
import { buildResolvedOptions } from './chatOrchestrationRequestSupportOptions';

const mockGetConfigValue = vi.mocked(getConfigValue);

function makeSettings(
  overrides: Partial<ResolvedAgentChatSettings> = {},
): ResolvedAgentChatSettings {
  return {
    ...AGENT_CHAT_SETTINGS_DEFAULTS,
    claudeCliSettings: { ...CLAUDE_CLI_SETTINGS_FALLBACK },
    codexCliSettings: { ...CODEX_CLI_SETTINGS_FALLBACK },
    ...overrides,
  };
}

describe('buildResolvedOptions', () => {
  beforeEach(() => {
    mockGetConfigValue.mockReset();
    mockGetConfigValue.mockImplementation(() => undefined);
  });

  it('returns defaults when no overrides or slots are set', () => {
    const result = buildResolvedOptions(makeSettings(), 'claude-code', undefined);

    expect(result.provider).toBe('claude-code');
    expect(result.mode).toBe('edit');
    expect(result.effort).toBe('medium');
    expect(result.permissionMode).toBe('default');
    expect(result.model).toBe('sonnet');
  });

  it('applies explicit override model over settings default', () => {
    const settings = makeSettings({
      claudeCliSettings: { ...CLAUDE_CLI_SETTINGS_FALLBACK, model: 'sonnet' },
    });
    const result = buildResolvedOptions(settings, 'claude-code', {
      model: 'opus',
    });

    expect(result.model).toBe('opus');
  });

  it('uses agentChat model slot for Claude when no override', () => {
    mockGetConfigValue.mockImplementation((key: string) => {
      if (key === 'modelSlots') return { agentChat: 'claude-opus-4-6' };
      return undefined;
    });
    const result = buildResolvedOptions(makeSettings(), 'claude-code', undefined);

    expect(result.model).toBe('claude-opus-4-6');
  });

  it('uses agentChat model slot for Codex only when it starts with gpt-', () => {
    mockGetConfigValue.mockImplementation((key: string) => {
      if (key === 'modelSlots') return { agentChat: 'gpt-5-codex' };
      return undefined;
    });
    const settings = makeSettings({
      codexCliSettings: { ...CODEX_CLI_SETTINGS_FALLBACK, model: 'gpt-5' },
    });
    const result = buildResolvedOptions(settings, 'codex', undefined);

    expect(result.model).toBe('gpt-5-codex');
  });

  it('maps Codex bypass flag to bypassPermissions', () => {
    const settings = makeSettings({
      codexCliSettings: {
        ...CODEX_CLI_SETTINGS_FALLBACK,
        dangerouslyBypassApprovalsAndSandbox: true,
      },
    });
    const result = buildResolvedOptions(settings, 'codex', undefined);

    expect(result.permissionMode).toBe('bypassPermissions');
  });

  it('maps Codex approvalPolicy=never to auto', () => {
    const settings = makeSettings({
      codexCliSettings: { ...CODEX_CLI_SETTINGS_FALLBACK, approvalPolicy: 'never' },
    });
    const result = buildResolvedOptions(settings, 'codex', undefined);

    expect(result.permissionMode).toBe('auto');
  });

  it('accepts Codex acceptEdits by default because app-server is the primary transport', () => {
    mockGetConfigValue.mockImplementation(() => undefined);
    const result = buildResolvedOptions(makeSettings(), 'codex', {
      permissionMode: 'acceptEdits',
    });

    expect(result.permissionMode).toBe('acceptEdits');
  });

  it('accepts Codex acceptEdits when app-server transport is enabled', () => {
    mockGetConfigValue.mockImplementation((key: string) => {
      if (key === 'ecosystem') return { codexAppServerTransport: true };
      return undefined;
    });
    const result = buildResolvedOptions(makeSettings(), 'codex', {
      permissionMode: 'acceptEdits',
    });

    expect(result.permissionMode).toBe('acceptEdits');
  });

  it('merges override inference controls over profile defaults', () => {
    const result = buildResolvedOptions(makeSettings(), 'claude-code', {
      temperature: 0.3,
      maxTokens: 8000,
      stopSequences: ['STOP'],
    });

    expect(result.temperature).toBe(0.3);
    expect(result.maxTokens).toBe(8000);
    expect(result.stopSequences).toEqual(['STOP']);
  });

  it('joins toolOverrides array into allowedTools comma string', () => {
    const result = buildResolvedOptions(makeSettings(), 'claude-code', {
      toolOverrides: ['Read', 'Edit', 'Write'],
    } as NonNullable<Parameters<typeof buildResolvedOptions>[2]>);

    expect(result.allowedTools).toBe('Read,Edit,Write');
  });
});
