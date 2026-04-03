import React, { useEffect, useRef, useState } from 'react';

import { useConfig } from '../../hooks/useConfig';
import type { AppConfig } from '../../types/electron';
import { searchEntries } from './searchHelpers';
import type { SettingsEntry } from './settingsEntries';
import { SettingsModalPortal } from './SettingsModalParts';
import {
  getDefaultSubTab,
  getMainTabForSubTab,
  type MainTabId,
  type TabId,
  TABS,
} from './settingsTabs';
import { type SettingsDraftApi,useSettingsDraft } from './useSettingsDraft';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabId | string;
}

function useSettingsModalState(isOpen: boolean, onClose: () => void, initialTab: string) {
  const { config } = useConfig();
  const api = useSettingsDraft();
  const resolved = resolveTab(initialTab);
  const [activeMainTab, setActiveMainTab] = useState<MainTabId>(resolved.mainTab);
  const [activeSubTab, setActiveSubTab] = useState<TabId>(resolved.subTab);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const cancelRef = useRef<() => void>(() => undefined);
  cancelRef.current = () => api.handleCancel(onClose);
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
  useOpenCloseEffect({ config, initialTab, isOpen, api, setActiveMainTab, setActiveSubTab, setIsMounted, setIsVisible, setSearchQuery });
  useExternalChangeEffect({ isOpen, setDraft: api.setDraft });
  const isSearching = searchQuery.trim().length > 0;
  useKeyboardEffect({ isOpen, isSearching, onCancelRef: cancelRef, searchInputRef, setSearchQuery });
  return { api, activeMainTab, activeSubTab, setActiveSubTab, cancelRef, isSearching, isMounted, isVisible, handleMainTabChange, handleResultClick, searchInputRef, searchQuery, setSearchQuery };
}

export function SettingsModal({ isOpen, onClose, initialTab = 'general' }: SettingsModalProps): React.ReactElement | null {
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

function resolveTab(initialTab: string): { mainTab: MainTabId; subTab: TabId } {
  const sub = (TABS.some((tab) => tab.id === initialTab) ? initialTab : 'general') as TabId;
  return { mainTab: getMainTabForSubTab(sub), subTab: sub };
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
  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      if (config) {
        api.setDraft({ ...config });
        api.originalThemeRef.current = config.activeTheme;
        api.originalGradientRef.current = config.showBgGradient ?? true;
      }
      const resolved = resolveTab(initialTab);
      setActiveMainTab(resolved.mainTab);
      setActiveSubTab(resolved.subTab);
      setSearchQuery('');
      requestAnimationFrame(() => setIsVisible(true));
      return;
    }

    setIsVisible(false);
    const timer = setTimeout(() => setIsMounted(false), 200);
    return () => clearTimeout(timer);
  }, [api, config, initialTab, isOpen, setActiveMainTab, setActiveSubTab, setIsMounted, setIsVisible, setSearchQuery]);
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
