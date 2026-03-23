import React from 'react';

import type { AppConfig } from '../../types/electron';
import { SectionLabel } from './settingsStyles';
import {
  clampFontSize,
  containerStyle,
  DEFAULT_FONT_SIZE,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  getPlatformPresets,
  getPromptPreview,
  inlineInputStyle,
  PRESET_LABELS,
  PRESET_ORDER,
  PresetButton,
  previewBoxStyle,
  type PromptPreset,
  resolvePromptPreset,
  SAMPLE_LINES,
  sectionHintStyle,
  type SettingsChangeHandler,
  type ShellPreset,
  StepButton,
  terminalPreviewStyle,
  textInputStyle,
} from './terminalSectionShared';

interface TerminalSectionContentProps {
  draft: AppConfig;
  onChange: SettingsChangeHandler;
  platform: NodeJS.Platform;
}

interface FontSizeSectionProps {
  fontSize: number;
  onChange: (value: number) => void;
}

interface ShellSectionProps {
  shell: string;
  presets: ShellPreset[];
  onChange: (value: string) => void;
}

interface PromptSectionProps {
  customPrompt: string;
  preview: string;
  promptPreset: PromptPreset;
  onCustomPromptChange: (value: string) => void;
  onPresetChange: (value: PromptPreset) => void;
}

function FontSizeResetButton({
  fontSize,
  onReset,
}: {
  fontSize: number;
  onReset: () => void;
}): React.ReactElement | null {
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
        border: '1px solid var(--border)',
        background: 'transparent',
        fontSize: '11px',
        cursor: 'pointer',
      }}
    >
      Reset
    </button>
  );
}

function FontSizeControls({ fontSize, onChange }: FontSizeSectionProps): React.ReactElement {
  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const parsed = Number.parseInt(event.target.value, 10);
    if (!Number.isNaN(parsed)) {
      onChange(clampFontSize(parsed));
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <StepButton disabled={fontSize <= FONT_SIZE_MIN} label="Decrease font size" onClick={() => onChange(fontSize - 1)}>
        -
      </StepButton>
      <input
        type="number"
        min={FONT_SIZE_MIN}
        max={FONT_SIZE_MAX}
        value={fontSize}
        onChange={handleInputChange}
        aria-label="Terminal font size"
        className="text-text-semantic-primary"
        style={inlineInputStyle}
      />
      <StepButton disabled={fontSize >= FONT_SIZE_MAX} label="Increase font size" onClick={() => onChange(fontSize + 1)}>
        +
      </StepButton>
      <span className="text-text-semantic-muted" style={{ fontSize: '12px', marginLeft: '4px' }}>px</span>
      <FontSizeResetButton fontSize={fontSize} onReset={() => onChange(DEFAULT_FONT_SIZE)} />
    </div>
  );
}

function FontSizeSection({ fontSize, onChange }: FontSizeSectionProps): React.ReactElement {
  return (
    <section>
      <SectionLabel>Terminal Font Size</SectionLabel>
      <p className="text-text-semantic-muted" style={{ ...sectionHintStyle, marginBottom: '12px' }}>
        Range: {FONT_SIZE_MIN}-{FONT_SIZE_MAX}px. Default: {DEFAULT_FONT_SIZE}px.
      </p>
      <FontSizeControls fontSize={fontSize} onChange={onChange} />
    </section>
  );
}

function ShellPresetButtons({ presets, shell, onChange }: ShellSectionProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
      {presets.map((preset) => (
        <PresetButton
          key={preset.path}
          active={shell === preset.path}
          onClick={() => onChange(preset.path)}
          title={preset.note ?? preset.path}
        >
          {preset.label}
        </PresetButton>
      ))}
    </div>
  );
}

function ShellSection({ shell, presets, onChange }: ShellSectionProps): React.ReactElement {
  return (
    <section>
      <SectionLabel>Default Shell</SectionLabel>
      <p className="text-text-semantic-muted" style={{ ...sectionHintStyle, marginBottom: '10px' }}>
        Shell executable used for new terminal sessions.
      </p>
      <ShellPresetButtons presets={presets} shell={shell} onChange={onChange} />
      <input
        type="text"
        value={shell}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Auto-detected from system"
        aria-label="Default shell path"
        className="text-text-semantic-primary"
        style={textInputStyle}
      />
      <p className="text-text-semantic-muted" style={{ fontSize: '11px', marginTop: '6px' }}>
        Click a preset or enter a custom path. Changes apply to new terminal sessions.
      </p>
    </section>
  );
}

function PromptPresetButtons({
  onPresetChange,
  promptPreset,
}: Pick<PromptSectionProps, 'onPresetChange' | 'promptPreset'>): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
      {PRESET_ORDER.map((preset) => (
        <PresetButton
          key={preset}
          active={promptPreset === preset}
          onClick={() => onPresetChange(preset)}
        >
          {PRESET_LABELS[preset]}
        </PresetButton>
      ))}
    </div>
  );
}

function PromptCustomInput({
  customPrompt,
  onCustomPromptChange,
}: Pick<PromptSectionProps, 'customPrompt' | 'onCustomPromptChange'>): React.ReactElement {
  return (
    <div style={{ marginBottom: '12px' }}>
      <input
        type="text"
        value={customPrompt}
        onChange={(event) => onCustomPromptChange(event.target.value)}
        placeholder="e.g. \\u@\\h \\w $ "
        aria-label="Custom PS1 prompt string"
        className="text-text-semantic-primary"
        style={textInputStyle}
      />
    </div>
  );
}

function PromptSection({
  customPrompt,
  preview,
  promptPreset,
  onCustomPromptChange,
  onPresetChange,
}: PromptSectionProps): React.ReactElement {
  return (
    <section>
      <SectionLabel>Shell Prompt</SectionLabel>
      <p className="text-text-semantic-muted" style={{ ...sectionHintStyle, marginBottom: '12px' }}>
        Select a prompt style or enter a custom PS1. Only applies to POSIX shells (bash, zsh).
      </p>
      <PromptPresetButtons onPresetChange={onPresetChange} promptPreset={promptPreset} />
      {promptPreset === 'custom' && (
        <PromptCustomInput
          customPrompt={customPrompt}
          onCustomPromptChange={onCustomPromptChange}
        />
      )}
      <div aria-label="Prompt preview" className="text-text-semantic-primary" style={previewBoxStyle}>
        {preview}
      </div>
      <p className="text-text-semantic-muted" style={{ fontSize: '11px', marginTop: '6px' }}>
        Changes take effect in new terminal sessions.
      </p>
    </section>
  );
}

function PreviewSection({ fontSize }: { fontSize: number }): React.ReactElement {
  return (
    <section>
      <SectionLabel>Preview</SectionLabel>
      <div
        aria-label="Terminal font size preview"
        style={{ ...terminalPreviewStyle, fontSize: `${fontSize}px` }}
      >
        {SAMPLE_LINES.map((line, index) => (
          <div key={index} style={{ whiteSpace: 'pre' }}>
            {line || '\u00a0'}
          </div>
        ))}
      </div>
      <p className="text-text-semantic-muted" style={{ fontSize: '11px', marginTop: '6px' }}>
        Previewing at {fontSize}px
      </p>
    </section>
  );
}

export { getDefaultShellForPlatform } from './terminalSectionShared';

export function TerminalSectionContent({
  draft,
  onChange,
  platform,
}: TerminalSectionContentProps): React.ReactElement {
  const fontSize = draft.terminalFontSize ?? DEFAULT_FONT_SIZE;
  const promptPreset = resolvePromptPreset(draft.promptPreset);

  return (
    <div style={containerStyle}>
      <FontSizeSection
        fontSize={fontSize}
        onChange={(value) => onChange('terminalFontSize', clampFontSize(value))}
      />
      <ShellSection
        shell={draft.shell ?? ''}
        presets={getPlatformPresets(platform)}
        onChange={(value) => onChange('shell', value)}
      />
      <PromptSection
        customPrompt={draft.customPrompt ?? ''}
        preview={getPromptPreview(promptPreset, draft.customPrompt ?? '')}
        promptPreset={promptPreset}
        onCustomPromptChange={(value) => onChange('customPrompt', value)}
        onPresetChange={(value) => onChange('promptPreset', value)}
      />
      <PreviewSection fontSize={fontSize} />
    </div>
  );
}
