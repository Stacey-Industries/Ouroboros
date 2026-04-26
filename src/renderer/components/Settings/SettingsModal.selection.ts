import { type Dispatch, type MutableRefObject, type RefObject, type SetStateAction,useRef, useState } from 'react';

import {
  getMainTabForSubTab,
  type MainTabId,
  type TabId,
  TABS,
} from './settingsTabs';
import type { SettingsDraftApi } from './useSettingsDraft';

export interface SettingsModalSelection {
  activeMainTab: MainTabId;
  activeSubTab: TabId;
  cancelRef: MutableRefObject<() => void>;
  isMounted: boolean;
  isVisible: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setActiveMainTab: Dispatch<SetStateAction<MainTabId>>;
  setActiveSubTab: Dispatch<SetStateAction<TabId>>;
  setIsMounted: Dispatch<SetStateAction<boolean>>;
  setIsVisible: Dispatch<SetStateAction<boolean>>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
}

export function resolveTab(initialTab: string): { mainTab: MainTabId; subTab: TabId } {
  const sub = (TABS.some((tab) => tab.id === initialTab) ? initialTab : 'general') as TabId;
  return { mainTab: getMainTabForSubTab(sub), subTab: sub };
}

export function useSettingsModalSelection(
  api: SettingsDraftApi,
  onClose: () => void,
  initialTab: string,
): SettingsModalSelection {
  const resolved = resolveTab(initialTab);
  const [activeMainTab, setActiveMainTab] = useState<MainTabId>(resolved.mainTab);
  const [activeSubTab, setActiveSubTab] = useState<TabId>(resolved.subTab);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const cancelRef = useRef<() => void>(() => undefined);

  cancelRef.current = () => api.handleCancel(onClose);

  return {
    activeMainTab,
    activeSubTab,
    cancelRef,
    isMounted,
    isVisible,
    searchInputRef,
    searchQuery,
    setActiveMainTab,
    setActiveSubTab,
    setIsMounted,
    setIsVisible,
    setSearchQuery,
  };
}
