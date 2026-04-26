import React, { useCallback, useEffect, useRef } from 'react';

import { useConfig } from '../../hooks/useConfig';
import type { AppConfig } from '../../types/electron';
import { searchEntries } from './searchHelpers';
import type { SettingsEntry } from './settingsEntries';
import { resolveTab, useSettingsModalSelection } from './SettingsModal.selection';
import { SettingsModalPortal } from './SettingsModalParts';
import {
  getDefaultSubTab,
  getMainTabForSubTab,
  type MainTabId,
  type TabId,
} from './settingsTabs';
import { type SettingsDraftApi, useSettingsDraft } from './useSettingsDraft';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabId | string;
}

function useSettingsModalState(isOpen: boolean, onClose: () => void, initialTab: string) {
  const { config } = useConfig();
  const api = useSettingsDraft();
  const controls = useSettingsModalControls(api, onClose, initialTab);
  const isSearching = controls.searchQuery.trim().length > 0;
  useSettingsModalEffects({
    api,
    config,
    initialTab,
    isOpen,
    isSearching,
    onCancelRef: controls.cancelRef,
    searchInputRef: controls.searchInputRef,
    setActiveMainTab: controls.setActiveMainTab,
    setActiveSubTab: controls.setActiveSubTab,
    setIsMounted: controls.setIsMounted,
    setIsVisible: controls.setIsVisible,
    setSearchQuery: controls.setSearchQuery,
  });
  return {
    api,
    activeMainTab: controls.activeMainTab,
    activeSubTab: controls.activeSubTab,
    setActiveSubTab: controls.setActiveSubTab,
    cancelRef: controls.cancelRef,
    isSearching,
    isMounted: controls.isMounted,
    isVisible: controls.isVisible,
    handleMainTabChange: controls.handleMainTabChange,
    handleResultClick: controls.handleResultClick,
    searchInputRef: controls.searchInputRef,
    searchQuery: controls.searchQuery,
    setSearchQuery: controls.setSearchQuery,
  };
}

function useSettingsModalControls(
  api: SettingsDraftApi,
  onClose: () => void,
  initialTab: string,
): {
  activeMainTab: MainTabId;
  activeSubTab: TabId;
  cancelRef: React.MutableRefObject<() => void>;
  handleMainTabChange: (main: MainTabId) => void;
  handleResultClick: (entry: SettingsEntry) => void;
  isMounted: boolean;
  isVisible: boolean;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setActiveMainTab: React.Dispatch<React.SetStateAction<MainTabId>>;
  setActiveSubTab: React.Dispatch<React.SetStateAction<TabId>>;
  setIsMounted: React.Dispatch<React.SetStateAction<boolean>>;
  setIsVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
} {
  const selection = useSettingsModalSelection(api, onClose, initialTab);
  const handleMainTabChange = useCallback((main: MainTabId): void => {
    selection.setActiveMainTab(main);
    selection.setActiveSubTab(getDefaultSubTab(main));
  }, [selection]);
  const handleResultClick = useCallback((entry: SettingsEntry): void => {
    const sub = entry.section as TabId;
    selection.setSearchQuery('');
    selection.setActiveMainTab(getMainTabForSubTab(sub));
    selection.setActiveSubTab(sub);
  }, [selection]);
  return {
    ...selection,
    handleMainTabChange,
    handleResultClick,
  };
}
function useSettingsModalEffects({
  api,
  config,
  initialTab,
  isOpen,
  isSearching,
  onCancelRef,
  searchInputRef,
  setActiveMainTab,
  setActiveSubTab,
  setIsMounted,
  setIsVisible,
  setSearchQuery,
}: OpenCloseEffectArgs & {
  onCancelRef: React.MutableRefObject<() => void>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  isSearching: boolean;
}): void {
  useOpenCloseEffect({
    api,
    config,
    initialTab,
    isOpen,
    setActiveMainTab,
    setActiveSubTab,
    setIsMounted,
    setIsVisible,
    setSearchQuery,
  });
  useExternalChangeEffect({ isOpen, setDraft: api.setDraft });
  useKeyboardEffect({ isOpen, isSearching, onCancelRef, searchInputRef, setSearchQuery });
}

export function SettingsModal({
  isOpen,
  onClose,
  initialTab = 'general',
}: SettingsModalProps): React.ReactElement | null {
  const s = useSettingsModalState(isOpen, onClose, initialTab);
  if (!s.isMounted || !s.api.draft) return null;
  return (
    <SettingsModalPortal
      activeMainTab={s.activeMainTab}
      activeSubTab={s.activeSubTab}
      draft={s.api.draft}
      isSaving={s.api.isSaving}
      isSearching={s.isSearching}
      isVisible={s.isVisible}
      onCancel={s.cancelRef.current}
      onChange={s.api.handleChange}
      onImport={s.api.handleImport}
      onMainTabChange={s.handleMainTabChange}
      onPreviewTheme={s.api.handlePreviewTheme}
      onResultClick={s.handleResultClick}
      onSave={() => void s.api.handleSave()}
      onSubTabChange={s.setActiveSubTab}
      saveError={s.api.saveError}
      searchInputRef={s.searchInputRef}
      searchQuery={s.searchQuery}
      searchResults={searchEntries(s.searchQuery)}
      setSearchQuery={s.setSearchQuery}
    />
  );
}

interface OpenCloseEffectArgs {
  api: SettingsDraftApi;
  config: AppConfig | null;
  initialTab: string;
  isOpen: boolean;
  setActiveMainTab: React.Dispatch<React.SetStateAction<MainTabId>>;
  setActiveSubTab: React.Dispatch<React.SetStateAction<TabId>>;
  setIsMounted: React.Dispatch<React.SetStateAction<boolean>>;
  setIsVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
}

function seedDraftFromConfig(api: SettingsDraftApi, config: AppConfig): void {
  api.setDraft({ ...config });
  api.originalThemeRef.current = config.activeTheme;
  api.originalGradientRef.current = config.showBgGradient ?? true;
}

function useOpenCloseEffect({
  api,
  config,
  initialTab,
  isOpen,
  setActiveMainTab,
  setActiveSubTab,
  setIsMounted,
  setIsVisible,
  setSearchQuery,
}: OpenCloseEffectArgs): void {
  // `api` is rebuilt as a fresh object every render by useSettingsDraft, and
  // `config`/`initialTab` change identity independently. Keying the effect on
  // them caused a setState→rerender→effect loop. Only the `isOpen` transition
  // should run the open/close side effects; everything else is read via refs.
  const apiRef = useRef(api);
  apiRef.current = api;
  const configRef = useRef(config);
  configRef.current = config;
  const initialTabRef = useRef(initialTab);
  initialTabRef.current = initialTab;

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      if (configRef.current) seedDraftFromConfig(apiRef.current, configRef.current);
      const resolved = resolveTab(initialTabRef.current);
      setActiveMainTab(resolved.mainTab);
      setActiveSubTab(resolved.subTab);
      setSearchQuery('');
      const raf = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setIsVisible(false);
    const timer = setTimeout(() => setIsMounted(false), 200);
    return () => clearTimeout(timer);
  }, [isOpen, setActiveMainTab, setActiveSubTab, setIsMounted, setIsVisible, setSearchQuery]);

  useEffect(() => {
    if (!isOpen || !config || apiRef.current.draft) return;
    seedDraftFromConfig(apiRef.current, config);
  }, [isOpen, config]);
}

function useExternalChangeEffect({
  isOpen,
  setDraft,
}: {
  isOpen: boolean;
  setDraft: React.Dispatch<React.SetStateAction<AppConfig | null>>;
}): void {
  useEffect(() => {
    if (!isOpen) return;

    const cleanup = window.electronAPI.config.onExternalChange((config) => {
      setDraft({ ...config });
    });

    return cleanup;
  }, [isOpen, setDraft]);
}

interface KeyboardEffectArgs {
  isOpen: boolean;
  isSearching: boolean;
  onCancelRef: React.MutableRefObject<() => void>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
}

function useKeyboardEffect({
  isOpen,
  isSearching,
  onCancelRef,
  searchInputRef,
  setSearchQuery,
}: KeyboardEffectArgs): void {
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent): void {
      if (!isSearching && event.key === 'f' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        if (isSearching) {
          setSearchQuery('');
        } else {
          onCancelRef.current();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSearching, onCancelRef, searchInputRef, setSearchQuery]);
}
