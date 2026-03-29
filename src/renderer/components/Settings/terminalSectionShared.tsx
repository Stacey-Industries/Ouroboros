import React from 'react';

import type { AppConfig } from '../../types/electron';

export type SettingsChangeHandler = <K extends keyof AppConfig>(
  key: K,
  value: AppConfig[K],
) => void;
export type PromptPreset = 'default' | 'minimal' | 'git' | 'powerline' | 'custom';
type ShellPresetPlatform = 'win32' | 'darwin' | 'linux' | 'all';

export interface ShellPreset {
  label: string;
  path: string;
  platform: ShellPresetPlatform;
  note?: string;
}

interface PresetButtonProps {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}

interface StepButtonProps {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}

export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 24;
export const DEFAULT_FONT_SIZE = 14;
const DEFAULT_PROMPT_PRESET: PromptPreset = 'default';

export const PRESET_LABELS: Record<PromptPreset, string> = {
  default: 'Default',
  minimal: 'Minimal',
  git: 'Git',
  powerline: 'Powerline',
  custom: 'Custom',
};

const PRESET_PREVIEWS: Record<Exclude<PromptPreset, 'custom'>, string> = {
  default: '(system default)',
  minimal: '$ ',
  git: 'user@host ~/project:main $ ',
  powerline: ' user ~/project ',
};

export const PRESET_ORDER: PromptPreset[] = ['default', 'minimal', 'git', 'powerline', 'custom'];

const SHELL_PRESETS: ShellPreset[] = [
  {
    label: 'PowerShell 5',
    path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    platform: 'win32',
  },
  { label: 'PowerShell 7', path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', platform: 'win32' },
  { label: 'cmd.exe', path: 'C:\\Windows\\System32\\cmd.exe', platform: 'win32' },
  { label: 'Git Bash', path: 'C:\\Program Files\\Git\\bin\\bash.exe', platform: 'win32' },
  { label: 'WSL', path: 'C:\\Windows\\System32\\wsl.exe', platform: 'win32' },
  { label: 'zsh', path: '/bin/zsh', platform: 'darwin' },
  { label: 'bash', path: '/bin/bash', platform: 'darwin' },
  { label: 'fish', path: '/usr/local/bin/fish', platform: 'darwin', note: '/usr/local/bin/fish' },
  { label: 'bash', path: '/bin/bash', platform: 'linux' },
  { label: 'zsh', path: '/usr/bin/zsh', platform: 'linux' },
  { label: 'fish', path: '/usr/bin/fish', platform: 'linux' },
  { label: 'sh', path: '/bin/sh', platform: 'linux' },
];

export const SAMPLE_LINES = [
  '$ claude --version',
  'claude 1.0.0 (build 2025-01-15)',
  '$ npm run dev',
  '> agent-ide@0.1.0 dev',
  '> electron-vite dev',
  '',
  '  vite v5.4.2 dev server running at:',
  '  > Local: http://localhost:5173/',
];

export const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

export const sectionHintStyle: React.CSSProperties = {
  fontSize: '12px',
};

export const inlineInputStyle: React.CSSProperties = {
  width: '60px',
  padding: '7px 8px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '13px',
  textAlign: 'center',
  outline: 'none',
  fontFamily: 'var(--font-mono)',
};

export const textInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
  boxSizing: 'border-box',
};

export const previewBoxStyle: React.CSSProperties = {
  background: 'var(--surface-base)',
  border: '1px solid var(--border-default)',
  borderRadius: '4px',
  padding: '8px 12px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.875rem',
  whiteSpace: 'pre',
  overflowX: 'auto',
};

export const terminalPreviewStyle: React.CSSProperties = {
  background: 'var(--term-bg, #0c0c0e)',
  border: '1px solid var(--border-default)',
  borderRadius: '6px',
  padding: '14px 16px',
  fontFamily: 'var(--font-mono)',
  color: 'var(--term-fg, #e4e4e7)',
  lineHeight: 1.6,
  overflow: 'hidden',
  maxHeight: '160px',
};

export function clampFontSize(value: number): number {
  return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, value));
}

export function resolvePromptPreset(value?: string): PromptPreset {
  return PRESET_ORDER.includes(value as PromptPreset)
    ? (value as PromptPreset)
    : DEFAULT_PROMPT_PRESET;
}

export function getPlatformPresets(platform: NodeJS.Platform): ShellPreset[] {
  return SHELL_PRESETS.filter(
    (preset) => preset.platform === platform || preset.platform === 'all',
  );
}

export function getPromptPreview(promptPreset: PromptPreset, customPrompt: string): string {
  if (promptPreset === 'custom') {
    return customPrompt || '(empty - will use shell default)';
  }

  return PRESET_PREVIEWS[promptPreset] ?? PRESET_PREVIEWS.default;
}

export function getDefaultShellForPlatform(platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  }

  if (platform === 'darwin') {
    return '/bin/zsh';
  }

  return '/bin/bash';
}

export function PresetButton({
  active,
  children,
  onClick,
  title,
}: PresetButtonProps): React.ReactElement<any> {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: '4px 12px',
        borderRadius: '4px',
        border: active ? '1px solid var(--interactive-accent)' : '1px solid var(--border-default)',
        background: active ? 'var(--interactive-accent)' : 'transparent',
        color: active ? 'var(--text-on-accent)' : 'var(--text-primary)',
        fontSize: '12px',
        cursor: 'pointer',
        fontFamily: 'var(--font-ui)',
        transition: 'all 0.1s',
      }}
    >
      {children}
    </button>
  );
}

export function StepButton({
  children,
  disabled,
  label,
  onClick,
}: StepButtonProps): React.ReactElement<any> {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        width: '32px',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '6px',
        border: '1px solid var(--border-default)',
        background: 'var(--surface-raised)',
        color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
        fontSize: '16px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

export interface TerminalSectionContentProps {
  draft: AppConfig;
  onChange: SettingsChangeHandler;
  platform: NodeJS.Platform;
}

export interface FontSizeSectionProps {
  fontSize: number;
  onChange: (value: number) => void;
}

export interface ShellSectionProps {
  shell: string;
  presets: ShellPreset[];
  onChange: (value: string) => void;
}

export interface PromptSectionProps {
  customPrompt: string;
  preview: string;
  promptPreset: PromptPreset;
  onCustomPromptChange: (value: string) => void;
  onPresetChange: (value: PromptPreset) => void;
}

export function FontSizeResetButton({
  fontSize,
  onReset,
}: {
  fontSize: number;
  onReset: () => void;
}): React.ReactElement<any> | null {
  if (fontSize === DEFAULT_FONT_SIZE) {
    return null;
  }
  return (
    <button
      onClick={onReset}
      className="text-text-semantic-muted"
      style={{
        marginLeft: '8px',
        padding: '4px 8px',
        borderRadius: '4px',
        border: '1px solid var(--border-default)',
        background: 'transparent',
        fontSize: '11px',
        cursor: 'pointer',
      }}
    >
      Reset
    </button>
  );
}
