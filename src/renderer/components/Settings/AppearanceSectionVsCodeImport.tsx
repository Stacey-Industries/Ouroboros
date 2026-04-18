/**
 * AppearanceSectionVsCodeImport.tsx — "Import VS Code Theme" subsection for
 * the Appearance settings pane.
 *
 * Wave 35 Phase C. Shows current override count, an Import button that opens
 * ThemeImportModal, and a Reset Overrides button.
 */

import React, { useState } from 'react';

import { useConfig } from '../../hooks/useConfig';
import type { AppConfig } from '../../types/electron';
import { panelStyle, sectionLabelStyle } from './appearanceThemeControlsStyles';
import { ThemeImportModal } from './ThemeImportModal';

// ── Types ─────────────────────────────────────────────────────────────────────

type ConfigSet = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => Promise<void>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function countOverrides(config: AppConfig | null): number {
  return Object.keys(config?.theming?.customTokens ?? {}).length;
}

function clearOverrides(set: ConfigSet, config: AppConfig | null): void {
  const current = config?.theming ?? {};
  void set('theming', { ...current, customTokens: {} });
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-text-semantic-muted)',
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexShrink: 0,
};

function importButtonStyle(): React.CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: '6px',
    border: 'none',
    background: 'var(--interactive-accent)',
    color: 'var(--text-on-accent)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

function resetButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border-subtle)',
    background: 'transparent',
    color: disabled ? 'var(--text-text-semantic-muted)' : 'var(--text-text-semantic-primary)',
    fontSize: '12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    whiteSpace: 'nowrap',
  };
}

// ── SectionLabel ──────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="text-text-semantic-muted" style={sectionLabelStyle}>
      {children}
    </div>
  );
}

// ── OverrideReadout ───────────────────────────────────────────────────────────

function overrideLabel(count: number): string {
  if (count === 0) return 'No custom token overrides active';
  return count === 1 ? '1 custom token applied' : `${count} custom tokens applied`;
}

// ── AppearanceSectionVsCodeImport ─────────────────────────────────────────────

export function AppearanceSectionVsCodeImport(): React.ReactElement {
  const { config, set } = useConfig();
  const [modalOpen, setModalOpen] = useState(false);

  const overrideCount = countOverrides(config);
  const hasOverrides = overrideCount > 0;

  function handleReset(): void {
    if (!hasOverrides) return;
    clearOverrides(set, config);
  }

  return (
    <section>
      <SectionLabel>VS Code Theme Import</SectionLabel>
      <div style={panelStyle}>
        <div style={rowStyle}>
          <p style={labelStyle}>{overrideLabel(overrideCount)}</p>
          <div style={buttonRowStyle}>
            <button
              disabled={!hasOverrides}
              onClick={handleReset}
              style={resetButtonStyle(!hasOverrides)}
              type="button"
            >
              Reset overrides
            </button>
            <button
              onClick={() => setModalOpen(true)}
              style={importButtonStyle()}
              type="button"
            >
              Import VS Code theme
            </button>
          </div>
        </div>
      </div>

      {modalOpen && <ThemeImportModal onClose={() => setModalOpen(false)} />}
    </section>
  );
}
