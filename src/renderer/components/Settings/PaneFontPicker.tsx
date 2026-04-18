/**
 * PaneFontPicker.tsx — Per-pane font-family settings UI.
 *
 * Three dropdowns: Editor (mono), Chat (ui), Terminal (mono).
 * Writes to config.theming.fonts.*; useTokenOverrides propagates to CSS vars.
 * Wave 35 Phase F.
 */

import React, { useCallback } from 'react';

import { useConfig } from '../../hooks/useConfig';
import { MONO_FONTS, UI_FONTS } from '../../themes/fontPickerOptions';
import type { AppConfig } from '../../types/electron';
import { FontDropdown } from './FontDropdown';

// ── Styles ────────────────────────────────────────────────────────────────────

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.06em', marginBottom: '12px', color: 'var(--text-text-semantic-muted)',
};

const panelStyle: React.CSSProperties = {
  padding: '12px 14px', borderRadius: '8px', background: 'var(--surface-panel)',
  border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px',
};

const dropdownRowStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px',
};

const resetButtonStyle: React.CSSProperties = {
  padding: '5px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)',
  background: 'transparent', color: 'var(--text-text-semantic-primary)',
  fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap', alignSelf: 'flex-end',
};

// ── Types ─────────────────────────────────────────────────────────────────────

type ConfigSet = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => Promise<void>;
type Theming = AppConfig['theming'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function patchFonts(
  set: ConfigSet,
  theming: Theming,
  patch: Partial<NonNullable<NonNullable<Theming>['fonts']>>,
): void {
  const fonts = { ...(theming?.fonts ?? {}), ...patch };
  void set('theming', { ...(theming ?? {}), fonts });
}

// ── Model hook ────────────────────────────────────────────────────────────────

function usePaneFontPickerModel() {
  const { config, set } = useConfig();
  const theming = config?.theming;
  const fonts = theming?.fonts ?? {};

  const handleEditorChange = useCallback((value: string) => {
    patchFonts(set, theming, { editor: value });
  }, [set, theming]);

  const handleChatChange = useCallback((value: string) => {
    patchFonts(set, theming, { chat: value });
  }, [set, theming]);

  const handleTerminalChange = useCallback((value: string) => {
    patchFonts(set, theming, { terminal: value });
  }, [set, theming]);

  const handleReset = useCallback(() => {
    void set('theming', { ...(theming ?? {}), fonts: { editor: '', chat: '', terminal: '' } });
  }, [set, theming]);

  return {
    editorFont: fonts.editor ?? '',
    chatFont: fonts.chat ?? '',
    terminalFont: fonts.terminal ?? '',
    handleEditorChange,
    handleChatChange,
    handleTerminalChange,
    handleReset,
  };
}

// ── PaneFontPicker ────────────────────────────────────────────────────────────

export function PaneFontPicker(): React.ReactElement {
  const m = usePaneFontPickerModel();

  return (
    <section data-testid="pane-font-picker">
      <div style={sectionLabelStyle}>Pane Fonts</div>
      <div style={panelStyle}>
        <div style={dropdownRowStyle}>
          <FontDropdown
            label="Editor"
            options={MONO_FONTS}
            value={m.editorFont}
            onChange={m.handleEditorChange}
          />
          <FontDropdown
            label="Chat"
            options={UI_FONTS}
            value={m.chatFont}
            onChange={m.handleChatChange}
          />
          <FontDropdown
            label="Terminal"
            options={MONO_FONTS}
            value={m.terminalFont}
            onChange={m.handleTerminalChange}
          />
        </div>
        <button
          type="button"
          style={resetButtonStyle}
          onClick={m.handleReset}
          data-testid="font-reset-btn"
        >
          Reset to defaults
        </button>
      </div>
    </section>
  );
}
