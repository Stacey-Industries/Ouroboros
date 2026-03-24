import React from 'react';

import type { Theme } from '../../themes';
import type { AppConfig } from '../../types/electron';
import { ThemeCard } from './AppearanceSectionThemeCard';
import { panelStyle, sectionLabelStyle, toggleButtonStyle } from './appearanceThemeControlsStyles';
import { ThemeEditor } from './ThemeEditor';
import { ToggleSwitch } from './ToggleSwitch';

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

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="text-text-semantic-muted" style={sectionLabelStyle}>
      {children}
    </div>
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
      <p className="text-text-semantic-muted" style={{ fontSize: '11px', marginTop: '10px' }}>
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

function GlassSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          Darken the transparent glass background
        </span>
        <span
          style={{
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
            minWidth: '32px',
            textAlign: 'right',
          }}
        >
          {value}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--interactive-accent)' }}
      />
    </div>
  );
}

export function GlassOpacitySection({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}): React.ReactElement {
  return (
    <section>
      <SectionLabel>Glass Tint</SectionLabel>
      <div style={panelStyle}>
        <GlassSlider value={value} onChange={onChange} />
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
        <div className="text-text-semantic-primary" style={{ fontSize: '13px', fontWeight: 500 }}>
          Theme Editor
        </div>
        <div className="text-text-semantic-muted" style={{ fontSize: '11px', marginTop: '2px' }}>
          Customize individual color tokens and save as a custom theme
        </div>
      </div>
      <span
        aria-hidden="true"
        className="text-text-semantic-muted"
        style={{
          fontSize: '11px',
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
