import React from 'react';

import type { AppConfig } from '../../types/electron';
import {
  containerStyle,
  descriptionStyle,
  inputStyle,
  previewBaseStyle,
  previewLabelStyle,
  rangeInputStyle,
  resetButtonStyle,
  saveNoticeStyle,
  sizeValueStyle,
  sliderRowStyle,
} from './fontSectionStyles';
import { SectionLabel } from './settingsStyles';

interface FontSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

type AppConfigChangeHandler = FontSectionProps['onChange'];

const UI_FONT_SIZE_MIN = 11;
const UI_FONT_SIZE_MAX = 18;
const DEFAULT_UI_FONT_SIZE = 13;

const PREVIEW_TEXT = 'The quick brown fox jumps over the lazy dog';
const UI_PREVIEW_TEXT = '0123456789 - ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MONO_PREVIEW_LINES = [
  'const greeting = "Hello, world!";',
  'function add(a: number, b: number): number {',
  '  return a + b; // => 42',
  '}',
];

export function FontSection({ draft, onChange }: FontSectionProps): React.ReactElement<any> {
  const fontUI = draft.fontUI ?? '';
  const fontMono = draft.fontMono ?? '';
  const fontSizeUI = draft.fontSizeUI ?? DEFAULT_UI_FONT_SIZE;

  return (
    <div style={containerStyle}>
      <FontTextSection
        label="UI Font Family"
        description="Font used for the interface. Leave blank to use the system default."
        value={fontUI}
        configKey="fontUI"
        placeholder="e.g. Inter, Segoe UI, SF Pro Display"
        previewLabel={fontUI || 'system default'}
        previewFontFamily={resolveUIFont(fontUI)}
        previewLines={[PREVIEW_TEXT, UI_PREVIEW_TEXT]}
        ariaLabel="UI font family"
        onChange={onChange}
      />
      <FontTextSection
        label="Monospace Font Family"
        description="Font used for code, file viewer, and terminal UI. Leave blank for the theme default."
        value={fontMono}
        configKey="fontMono"
        placeholder="e.g. JetBrains Mono, Cascadia Code, Fira Code"
        previewLabel={fontMono || 'theme default'}
        previewFontFamily={resolveMonoFont(fontMono)}
        previewLines={MONO_PREVIEW_LINES}
        previewLabelFontFamily="system-ui, sans-serif"
        ariaLabel="Monospace font family"
        onChange={onChange}
      />
      <FontSizeSection fontUI={fontUI} fontSizeUI={fontSizeUI} onChange={onChange} />
    </div>
  );
}

interface FontTextSectionProps {
  label: string;
  description: string;
  value: string;
  configKey: 'fontUI' | 'fontMono';
  placeholder: string;
  previewLabel: string;
  previewFontFamily: string;
  previewLines: readonly string[];
  previewLabelFontFamily?: string;
  ariaLabel: string;
  onChange: AppConfigChangeHandler;
}

function FontTextInput({
  value,
  configKey,
  placeholder,
  ariaLabel,
  onChange,
}: Pick<
  FontTextSectionProps,
  'value' | 'configKey' | 'placeholder' | 'ariaLabel' | 'onChange'
>): React.ReactElement<any> {
  return (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(configKey, event.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className="text-text-semantic-primary"
      style={inputStyle}
      spellCheck={false}
    />
  );
}

function FontTextSection({
  label,
  description,
  value,
  configKey,
  placeholder,
  previewLabel,
  previewFontFamily,
  previewLines,
  previewLabelFontFamily,
  ariaLabel,
  onChange,
}: FontTextSectionProps): React.ReactElement<any> {
  return (
    <section>
      <SectionLabel>{label}</SectionLabel>
      <p className="text-text-semantic-muted" style={descriptionStyle}>
        {description}
      </p>
      <FontTextInput
        value={value}
        configKey={configKey}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        onChange={onChange}
      />
      <PreviewCard
        ariaLabel={`${label} preview`}
        previewLabel={previewLabel}
        fontFamily={previewFontFamily}
        fontSize="14px"
        lineHeight={1.5}
        labelFontFamily={previewLabelFontFamily ?? 'inherit'}
        lines={previewLines}
      />
    </section>
  );
}

interface FontSizeSectionProps {
  fontUI: string;
  fontSizeUI: number;
  onChange: AppConfigChangeHandler;
}

function FontSizeSliderRow({
  fontSizeUI,
  onChange,
}: Pick<FontSizeSectionProps, 'fontSizeUI' | 'onChange'>): React.ReactElement<any> {
  return (
    <div style={sliderRowStyle}>
      <input
        type="range"
        min={UI_FONT_SIZE_MIN}
        max={UI_FONT_SIZE_MAX}
        step={1}
        value={fontSizeUI}
        onChange={(event) => onChange('fontSizeUI', clampSize(parseInt(event.target.value, 10)))}
        aria-label="UI font size slider"
        style={rangeInputStyle}
      />
      <span className="text-text-semantic-primary" style={sizeValueStyle}>
        {fontSizeUI}px
      </span>
      <ResetButton fontSizeUI={fontSizeUI} onChange={onChange} />
    </div>
  );
}

function FontSizeSection({
  fontUI,
  fontSizeUI,
  onChange,
}: FontSizeSectionProps): React.ReactElement<any> {
  return (
    <section>
      <SectionLabel>UI Font Size</SectionLabel>
      <p className="text-text-semantic-muted" style={descriptionStyle}>
        Base font size for the interface ({UI_FONT_SIZE_MIN}-{UI_FONT_SIZE_MAX}px). Default:{' '}
        {DEFAULT_UI_FONT_SIZE}px.
      </p>
      <FontSizeSliderRow fontSizeUI={fontSizeUI} onChange={onChange} />
      <PreviewCard
        previewLabel={`${fontSizeUI}px`}
        fontFamily={resolveUIFont(fontUI)}
        fontSize={`${fontSizeUI}px`}
        lineHeight={1.5}
        lines={[PREVIEW_TEXT]}
      />
      <p className="text-text-semantic-muted" style={saveNoticeStyle}>
        Font size changes apply after Save.
      </p>
    </section>
  );
}

interface PreviewCardProps {
  previewLabel: string;
  fontFamily: string;
  fontSize: string;
  lineHeight: number;
  lines: readonly string[];
  ariaLabel?: string;
  labelFontFamily?: string;
}

function PreviewCard({
  previewLabel,
  fontFamily,
  fontSize,
  lineHeight,
  lines,
  ariaLabel,
  labelFontFamily,
}: PreviewCardProps): React.ReactElement<any> {
  return (
    <div
      aria-label={ariaLabel}
      className="text-text-semantic-secondary"
      style={previewStyle(fontFamily, fontSize, lineHeight)}
    >
      <div
        className="text-text-semantic-muted"
        style={previewLabelStyle(labelFontFamily)}
      >{`Preview (${previewLabel})`}</div>
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

function ResetButton({
  fontSizeUI,
  onChange,
}: {
  fontSizeUI: number;
  onChange: AppConfigChangeHandler;
}): React.ReactElement<any> | null {
  if (fontSizeUI === DEFAULT_UI_FONT_SIZE) {
    return null;
  }

  return (
    <button
      onClick={() => onChange('fontSizeUI', DEFAULT_UI_FONT_SIZE)}
      className="text-text-semantic-muted"
      style={resetButtonStyle}
    >
      Reset
    </button>
  );
}

function clampSize(value: number): number {
  return Math.max(UI_FONT_SIZE_MIN, Math.min(UI_FONT_SIZE_MAX, value));
}

function resolveUIFont(fontUI: string): string {
  return fontUI ? `"${fontUI}", system-ui, sans-serif` : 'system-ui, sans-serif';
}

function resolveMonoFont(fontMono: string): string {
  return fontMono ? `"${fontMono}", monospace` : 'monospace';
}

function previewStyle(
  fontFamily: string,
  fontSize: string,
  lineHeight: number,
): React.CSSProperties {
  return {
    ...previewBaseStyle,
    fontFamily,
    fontSize,
    lineHeight,
  };
}
