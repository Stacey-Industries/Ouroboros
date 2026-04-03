/**
 * AppearanceSectionThemeCard.tsx — ThemeCard and its sub-components.
 * Split from AppearanceSectionThemeControls.tsx to keep both files under 300 lines.
 */

import React, { useState } from 'react';

import type { Theme } from '../../themes';

function ThemeCardSwatches({ theme }: { theme: Theme }): React.ReactElement {
  const swatchColors = [
    theme.colors.bg,
    theme.colors.bgSecondary,
    theme.colors.accent,
    theme.colors.text,
    theme.colors.success,
  ];
  return (
    <div
      style={{
        display: 'flex',
        height: '24px',
        borderRadius: '4px',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {swatchColors.map((color, index) => (
        <div key={`${theme.id}-${index}`} style={{ flex: 1, backgroundColor: color }} />
      ))}
    </div>
  );
}

function ThemeCardName({
  isActive,
  name,
}: {
  isActive: boolean;
  name: string;
}): React.ReactElement {
  return (
    <div
      style={{
        fontSize: '12px',
        fontWeight: isActive ? 600 : 400,
        color: isActive ? 'var(--interactive-accent)' : 'var(--text-primary)',
        lineHeight: 1.3,
      }}
    >
      {name}
    </div>
  );
}

function ThemeCardStatus(): React.ReactElement {
  return (
    <div
      className="text-interactive-accent"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '10px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: 'var(--interactive-accent)',
        }}
      />
      Active
    </div>
  );
}

function getThemeCardStyle(isActive: boolean, isFocused: boolean): React.CSSProperties {
  const borderColor = isActive
    ? 'var(--interactive-accent)'
    : isFocused
      ? 'var(--interactive-hover)'
      : 'var(--border-default)';
  const background = isActive
    ? 'color-mix(in srgb, var(--interactive-accent) 8%, var(--surface-panel))'
    : 'var(--surface-panel)';
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    borderRadius: '8px',
    border: `2px solid ${borderColor}`,
    background,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 150ms ease, background 150ms ease',
    outline: 'none',
    width: '100%',
  };
}

export function ThemeCard({
  theme,
  isActive,
  onClick,
}: {
  theme: Theme;
  isActive: boolean;
  onClick: () => void;
}): React.ReactElement {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <button
      onClick={onClick}
      onBlur={() => setIsFocused(false)}
      onFocus={() => setIsFocused(true)}
      aria-label={`Theme: ${theme.name}`}
      aria-pressed={isActive}
      style={getThemeCardStyle(isActive, isFocused)}
    >
      <ThemeCardSwatches theme={theme} />
      <ThemeCardName isActive={isActive} name={theme.name} />
      {isActive ? <ThemeCardStatus /> : null}
    </button>
  );
}
