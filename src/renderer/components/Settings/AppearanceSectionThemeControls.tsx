import React, { useState } from 'react';
import type { Theme } from '../../themes';
import type { AppConfig } from '../../types/electron';
import { ToggleSwitch } from './ToggleSwitch';
import { ThemeEditor } from './ThemeEditor';

interface ThemeGridProps {
  activeTheme: AppConfig['activeTheme'];
  displayedThemes: Theme[];
  onThemeClick: (themeId: string) => void;
}

interface ThemeEditorSectionProps {
  activeThemeId: AppConfig['activeTheme'];
  draft: AppConfig;
  editorOpen: boolean;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  onSaveAsCustom: () => void;
  setEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  marginBottom: '12px',
};

const panelStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: '8px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-muted)',
};

const toggleButtonStyle: React.CSSProperties = {
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
};

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div style={sectionLabelStyle}>{children}</div>;
}

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
        color: isActive ? 'var(--accent)' : 'var(--text)',
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
      <span
        aria-hidden="true"
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: 'var(--accent)',
        }}
      />
      Active
    </div>
  );
}

function getThemeCardStyle(isActive: boolean, isFocused: boolean): React.CSSProperties {
  const borderColor = isActive ? 'var(--accent)' : isFocused ? 'var(--accent-hover)' : 'var(--border)';
  const background = isActive
    ? 'color-mix(in srgb, var(--accent) 8%, var(--bg-secondary))'
    : 'var(--bg-secondary)';

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

function ThemeCard({
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

export function ThemeGrid({
  displayedThemes,
  activeTheme,
  onThemeClick,
}: ThemeGridProps): React.ReactElement {
  return (
    <section>
      <SectionLabel>Theme</SectionLabel>
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
            isActive={activeTheme === theme.id}
            onClick={() => onThemeClick(theme.id)}
            theme={theme}
          />
        ))}
      </div>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
        Click a theme to preview it. Changes apply when you save.
      </p>
    </section>
  );
}

export function BackgroundGradientSection({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}): React.ReactElement {
  return (
    <section>
      <SectionLabel>Background Gradient</SectionLabel>
      <div style={panelStyle}>
        <ToggleSwitch
          checked={checked}
          onChange={onChange}
          label="Show background gradient"
          description="Applies a subtle gradient overlay to the main background"
        />
      </div>
    </section>
  );
}

function ThemeEditorHeader({
  editorOpen,
  setEditorOpen,
}: {
  editorOpen: boolean;
  setEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
}): React.ReactElement {
  return (
    <button onClick={() => setEditorOpen((value) => !value)} style={toggleButtonStyle}>
      <div>
        <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>Theme Editor</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
          Customize individual color tokens and save as a custom theme
        </div>
      </div>
      <span
        aria-hidden="true"
        style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          transform: editorOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 150ms ease',
          display: 'inline-block',
        }}
      >
        &#9660;
      </span>
    </button>
  );
}

export function ThemeEditorSection({
  activeThemeId,
  draft,
  editorOpen,
  onChange,
  onSaveAsCustom,
  setEditorOpen,
}: ThemeEditorSectionProps): React.ReactElement {
  return (
    <section>
      <ThemeEditorHeader editorOpen={editorOpen} setEditorOpen={setEditorOpen} />
      {editorOpen ? (
        <div style={{ ...panelStyle, marginTop: '10px', padding: '16px' }}>
          <ThemeEditor
            activeThemeId={activeThemeId}
            draft={draft}
            onChange={onChange}
            onSaveAsCustom={onSaveAsCustom}
          />
        </div>
      ) : null}
    </section>
  );
}
