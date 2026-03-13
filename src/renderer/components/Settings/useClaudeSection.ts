import { useState } from 'react';
import type { AgentTemplate, AppConfig, ClaudeCliSettings } from '../../types/electron';

export interface ClaudeOption {
  label: string;
  value: string;
}

export interface ClaudeOptionGroup {
  label: string;
  options: ClaudeOption[];
}

export interface ClaudeSectionModel {
  autoLaunch: boolean;
  canAddDir: boolean;
  newDir: string;
  settings: ClaudeCliSettings;
  templates: AgentTemplate[];
  addDir: () => void;
  removeDir: (index: number) => void;
  setAutoLaunch: (value: boolean) => void;
  setNewDir: (value: string) => void;
  updateSetting: <K extends keyof ClaudeCliSettings>(key: K, value: ClaudeCliSettings[K]) => void;
  updateTemplates: (templates: AgentTemplate[]) => void;
}

type ConfigChangeHandler = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
type ClaudeSettingUpdater = <K extends keyof ClaudeCliSettings>(
  key: K,
  value: ClaudeCliSettings[K],
) => void;

export const DEFAULT_CLAUDE_SETTINGS: ClaudeCliSettings = {
  permissionMode: 'default',
  model: '',
  effort: '',
  appendSystemPrompt: '',
  verbose: false,
  maxBudgetUsd: 0,
  allowedTools: '',
  disallowedTools: '',
  addDirs: [],
  chrome: false,
  worktree: false,
  dangerouslySkipPermissions: false,
};

export const PERMISSION_MODES: ClaudeOption[] = [
  { value: 'default', label: 'Default' },
  { value: 'acceptEdits', label: 'Accept Edits' },
  { value: 'plan', label: 'Plan' },
  { value: 'auto', label: 'Auto' },
  { value: 'bypassPermissions', label: 'Bypass Permissions' },
];

export const EFFORT_LEVELS: ClaudeOption[] = [
  { value: '', label: '(Default)' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
];

export const MODEL_OPTION_GROUPS: ClaudeOptionGroup[] = [
  {
    label: 'Latest Versions',
    options: [
      { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    ],
  },
  {
    label: 'Aliases (always latest of tier)',
    options: [
      { value: 'opus', label: 'Opus (latest)' },
      { value: 'sonnet', label: 'Sonnet (latest)' },
      { value: 'haiku', label: 'Haiku (latest)' },
    ],
  },
];

export function useClaudeSectionModel(
  draft: AppConfig,
  onChange: ConfigChangeHandler,
): ClaudeSectionModel {
  const settings = draft.claudeCliSettings ?? DEFAULT_CLAUDE_SETTINGS;
  const updateSetting: ClaudeSettingUpdater = (key, value) =>
    updateClaudeSetting(settings, onChange, key, value);
  const directoryState = useClaudeDirectoryState(settings, updateSetting);

  return {
    autoLaunch: draft.claudeAutoLaunch ?? false,
    canAddDir: directoryState.canAddDir,
    newDir: directoryState.newDir,
    settings,
    templates: draft.agentTemplates ?? [],
    addDir: directoryState.addDir,
    removeDir: directoryState.removeDir,
    setAutoLaunch: (value) => onChange('claudeAutoLaunch', value),
    setNewDir: directoryState.setNewDir,
    updateSetting,
    updateTemplates: (templates) => onChange('agentTemplates', templates),
  };
}

function updateClaudeSetting<K extends keyof ClaudeCliSettings>(
  settings: ClaudeCliSettings,
  onChange: ConfigChangeHandler,
  key: K,
  value: ClaudeCliSettings[K],
): void {
  onChange('claudeCliSettings', { ...settings, [key]: value });
}

function useClaudeDirectoryState(
  settings: ClaudeCliSettings,
  updateSetting: ClaudeSettingUpdater,
): Pick<
  ClaudeSectionModel,
  'addDir' | 'canAddDir' | 'newDir' | 'removeDir' | 'setNewDir'
> {
  const [newDir, setNewDir] = useState('');

  function addDir(): void {
    const trimmed = newDir.trim();
    if (!trimmed || settings.addDirs.includes(trimmed)) {
      setNewDir('');
      return;
    }
    updateSetting('addDirs', [...settings.addDirs, trimmed]);
    setNewDir('');
  }

  function removeDir(index: number): void {
    updateSetting(
      'addDirs',
      settings.addDirs.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  return { addDir, canAddDir: newDir.trim().length > 0, newDir, removeDir, setNewDir };
}
