/**
 * SettingsPanel.tsx — Inline settings panel for the centre pane.
 */

import React, { useEffect, useRef, useState } from 'react';

import { OPEN_SETTINGS_PANEL_EVENT } from '../../hooks/appEventNames';
import { useConfig } from '../../hooks/useConfig';
import { searchEntries } from './searchHelpers';
import type { SettingsEntry } from './settingsEntries';
import { cancelButtonStyle, saveButtonStyle } from './settingsModalStyles';
import { SettingsSearchInput } from './SettingsSearchInput';
import { SettingsSearchResults } from './SettingsSearchResults';
import { SettingsTabBar } from './SettingsTabBar';
import { SettingsTabContent } from './SettingsTabContent';
import {
  getDefaultSubTab,
  getMainTabForSubTab,
  type MainTabId,
  type TabId,
  TABS,
} from './settingsTabs';
import { useSettingsDraft } from './useSettingsDraft';

export interface SettingsPanelProps {
  onClose: () => void;
}

function useSettingsPanelState(onClose: () => void) {
  const { config } = useConfig();
  const api = useSettingsDraft();
  const [activeMainTab, setActiveMainTab] = useState<MainTabId>('general');
  const [activeSubTab, setActiveSubTab] = useState<TabId>('general');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useSnapshotEffect(config, api);
  useExternalChangeEffect(api.setDraft);
  useOpenSettingsTabEvent(setActiveMainTab, setActiveSubTab);

  const handleMainTabChange = (main: MainTabId): void => {
    setActiveMainTab(main);
    setActiveSubTab(getDefaultSubTab(main));
  };

  const handleResultClick = (entry: SettingsEntry): void => {
    const sub = entry.section as TabId;
    setSearchQuery('');
    setActiveMainTab(getMainTabForSubTab(sub));
    setActiveSubTab(sub);
  };

  return {
    api, activeMainTab, activeSubTab, handleMainTabChange,
    setActiveSubTab: (sub: TabId) => setActiveSubTab(sub),
    searchQuery, setSearchQuery, searchInputRef, handleResultClick,
    doCancel: () => api.handleCancel(onClose),
    doSave: () => void api.handleSave(),
  };
}

export function SettingsPanel({ onClose }: SettingsPanelProps): React.ReactElement | null {
  const s = useSettingsPanelState(onClose);
  const isSearching = s.searchQuery.trim().length > 0;

  if (!s.api.draft) return null;

  return (
    <div style={panelStyle}>
      <SettingsSearchInput inputRef={s.searchInputRef} value={s.searchQuery} onChange={s.setSearchQuery} />
      {!isSearching && (
        <SettingsTabBar
          activeMainTab={s.activeMainTab}
          activeSubTab={s.activeSubTab}
          onMainTabChange={s.handleMainTabChange}
          onSubTabChange={s.setActiveSubTab}
        />
      )}
      {isSearching ? (
        <SettingsPanelSearchView query={s.searchQuery} onResultClick={s.handleResultClick} />
      ) : (
        <SettingsPanelTabView activeTab={s.activeSubTab} api={s.api} />
      )}
      <PanelFooter isSaving={s.api.isSaving} saveError={s.api.saveError} onCancel={s.doCancel} onSave={s.doSave} />
    </div>
  );
}

function SettingsPanelSearchView({ query, onResultClick }: { query: string; onResultClick: (e: SettingsEntry) => void }): React.ReactElement {
  return (
    <div style={contentScrollStyle}>
      <SettingsSearchResults searchQuery={query} searchResults={searchEntries(query)} onResultClick={onResultClick} />
    </div>
  );
}

function SettingsPanelTabView({ activeTab, api }: { activeTab: TabId; api: ReturnType<typeof useSettingsDraft> }): React.ReactElement {
  return (
    <div style={tabContentStyle}>
      <SettingsTabContent activeTab={activeTab} draft={api.draft!} onChange={api.handleChange} onImport={api.handleImport} onPreviewTheme={api.handlePreviewTheme} />
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function PanelFooter({
  isSaving,
  saveError,
  onCancel,
  onSave,
}: {
  isSaving: boolean;
  saveError: string | null;
  onCancel: () => void;
  onSave: () => void;
}): React.ReactElement {
  return (
    <div style={footerStyle}>
      {saveError && (
        <span role="alert" className="text-status-error" style={{ flex: 1, fontSize: '12px' }}>
          {saveError}
        </span>
      )}
      <button
        onClick={onCancel}
        disabled={isSaving}
        className="text-text-semantic-secondary"
        style={cancelButtonStyle}
      >
        Cancel
      </button>
      <button onClick={onSave} disabled={isSaving} style={saveButtonStyle(isSaving)}>
        {isSaving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}

// ── Effects ─────────────────────────────────────────────────────────────────

const VALID_TAB_IDS = new Set<string>(TABS.map((t) => t.id));

function extractTabFromDetail(detail: unknown): TabId | null {
  if (typeof detail === 'string' && VALID_TAB_IDS.has(detail)) return detail as TabId;
  if (detail && typeof detail === 'object' && 'tab' in detail) {
    const tab = (detail as { tab: unknown }).tab;
    if (typeof tab === 'string' && VALID_TAB_IDS.has(tab)) return tab as TabId;
  }
  return null;
}

function useOpenSettingsTabEvent(
  setActiveMainTab: React.Dispatch<React.SetStateAction<MainTabId>>,
  setActiveSubTab: React.Dispatch<React.SetStateAction<TabId>>,
): void {
  useEffect(() => {
    function handler(e: Event): void {
      const sub = extractTabFromDetail((e as CustomEvent).detail);
      if (sub) {
        setActiveMainTab(getMainTabForSubTab(sub));
        setActiveSubTab(sub);
      }
    }
    window.addEventListener(OPEN_SETTINGS_PANEL_EVENT, handler);
    return () => window.removeEventListener(OPEN_SETTINGS_PANEL_EVENT, handler);
  }, [setActiveMainTab, setActiveSubTab]);
}

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
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: 'var(--surface-base)',
  fontFamily: 'var(--font-ui)',
};

const contentScrollStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '12px 16px',
};

const tabContentStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '24px 24px',
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '10px',
  padding: '14px 20px',
  flexShrink: 0,
  background: 'transparent',
};
