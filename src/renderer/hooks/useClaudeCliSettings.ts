import type { ClaudeCliSettings } from '../types/electron';
import { useConfig } from './useConfig';

/**
 * useClaudeCliSettings — thin reader for ClaudeCliSettings from the electron-store config.
 *
 * Returns the full ClaudeCliSettings object (with safe defaults if config is not yet loaded).
 * Uses useConfig's existing IPC subscription so it reacts to external config changes.
 */
export function useClaudeCliSettings(): ClaudeCliSettings {
  const { config } = useConfig();
  return (
    config?.claudeCliSettings ?? {
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
    }
  );
}
