import React, { useMemo, useEffect, useState } from 'react';
import { themeList, customTheme } from '../../themes';
import type { Theme } from '../../themes';
import type { AppConfig } from '../../types/electron';
import type { AppTheme } from '../../types/electron';
import { ToggleSwitch } from './ToggleSwitch';
import { ThemeEditor } from './ThemeEditor';

interface AppearanceSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  /** Immediately preview a theme (reverted if user cancels) */
  onPreviewTheme: (themeId: string) => void;
}

export function AppearanceSection({
  draft,
  onChange,
  onPreviewTheme,
}: AppearanceSectionProps): React.ReactElement {
  const [editorOpen, setEditorOpen] = useState(false);

  function handleThemeClick(themeId: string): void {
    onChange('activeTheme', themeId as AppTheme);
    onPreviewTheme(themeId);
  }

  // Build the displayed theme list — append custom when saved colors exist
  const hasCustomColors =
    draft.customThemeColors && Object.keys(draft.customThemeColors).length > 0;
  const displayedThemes: Theme[] = hasCustomColors
    ? [...themeList, customTheme]
    : themeList;

  function handleSaveAsCustom(): void {
    // Switch active theme to custom for preview
    onChange('activeTheme', 'custom');
    onPreviewTheme('custom');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ── Theme Picker ─────────────────────────────────────────── */}
      <section>
        <div style={sectionLabelStyle}>Theme</div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '10px',
          }}
        >
          {displayedThemes.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isActive={draft.activeTheme === theme.id}
              onClick={() => handleThemeClick(theme.id)}
            />
          ))}
        </div>

        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
          Click a theme to preview it. Changes apply when you save.
        </p>
      </section>

      {/* ── Background Gradient ───────────────────────────────────── */}
      <section>
        <div style={sectionLabelStyle}>Background Gradient</div>

        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-muted)',
          }}
        >
          <ToggleSwitch
            checked={draft.showBgGradient ?? true}
            onChange={(v) => onChange('showBgGradient', v)}
            label="Show background gradient"
            description="Applies a subtle gradient overlay to the main background"
          />
        </div>
      </section>

      {/* ── Theme Editor ──────────────────────────────────────────── */}
      <section>
        <button
          onClick={() => setEditorOpen((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-muted)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>
              Theme Editor
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Customize individual color tokens and save as a custom theme
            </div>
          </div>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              transform: editorOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 150ms ease',
              display: 'inline-block',
            }}
          >
            ▼
          </span>
        </button>

        {editorOpen && (
          <div
            style={{
              marginTop: '10px',
              padding: '16px',
              borderRadius: '8px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-muted)',
            }}
          >
            <ThemeEditor
              activeThemeId={draft.activeTheme}
              draft={draft}
              onChange={onChange}
              onSaveAsCustom={handleSaveAsCustom}
            />
          </div>
        )}
      </section>

      {/* ── Custom CSS ────────────────────────────────────────────── */}
      <CustomCSSSection draft={draft} onChange={onChange} />

    </div>
  );
}

// ─── Custom CSS section ────────────────────────────────────────────────────────

interface CustomCSSSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

function CustomCSSSection({ draft, onChange }: CustomCSSSectionProps): React.ReactElement {
  // Local textarea state — only committed to draft on "Apply CSS"
  const [localCSS, setLocalCSS] = useState<string>(draft.customCSS ?? '');
  const [saved, setSaved] = useState(false);

  // Sync local state when the modal reopens with a fresh draft
  useEffect(() => {
    setLocalCSS(draft.customCSS ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.customCSS]);

  // Count approximate rule count for the preview indicator
  const ruleCount = useMemo(() => {
    const css = (draft.customCSS ?? '').trim();
    if (!css) return 0;
    // Count opening braces as a proxy for rule blocks
    return (css.match(/\{/g) ?? []).length;
  }, [draft.customCSS]);

  function handleSave(): void {
    onChange('customCSS', localCSS);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function handleReset(): void {
    setLocalCSS('');
    onChange('customCSS', '');
    setSaved(false);
  }

  return (
    <section>
      <div style={sectionLabelStyle}>Custom CSS</div>

      <div
        style={{
          padding: '14px',
          borderRadius: '8px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-muted)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Inject custom CSS overrides. Changes apply after saving settings.
        </div>

        <textarea
          value={localCSS}
          onChange={(e) => setLocalCSS(e.target.value)}
          placeholder="/* Add custom CSS here */"
          rows={7}
          spellCheck={false}
          style={{
            width: '100%',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '12px',
            lineHeight: 1.6,
            color: 'var(--text)',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '10px 12px',
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Rule count indicator */}
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {ruleCount > 0
              ? `${ruleCount} rule block${ruleCount === 1 ? '' : 's'} active`
              : 'No custom rules active'}
          </span>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleReset}
              style={{
                padding: '5px 12px',
                borderRadius: '5px',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-muted)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Reset
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: '5px 14px',
                borderRadius: '5px',
                border: 'none',
                background: saved ? 'var(--success)' : 'var(--accent)',
                color: 'var(--bg)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 200ms ease',
              }}
            >
              {saved ? 'Saved!' : 'Apply CSS'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Section label ─────────────────────────────────────────────────────────────

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  marginBottom: '12px',
};

// ─── Theme card ───────────────────────────────────────────────────────────────

interface ThemeCardProps {
  theme: Theme;
  isActive: boolean;
  onClick: () => void;
}

function ThemeCard({ theme, isActive, onClick }: ThemeCardProps): React.ReactElement {
  const swatchColors = [
    theme.colors.bg,
    theme.colors.bgSecondary,
    theme.colors.accent,
    theme.colors.text,
    theme.colors.success,
  ];

  return (
    <button
      onClick={onClick}
      aria-pressed={isActive}
      aria-label={`Theme: ${theme.name}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        borderRadius: '8px',
        border: isActive
          ? '2px solid var(--accent)'
          : '2px solid var(--border)',
        background: isActive ? 'color-mix(in srgb, var(--accent) 8%, var(--bg-secondary))' : 'var(--bg-secondary)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 150ms ease, background 150ms ease',
        outline: 'none',
        width: '100%',
      }}
      onFocus={(e) => {
        if (!isActive) e.currentTarget.style.borderColor = 'var(--accent-hover)';
      }}
      onBlur={(e) => {
        if (!isActive) e.currentTarget.style.borderColor = 'var(--border)';
      }}
    >
      {/* Color swatch strip */}
      <div
        style={{
          display: 'flex',
          height: '24px',
          borderRadius: '4px',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {swatchColors.map((color, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              backgroundColor: color,
            }}
          />
        ))}
      </div>

      {/* Theme name */}
      <div
        style={{
          fontSize: '12px',
          fontWeight: isActive ? 600 : 400,
          color: isActive ? 'var(--accent)' : 'var(--text)',
          lineHeight: 1.3,
        }}
      >
        {theme.name}
      </div>

      {/* Active badge */}
      {isActive && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            color: 'var(--accent)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          <span style={{ fontSize: '8px' }}>●</span> Active
        </div>
      )}
    </button>
  );
}
