import React from 'react';
import { cssColorToHex } from './ThemeEditor.model';
import type { ColorToken, ThemeEditorModel } from './ThemeEditor.model';

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const ghostButtonStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: '5px',
  border: '1px solid var(--border)',
  background: 'transparent',
  fontSize: '11px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const accentButtonStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: '5px',
  border: 'none',
  background: 'var(--accent)',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const disabledButtonStyle: React.CSSProperties = {
  ...accentButtonStyle,
  background: 'var(--bg-tertiary)',
  cursor: 'not-allowed',
};

const swatchPreviewStyle: React.CSSProperties = {
  width: '24px',
  height: '24px',
  borderRadius: '5px',
  border: '1px solid rgba(255,255,255,0.15)',
  cursor: 'pointer',
};

const hiddenPickerStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  opacity: 0,
  width: '100%',
  height: '100%',
  cursor: 'pointer',
  padding: 0,
  margin: 0,
  border: 'none',
};

function ThemeEditorHeader({
  hasOverrides,
  onResetAll,
  onSaveAsCustom,
}: {
  hasOverrides: boolean;
  onResetAll: () => void;
  onSaveAsCustom: () => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div className="text-text-semantic-muted" style={sectionLabelStyle}>Color Tokens</div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {hasOverrides ? (
          <button
            onClick={onResetAll}
            className="text-text-semantic-secondary"
            style={ghostButtonStyle}
            title="Reset all colors to theme defaults"
          >
            Reset All
          </button>
        ) : null}
        <button
          onClick={onSaveAsCustom}
          disabled={!hasOverrides}
          className={hasOverrides ? 'text-text-semantic-on-accent' : 'text-text-semantic-muted'}
          style={hasOverrides ? accentButtonStyle : disabledButtonStyle}
          title={hasOverrides ? 'Save current colors as Custom theme' : 'Edit a color first'}
        >
          Save as Custom
        </button>
      </div>
    </div>
  );
}

function ColorSwatchInput({
  effectiveColor,
  label,
  onChange,
}: {
  effectiveColor: string;
  label: string;
  onChange: (newHex: string) => void;
}): React.ReactElement {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ ...swatchPreviewStyle, background: effectiveColor }} />
      <input
        type="color"
        value={cssColorToHex(effectiveColor)}
        onChange={(event) => onChange(event.target.value)}
        aria-label={`Color picker for ${label}`}
        style={hiddenPickerStyle}
      />
    </div>
  );
}

function TokenLabel({
  cssVar,
  isOverridden,
  label,
}: {
  cssVar: string;
  isOverridden: boolean;
  label: string;
}): React.ReactElement {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: '12px',
          color: isOverridden ? 'var(--accent)' : 'var(--text-secondary)',
          fontWeight: isOverridden ? 500 : 400,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      <div
        className="text-text-semantic-muted"
        style={{
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {cssVar}
      </div>
    </div>
  );
}

function ResetTokenButton({
  label,
  onReset,
}: {
  label: string;
  onReset: () => void;
}): React.ReactElement {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onReset}
      onBlur={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-label={`Reset ${label}`}
      title="Reset to default"
      style={{
        flexShrink: 0,
        width: '20px',
        height: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '4px',
        border: 'none',
        background: 'transparent',
        color: isHovered ? 'var(--error)' : 'var(--text-muted)',
        fontSize: '12px',
        cursor: 'pointer',
        lineHeight: 1,
      }}
    >
      &#8634;
    </button>
  );
}

function getTokenRowStyle(overridden: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 10px',
    borderRadius: '6px',
    background: overridden
      ? 'color-mix(in srgb, var(--accent) 6%, var(--bg-secondary))'
      : 'var(--bg-secondary)',
    border: `1px solid ${overridden ? 'color-mix(in srgb, var(--accent) 30%, var(--border))' : 'var(--border-muted)'}`,
    transition: 'background 120ms ease, border-color 120ms ease',
  };
}

function ColorTokenRow({
  getEffectiveColor,
  isOverridden,
  onColorChange,
  onResetToken,
  token,
}: {
  getEffectiveColor: ThemeEditorModel['getEffectiveColor'];
  isOverridden: ThemeEditorModel['isOverridden'];
  onColorChange: ThemeEditorModel['onColorChange'];
  onResetToken: ThemeEditorModel['onResetToken'];
  token: ColorToken;
}): React.ReactElement {
  const overridden = isOverridden(token);
  const effectiveColor = getEffectiveColor(token);

  return (
    <div style={getTokenRowStyle(overridden)}>
      <ColorSwatchInput
        effectiveColor={effectiveColor}
        label={token.label}
        onChange={(newHex) => onColorChange(token, newHex)}
      />
      <TokenLabel cssVar={token.cssVar} isOverridden={overridden} label={token.label} />
      {overridden ? <ResetTokenButton label={token.label} onReset={() => onResetToken(token)} /> : null}
    </div>
  );
}

function ColorTokenGrid({
  getEffectiveColor,
  isOverridden,
  onColorChange,
  onResetToken,
  tokens,
}: Pick<
  ThemeEditorModel,
  'getEffectiveColor' | 'isOverridden' | 'onColorChange' | 'onResetToken' | 'tokens'
>): React.ReactElement {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
      {tokens.map((token) => (
        <ColorTokenRow
          key={token.cssVar}
          getEffectiveColor={getEffectiveColor}
          isOverridden={isOverridden}
          onColorChange={onColorChange}
          onResetToken={onResetToken}
          token={token}
        />
      ))}
    </div>
  );
}

function ThemeEditorHelpText({ hasOverrides }: { hasOverrides: boolean }): React.ReactElement {
  return (
    <p className="text-text-semantic-muted" style={{ fontSize: '11px', margin: 0 }}>
      Click a swatch to pick a color. Changes preview instantly.
      {hasOverrides
        ? ' Click "Save as Custom" to keep them as the Custom theme.'
        : ' Edited tokens are highlighted.'}
    </p>
  );
}

export function ThemeEditorView({
  getEffectiveColor,
  hasOverrides,
  isOverridden,
  onColorChange,
  onResetAll,
  onResetToken,
  onSaveAsCustom,
  tokens,
}: ThemeEditorModel): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <ThemeEditorHeader
        hasOverrides={hasOverrides}
        onResetAll={onResetAll}
        onSaveAsCustom={onSaveAsCustom}
      />
      <ColorTokenGrid
        getEffectiveColor={getEffectiveColor}
        isOverridden={isOverridden}
        onColorChange={onColorChange}
        onResetToken={onResetToken}
        tokens={tokens}
      />
      <ThemeEditorHelpText hasOverrides={hasOverrides} />
    </div>
  );
}
