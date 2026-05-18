// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useClaudeCliSettings } from './useClaudeCliSettings';

const mockConfig = vi.fn();

vi.mock('./useConfig', () => ({
  useConfig: () => ({ config: mockConfig(), isLoading: false, error: null }),
}));

describe('useClaudeCliSettings', () => {
  beforeEach(() => {
    mockConfig.mockReset();
  });

  it('returns claudeCliSettings from config when config is loaded', () => {
    mockConfig.mockReturnValue({
      claudeCliSettings: {
        permissionMode: 'auto',
        model: 'sonnet',
        effort: 'high',
        appendSystemPrompt: '',
        verbose: true,
        maxBudgetUsd: 5,
        allowedTools: '',
        disallowedTools: '',
        addDirs: [],
        chrome: false,
        worktree: false,
        dangerouslySkipPermissions: false,
        useWarmProcess: true,
        enableTerminalDiffReview: false,
      },
    });

    const { result } = renderHook(() => useClaudeCliSettings());

    expect(result.current.permissionMode).toBe('auto');
    expect(result.current.model).toBe('sonnet');
    expect(result.current.enableTerminalDiffReview).toBe(false);
  });

  it('returns safe defaults when config is null (not yet loaded)', () => {
    mockConfig.mockReturnValue(null);

    const { result } = renderHook(() => useClaudeCliSettings());

    expect(result.current.permissionMode).toBe('default');
    expect(result.current.enableTerminalDiffReview).toBe(true);
    expect(result.current.useWarmProcess).toBe(true);
  });

  it('enableTerminalDiffReview defaults to true when config is loaded but field is absent', () => {
    mockConfig.mockReturnValue({
      claudeCliSettings: {
        permissionMode: 'default',
        model: '',
        effort: 'medium',
        appendSystemPrompt: '',
        verbose: false,
        maxBudgetUsd: 0,
        allowedTools: '',
        disallowedTools: '',
        addDirs: [],
        chrome: false,
        worktree: false,
        dangerouslySkipPermissions: false,
        useWarmProcess: true,
        enableTerminalDiffReview: true,
      },
    });

    const { result } = renderHook(() => useClaudeCliSettings());

    expect(result.current.enableTerminalDiffReview).toBe(true);
  });
});
