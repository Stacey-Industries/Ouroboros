/**
 * SettingsPanel.tsx — Inline settings panel for the centre pane.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useConfig } from '../../hooks/useConfig';
import { useSettingsDraft } from './useSettingsDraft';
import type { TabId } from './settingsTabs';
import { searchEntries } from './searchHelpers';
import type { SettingsEntry } from './settingsEntries';
import { SettingsSearchInput } from './SettingsSearchInput';
import { SettingsSearchResults } from './SettingsSearchResults';
import { SettingsTabBar } from './SettingsTabBar';
import { SettingsTabContent } from './SettingsTabContent';
import { cancelButtonStyle, saveButtonStyle } from './settingsModalStyles';

export interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps): React.ReactElement | null {
  const { config } = useConfig();
  const api = useSettingsDraft();

  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isSearching = searchQuery.trim().length > 0;
  const searchResults = searchEntries(searchQuery);

  useSnapshotEffect(config, api);
  useExternalChangeEffect(api.setDraft);

  if (!api.draft) return null;

  const doCancel = (): void => api.handleCancel(onClose);
  const doSave = (): void => void api.handleSave(onClose);

  const handleResultClick = (entry: SettingsEntry): void => {
    setSearchQuery('');
    setActiveTab(entry.section as TabId);
  };

  return (
    <div style={panelStyle}>
      <PanelHeader onClose={doCancel} />
      <SettingsSearchInput inputRef={searchInputRef} value={searchQuery} onChange={setSearchQuery} />
      {!isSearching && <SettingsTabBar activeTab={activeTab} onTabChange={setActiveTab} />}

      {isSearching ? (
        <div style={contentScrollStyle}>
          <SettingsSearchResults searchQuery={searchQuery} searchResults={searchResults} onResultClick={handleResultClick} />
        </div>
      ) : (
        <div style={tabContentStyle}>
          <SettingsTabContent activeTab={activeTab} draft={api.draft} onChange={api.handleChange} onImport={api.handleImport} onPreviewTheme={api.handlePreviewTheme} />
        </div>
      )}

      <PanelFooter isSaving={api.isSaving} saveError={api.saveError} onCancel={doCancel} onSave={doSave} />
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function PanelHeader({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>Settings</h2>
      <button onClick={onClose} aria-label="Close settings" style={closeButtonStyle}>×</button>
    </div>
  );
}

function PanelFooter({ isSaving, saveError, onCancel, onSave }: {
  isSaving: boolean; saveError: string | null; onCancel: () => void; onSave: () => void;
}): React.ReactElement {
  return (
    <div style={footerStyle}>
      {saveError && <span role="alert" style={{ flex: 1, fontSize: '12px', color: 'var(--error)' }}>{saveError}</span>}
      <button onClick={onCancel} disabled={isSaving} style={cancelButtonStyle}>Cancel</button>
      <button onClick={onSave} disabled={isSaving} style={saveButtonStyle(isSaving)}>{isSaving ? 'Saving...' : 'Save'}</button>
    </div>
  );
}

// ── Effects ─────────────────────────────────────────────────────────────────

function useSnapshotEffect(
  config: ReturnType<typeof useConfig>['config'],
  api: ReturnType<typeof useSettingsDraft>,
): void {
  useEffect(() => {
    if (config) {
      api.setDraft({ ...config });
      api.originalThemeRef.current = config.activeTheme;
      api.originalGradientRef.current = config.showBgGradient ?? true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);
}

function useExternalChangeEffect(
  setDraft: React.Dispatch<React.SetStateAction<import('../../types/electron').AppConfig | null>>,
): void {
  useEffect(() => {
    const cleanup = window.electronAPI.config.onExternalChange((c) => {
      setDraft({ ...c });
    });
    return cleanup;
  }, [setDraft]);
}

// ── Styles ──────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', height: '100%',
  background: 'var(--bg)', fontFamily: 'var(--font-ui)',
};

const contentScrollStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: '12px 16px',
};

const tabContentStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: '24px 24px',
};

const closeButtonStyle: React.CSSProperties = {
  width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: '6px', border: 'none', background: 'transparent',
  color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', lineHeight: 1,
};

const footerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
  gap: '10px', padding: '14px 20px', borderTop: '1px solid var(--border)',
  flexShrink: 0, background: 'var(--bg-secondary)',
};
