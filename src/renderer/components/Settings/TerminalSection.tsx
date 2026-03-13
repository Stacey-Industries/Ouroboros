import React, { useEffect, useState } from 'react';
import type { AppConfig } from '../../types/electron';
import { SectionLabel } from './settingsStyles';

interface TerminalSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 24;
const DEFAULT_FONT_SIZE = 14;

const PRESET_LABELS: Record<string, string> = {
  default: 'Default',
  minimal: 'Minimal',
  git: 'Git',
  powerline: 'Powerline',
  custom: 'Custom',
}

const PRESET_PREVIEWS: Record<string, string> = {
  default: '(system default)',
  minimal: '$ ',
  git: 'user@host ~/project:main $ ',
  powerline: ' user  ~/project  ',
  custom: '',
}

const PRESET_ORDER = ['default', 'minimal', 'git', 'powerline', 'custom']

interface ShellPreset {
  label: string
  path: string
  platform: 'win32' | 'darwin' | 'linux' | 'all'
  note?: string
}

const SHELL_PRESETS: ShellPreset[] = [
  // Windows
  { label: 'PowerShell 5', path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', platform: 'win32' },
  { label: 'PowerShell 7', path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', platform: 'win32' },
  { label: 'cmd.exe', path: 'C:\\Windows\\System32\\cmd.exe', platform: 'win32' },
  { label: 'Git Bash', path: 'C:\\Program Files\\Git\\bin\\bash.exe', platform: 'win32' },
  { label: 'WSL', path: 'C:\\Windows\\System32\\wsl.exe', platform: 'win32' },
  // macOS
  { label: 'zsh', path: '/bin/zsh', platform: 'darwin' },
  { label: 'bash', path: '/bin/bash', platform: 'darwin' },
  { label: 'fish', path: '/usr/local/bin/fish', platform: 'darwin', note: '/usr/local/bin/fish' },
  // Linux
  { label: 'bash', path: '/bin/bash', platform: 'linux' },
  { label: 'zsh', path: '/usr/bin/zsh', platform: 'linux' },
  { label: 'fish', path: '/usr/bin/fish', platform: 'linux' },
  { label: 'sh', path: '/bin/sh', platform: 'linux' },
]

const SAMPLE_LINES = [
  '$ claude --version',
  'claude 1.0.0 (build 2025-01-15)',
  '$ npm run dev',
  '> agent-ide@0.1.0 dev',
  '> electron-vite dev',
  '',
  '  vite v5.4.2 dev server running at:',
  '  > Local: http://localhost:5173/',
];

export function TerminalSection({ draft, onChange }: TerminalSectionProps): React.ReactElement {
  const [platform, setPlatform] = useState<string>('win32');

  // Detect platform once for shell preset filtering
  useEffect(() => {
    window.electronAPI.app.getPlatform().then((p) => setPlatform(p));
  }, []);

  // Seed the shell config from the platform default if it's empty
  useEffect(() => {
    if (draft.shell) return;
    window.electronAPI.app.getPlatform().then((p) => {
      let defaultShell: string;
      if (p === 'win32') {
        defaultShell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
      } else if (p === 'darwin') {
        defaultShell = '/bin/zsh';
      } else {
        defaultShell = '/bin/bash';
      }
      onChange('shell', defaultShell);
    });
  }, [draft.shell, onChange]);

  const platformPresets = SHELL_PRESETS.filter((p) => p.platform === platform || p.platform === 'all');

  const fontSize = draft.terminalFontSize ?? DEFAULT_FONT_SIZE;

  function clampFontSize(value: number): number {
    return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, value));
  }

  function handleFontSizeInput(e: React.ChangeEvent<HTMLInputElement>): void {
    const parsed = parseInt(e.target.value, 10);
    if (!isNaN(parsed)) {
      onChange('terminalFontSize', clampFontSize(parsed));
    }
  }

  function increment(): void {
    onChange('terminalFontSize', clampFontSize(fontSize + 1));
  }

  function decrement(): void {
    onChange('terminalFontSize', clampFontSize(fontSize - 1));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Font size */}
      <section>
        <SectionLabel>Terminal Font Size</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Range: {FONT_SIZE_MIN}–{FONT_SIZE_MAX}px. Default: {DEFAULT_FONT_SIZE}px.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <StepButton onClick={decrement} disabled={fontSize <= FONT_SIZE_MIN} label="Decrease font size">
            −
          </StepButton>

          <input
            type="number"
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            value={fontSize}
            onChange={handleFontSizeInput}
            aria-label="Terminal font size"
            style={{
              width: '60px',
              padding: '7px 8px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text)',
              fontSize: '13px',
              textAlign: 'center',
              outline: 'none',
              fontFamily: 'var(--font-mono)',
            }}
          />

          <StepButton onClick={increment} disabled={fontSize >= FONT_SIZE_MAX} label="Increase font size">
            +
          </StepButton>

          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px' }}>px</span>

          {fontSize !== DEFAULT_FONT_SIZE && (
            <button
              onClick={() => onChange('terminalFontSize', DEFAULT_FONT_SIZE)}
              style={{
                marginLeft: '8px',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-muted)',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Reset
            </button>
          )}
        </div>
      </section>

      {/* Default shell */}
      <section>
        <SectionLabel>Default Shell</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Shell executable used for new terminal sessions.
        </p>

        {/* Quick-select presets */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
          {platformPresets.map((preset) => {
            const isActive = draft.shell === preset.path;
            return (
              <button
                key={preset.path}
                onClick={() => onChange('shell', preset.path)}
                title={preset.path}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? 'var(--bg)' : 'var(--text)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-ui)',
                  transition: 'all 0.1s',
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <input
          type="text"
          value={draft.shell ?? ''}
          onChange={(e) => onChange('shell', e.target.value)}
          placeholder="Auto-detected from system"
          aria-label="Default shell path"
          style={{
            width: '100%',
            padding: '7px 10px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg-tertiary)',
            color: 'var(--text)',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
          Click a preset or enter a custom path. Changes apply to new terminal sessions.
        </p>
      </section>

      {/* Shell Prompt */}
      <section>
        <SectionLabel>Shell Prompt</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Select a prompt style or enter a custom PS1. Only applies to POSIX shells (bash, zsh).
        </p>

        {/* Preset toggle group */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
          {PRESET_ORDER.map((preset) => {
            const isActive = (draft.promptPreset ?? 'default') === preset
            return (
              <button
                key={preset}
                onClick={() => onChange('promptPreset', preset)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? 'var(--bg)' : 'var(--text)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-ui)',
                  transition: 'all 0.1s',
                }}
              >
                {PRESET_LABELS[preset]}
              </button>
            )
          })}
        </div>

        {/* Custom PS1 input — shown only when 'custom' is selected */}
        {(draft.promptPreset ?? 'default') === 'custom' && (
          <div style={{ marginBottom: '12px' }}>
            <input
              type="text"
              value={draft.customPrompt ?? ''}
              onChange={(e) => onChange('customPrompt', e.target.value)}
              placeholder="e.g. \\u@\\h \\w $ "
              aria-label="Custom PS1 prompt string"
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Preview box */}
        <div
          aria-label="Prompt preview"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            padding: '8px 12px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.875rem',
            color: 'var(--text)',
            whiteSpace: 'pre',
            overflowX: 'auto',
          }}
        >
          {(draft.promptPreset ?? 'default') === 'custom'
            ? (draft.customPrompt ?? '') || '(empty — will use shell default)'
            : PRESET_PREVIEWS[draft.promptPreset ?? 'default'] ?? '(system default)'}
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
          Changes take effect in new terminal sessions.
        </p>
      </section>

      {/* Live preview */}
      <section>
        <SectionLabel>Preview</SectionLabel>
        <div
          aria-label="Terminal font size preview"
          style={{
            background: 'var(--term-bg, #0c0c0e)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '14px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: `${fontSize}px`,
            color: 'var(--term-fg, #e4e4e7)',
            lineHeight: 1.6,
            overflow: 'hidden',
            maxHeight: '160px',
          }}
        >
          {SAMPLE_LINES.map((line, i) => (
            <div key={i} style={{ whiteSpace: 'pre' }}>
              {line || '\u00a0'}
            </div>
          ))}
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
          Previewing at {fontSize}px
        </p>
      </section>

    </div>
  );
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface StepButtonProps {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}

function StepButton({ onClick, disabled, label, children }: StepButtonProps): React.ReactElement {
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
        border: '1px solid var(--border)',
        background: 'var(--bg-tertiary)',
        color: disabled ? 'var(--text-muted)' : 'var(--text)',
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
