import { useEffect, useState } from 'react';

import type {
  AppConfig,
  CodexCliSettings,
  CodexModelOption,
} from '../../types/electron';

interface CodexOption<T extends string = string> {
  label: string;
  value: T;
}

export interface CodexSectionModel {
  canAddDir: boolean;
  modelOptions: CodexModelOption[];
  newDir: string;
  settings: CodexCliSettings;
  addDir: () => void;
  removeDir: (index: number) => void;
  setNewDir: (value: string) => void;
  updateSetting: <K extends keyof CodexCliSettings>(key: K, value: CodexCliSettings[K]) => void;
}

type ConfigChangeHandler = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
type CodexSettingUpdater = <K extends keyof CodexCliSettings>(
  key: K,
  value: CodexCliSettings[K],
) => void;

export const DEFAULT_CODEX_SETTINGS: CodexCliSettings = {
  model: '',
  reasoningEffort: 'medium',
  sandbox: 'workspace-write',
  approvalPolicy: 'on-request',
  profile: '',
  addDirs: [],
  search: false,
  skipGitRepoCheck: false,
  dangerouslyBypassApprovalsAndSandbox: false,
};

export const CODEX_REASONING_LEVELS: CodexOption[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra High' },
];

export const CODEX_SANDBOX_MODES: CodexOption<CodexCliSettings['sandbox']>[] = [
  { value: 'read-only', label: 'Read Only' },
  { value: 'workspace-write', label: 'Workspace Write' },
  { value: 'danger-full-access', label: 'Danger Full Access' },
];

export const CODEX_APPROVAL_POLICIES: CodexOption<CodexCliSettings['approvalPolicy']>[] = [
  { value: 'untrusted', label: 'Untrusted' },
  { value: 'on-request', label: 'On Request' },
  { value: 'never', label: 'Never' },
];

function buildCodexSettings(rawSettings: CodexCliSettings | undefined): CodexCliSettings {
  const settings = rawSettings ?? DEFAULT_CODEX_SETTINGS;
  return {
    ...DEFAULT_CODEX_SETTINGS,
    ...settings,
    reasoningEffort: settings.reasoningEffort || DEFAULT_CODEX_SETTINGS.reasoningEffort,
    sandbox: settings.sandbox || DEFAULT_CODEX_SETTINGS.sandbox,
    approvalPolicy: settings.approvalPolicy || DEFAULT_CODEX_SETTINGS.approvalPolicy,
    addDirs: settings.addDirs ?? DEFAULT_CODEX_SETTINGS.addDirs,
  };
}

function useCodexModelOptions(): CodexModelOption[] {
  const [modelOptions, setModelOptions] = useState<CodexModelOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.codex.listModels().then((models) => {
      if (!cancelled) {
        setModelOptions(models);
      }
    }).catch((error) => {
      console.error('[settings] Failed to load Codex models:', error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return modelOptions;
}

export function useCodexSectionModel(
  draft: AppConfig,
  onChange: ConfigChangeHandler,
): CodexSectionModel {
  const settings = buildCodexSettings(draft.codexCliSettings);
  const modelOptions = useCodexModelOptions();
  const updateSetting: CodexSettingUpdater = (key, value) =>
    updateCodexSetting(settings, onChange, key, value);
  const directoryState = useCodexDirectoryState(settings, updateSetting);

  return {
    canAddDir: directoryState.canAddDir,
    modelOptions,
    newDir: directoryState.newDir,
    settings,
    addDir: directoryState.addDir,
    removeDir: directoryState.removeDir,
    setNewDir: directoryState.setNewDir,
    updateSetting,
  };
}

function updateCodexSetting<K extends keyof CodexCliSettings>(
  settings: CodexCliSettings,
  onChange: ConfigChangeHandler,
  key: K,
  value: CodexCliSettings[K],
): void {
  onChange('codexCliSettings', { ...settings, [key]: value });
}

function useCodexDirectoryState(
  settings: CodexCliSettings,
  updateSetting: CodexSettingUpdater,
): Pick<CodexSectionModel, 'addDir' | 'canAddDir' | 'newDir' | 'removeDir' | 'setNewDir'> {
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
