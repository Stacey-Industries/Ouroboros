/**
 * ThemeEditor — inline color editor for the active theme.
 *
 * Displays each CSS variable token with a native color picker.
 * Changes are applied live to :root and can be saved as a "Custom" theme.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getTheme, customTheme } from '../../themes';
import { applyCustomThemeColors } from '../../hooks/useTheme';
import type { AppConfig } from '../../types/electron';

// ─── Token definitions ────────────────────────────────────────────────────────

interface ColorToken {
  cssVar: string;
  label: string;
  colorKey: keyof typeof customTheme.colors;
}

const COLOR_TOKENS: ColorToken[] = [
  { cssVar: '--bg',            label: 'Background',          colorKey: 'bg' },
  { cssVar: '--bg-secondary',  label: 'Background Secondary', colorKey: 'bgSecondary' },
  { cssVar: '--bg-tertiary',   label: 'Background Tertiary',  colorKey: 'bgTertiary' },
  { cssVar: '--border',        label: 'Border',               colorKey: 'border' },
  { cssVar: '--border-muted',  label: 'Border Muted',         colorKey: 'borderMuted' },
  { cssVar: '--text',          label: 'Text',                 colorKey: 'text' },
  { cssVar: '--text-secondary',label: 'Text Secondary',       colorKey: 'textSecondary' },
  { cssVar: '--text-muted',    label: 'Text Muted',           colorKey: 'textMuted' },
  { cssVar: '--text-faint',    label: 'Text Faint',           colorKey: 'textFaint' },
  { cssVar: '--accent',        label: 'Accent',               colorKey: 'accent' },
  { cssVar: '--accent-hover',  label: 'Accent Hover',         colorKey: 'accentHover' },
  { cssVar: '--success',       label: 'Success',              colorKey: 'success' },
  { cssVar: '--warning',       label: 'Warning',              colorKey: 'warning' },
  { cssVar: '--error',         label: 'Error',                colorKey: 'error' },
  { cssVar: '--purple',        label: 'Purple',               colorKey: 'purple' },
  { cssVar: '--term-bg',       label: 'Terminal Background',  colorKey: 'termBg' },
  { cssVar: '--term-fg',       label: 'Terminal Foreground',  colorKey: 'termFg' },
  { cssVar: '--term-cursor',   label: 'Terminal Cursor',      colorKey: 'termCursor' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert any CSS color to #rrggbb for the <input type="color"> value attribute.
 * Renders onto an offscreen canvas to resolve rgba, named colors, etc.
 */
function cssColorToHex(color: string): string {
  try {
    // Colours with transparency can't be represented in hex — strip alpha
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '#000000';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch {
    return '#000000';
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ThemeEditorProps {
  /** The currently active theme id */
  activeThemeId: string;
  /** Draft config — used to read/write customThemeColors */
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  /** Called when user clicks "Save as Custom" — also switches active theme */
  onSaveAsCustom: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ThemeEditor({
  activeThemeId,
  draft,
  onChange,
  onSaveAsCustom,
}: ThemeEditorProps): React.ReactElement {
  const baseTheme = getTheme(activeThemeId === 'custom' ? 'modern' : activeThemeId);

  // Local color overrides — keyed by cssVar string (e.g. '--bg')
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    // Seed from saved custom colors if editing the custom theme
    return { ...(draft.customThemeColors ?? {}) };
  });

  // Sync overrides to live CSS vars whenever they change
  const pendingRef = useRef<Record<string, string>>({});

  useEffect(() => {
    pendingRef.current = overrides;
    // Apply live
    const colorMap: Record<string, string> = {};
    for (const token of COLOR_TOKENS) {
      const override = overrides[token.cssVar];
      if (override) {
        colorMap[token.cssVar] = override;
      }
    }
    if (Object.keys(colorMap).length > 0) {
      applyCustomThemeColors(colorMap);
    }
  }, [overrides]);

  // Reset overrides when switching base theme
  const prevThemeId = useRef(activeThemeId);
  useEffect(() => {
    if (prevThemeId.current !== activeThemeId) {
      prevThemeId.current = activeThemeId;
      // If switching to a non-custom theme, clear local overrides
      if (activeThemeId !== 'custom') {
        setOverrides({});
      } else {
        setOverrides({ ...(draft.customThemeColors ?? {}) });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThemeId]);

  const getEffectiveColor = useCallback((token: ColorToken): string => {
    return overrides[token.cssVar] ?? baseTheme.colors[token.colorKey] ?? '#000000';
  }, [overrides, baseTheme]);

  function handleColorChange(token: ColorToken, newHex: string): void {
    setOverrides((prev) => ({ ...prev, [token.cssVar]: newHex }));
    // Update draft immediately so it's included on Save
    const updated = { ...(draft.customThemeColors ?? {}), [token.cssVar]: newHex };
    onChange('customThemeColors', updated);
  }

  function handleReset(token: ColorToken): void {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[token.cssVar];
      return next;
    });
    const updated = { ...(draft.customThemeColors ?? {}) };
    delete updated[token.cssVar];
    onChange('customThemeColors', updated);

    // Restore the base theme color live
    document.documentElement.style.setProperty(
      token.cssVar,
      baseTheme.colors[token.colorKey] ?? '',
    );
  }

  function handleResetAll(): void {
    setOverrides({});
    onChange('customThemeColors', {});
    // Restore all base theme colors
    for (const token of COLOR_TOKENS) {
      document.documentElement.style.setProperty(
        token.cssVar,
        baseTheme.colors[token.colorKey] ?? '',
      );
    }
  }

  function handleSaveAsCustom(): void {
    // Commit current overrides to draft and switch theme
    onChange('customThemeColors', { ...overrides });
    onChange('activeTheme', 'custom');
    onSaveAsCustom();
  }

  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
          }}
        >
          Color Tokens
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {hasOverrides && (
            <button
              onClick={handleResetAll}
              style={ghostButtonStyle}
              title="Reset all colors to theme defaults"
            >
              Reset All
            </button>
          )}
          <button
            onClick={handleSaveAsCustom}
            disabled={!hasOverrides}
            style={hasOverrides ? accentButtonStyle : disabledButtonStyle}
            title={hasOverrides ? 'Save current colors as Custom theme' : 'Edit a color first'}
          >
            Save as Custom
          </button>
        </div>
      </div>

      {/* Color token grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
        }}
      >
        {COLOR_TOKENS.map((token) => {
          const effectiveColor = getEffectiveColor(token);
          const hexValue = cssColorToHex(effectiveColor);
          const isOverridden = token.cssVar in overrides;

          return (
            <div
              key={token.cssVar}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 10px',
                borderRadius: '6px',
                background: isOverridden
                  ? 'color-mix(in srgb, var(--accent) 6%, var(--bg-secondary))'
                  : 'var(--bg-secondary)',
                border: `1px solid ${isOverridden ? 'color-mix(in srgb, var(--accent) 30%, var(--border))' : 'var(--border-muted)'}`,
                transition: 'background 120ms ease, border-color 120ms ease',
              }}
            >
              {/* Color picker swatch */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '5px',
                    background: effectiveColor,
                    border: '1px solid rgba(255,255,255,0.15)',
                    cursor: 'pointer',
                  }}
                />
                <input
                  type="color"
                  value={hexValue}
                  onChange={(e) => handleColorChange(token, e.target.value)}
                  aria-label={`Color picker for ${token.label}`}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    width: '100%',
                    height: '100%',
                    cursor: 'pointer',
                    padding: 0,
                    margin: 0,
                    border: 'none',
                  }}
                />
              </div>

              {/* Label */}
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
                  {token.label}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {token.cssVar}
                </div>
              </div>

              {/* Reset individual token */}
              {isOverridden && (
                <button
                  onClick={() => handleReset(token)}
                  aria-label={`Reset ${token.label}`}
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
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    lineHeight: 1,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--error)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  ↺
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
        Click a swatch to pick a color. Changes preview instantly.
        {hasOverrides
          ? ' Click "Save as Custom" to keep them as the Custom theme.'
          : ' Edited tokens are highlighted.'}
      </p>
    </div>
  );
}

// ─── Button styles ────────────────────────────────────────────────────────────

const ghostButtonStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: '5px',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontSize: '11px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const accentButtonStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: '5px',
  border: 'none',
  background: 'var(--accent)',
  color: 'var(--bg)',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const disabledButtonStyle: React.CSSProperties = {
  ...accentButtonStyle,
  background: 'var(--bg-tertiary)',
  color: 'var(--text-muted)',
  cursor: 'not-allowed',
};
