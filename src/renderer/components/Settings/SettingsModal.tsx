import React, { useEffect, useRef, useState } from 'react';
import { useConfig } from '../../hooks/useConfig';
import type { AppConfig } from '../../types/electron';
import type { SettingsEntry } from './settingsEntries';
import { searchEntries } from './searchHelpers';
import { SettingsModalPortal } from './SettingsModalParts';
import { TABS, type TabId } from './settingsTabs';
import { useSettingsDraft, type SettingsDraftApi } from './useSettingsDraft';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabId | string;
}

export function SettingsModal({ isOpen, onClose, initialTab = 'general' }: SettingsModalProps): React.ReactElement | null {
  const { config } = useConfig();
  const api = useSettingsDraft();
  const [activeTab, setActiveTab] = useState<TabId>(resolveTab(initialTab));
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const cancelRef = useRef<() => void>(() => undefined);
  const isSearching = searchQuery.trim().length > 0;

  cancelRef.current = () => api.handleCancel(onClose);

  useOpenCloseEffect({ config, initialTab, isOpen, api, setActiveTab, setIsMounted, setIsVisible, setSearchQuery });
  useExternalChangeEffect({ isOpen, setDraft: api.setDraft });
  useKeyboardEffect({ isOpen, isSearching, onCancelRef: cancelRef, searchInputRef, setSearchQuery });

  if (!isMounted || !api.draft) return null;

  return (
    <SettingsModalPortal
      activeTab={activeTab}
      draft={api.draft}
      isSaving={api.isSaving}
      isSearching={isSearching}
      isVisible={isVisible}
      onCancel={cancelRef.current}
      onChange={api.handleChange}
      onImport={api.handleImport}
      onPreviewTheme={api.handlePreviewTheme}
      onResultClick={(entry) => handleResultClick(entry, setActiveTab, setSearchQuery)}
      onSave={() => void api.handleSave()}
      saveError={api.saveError}
      searchInputRef={searchInputRef}
      searchQuery={searchQuery}
      searchResults={searchEntries(searchQuery)}
      setActiveTab={setActiveTab}
      setSearchQuery={setSearchQuery}
    />
  );
}

function resolveTab(initialTab: string): TabId {
  return (TABS.some((tab) => tab.id === initialTab) ? initialTab : 'general') as TabId;
}

function handleResultClick(
  entry: SettingsEntry,
  setActiveTab: React.Dispatch<React.SetStateAction<TabId>>,
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>,
): void {
  setSearchQuery('');
  setActiveTab(entry.section as TabId);
}

interface OpenCloseEffectArgs {
  api: SettingsDraftApi;
  config: AppConfig | null;
  initialTab: string;
  isOpen: boolean;
  setActiveTab: React.Dispatch<React.SetStateAction<TabId>>;
  setIsMounted: React.Dispatch<React.SetStateAction<boolean>>;
  setIsVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
}

function useOpenCloseEffect({
  api,
  config,
  initialTab,
  isOpen,
  setActiveTab,
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
      setActiveTab(resolveTab(initialTab));
      setSearchQuery('');
      requestAnimationFrame(() => setIsVisible(true));
      return;
    }

    setIsVisible(false);
    const timer = setTimeout(() => setIsMounted(false), 200);
    return () => clearTimeout(timer);
  }, [api, config, initialTab, isOpen, setActiveTab, setIsMounted, setIsVisible, setSearchQuery]);
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
