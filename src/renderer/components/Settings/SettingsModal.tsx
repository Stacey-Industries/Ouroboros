import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConfig } from '../../hooks/useConfig';
import { useSettingsDraft } from './useSettingsDraft';
import { TABS, type TabId } from './settingsTabs';
import { searchEntries } from './searchHelpers';
import type { SettingsEntry } from './settingsEntries';
import { SettingsSearchInput } from './SettingsSearchInput';
import { SettingsSearchResults } from './SettingsSearchResults';
import { SettingsTabBar } from './SettingsTabBar';
import { SettingsTabContent } from './SettingsTabContent';
import { cancelButtonStyle, saveButtonStyle, KEYFRAMES } from './settingsModalStyles';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabId | string;
}

export function SettingsModal({
  isOpen,
  onClose,
  initialTab = 'general',
}: SettingsModalProps): React.ReactElement | null {
  const resolvedTab = resolveTab(initialTab);
  const { config } = useConfig();
  const api = useSettingsDraft();

  const [activeTab, setActiveTab] = useState<TabId>(resolvedTab);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isSearching = searchQuery.trim().length > 0;
  const searchResults = searchEntries(searchQuery);

  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useOpenCloseEffect(isOpen, config, initialTab, api, setActiveTab, setSearchQuery, setIsMounted, setIsVisible);
  useExternalChangeEffect(isOpen, api.setDraft);
  useKeyboardEffect(isOpen, isSearching, searchInputRef, setSearchQuery, () => api.handleCancel(onClose));

  if (!isMounted || !api.draft) return null;

  const doCancel = (): void => api.handleCancel(onClose);
  const doSave = (): void => void api.handleSave(onClose);

  const handleResultClick = (entry: SettingsEntry): void => {
    setSearchQuery('');
    setActiveTab(entry.section as TabId);
  };

  const modal = (
    <>
      <style>{KEYFRAMES}</style>
      <ModalOverlay isVisible={isVisible} onCancel={doCancel}>
        <ModalCard isVisible={isVisible}>
          <ModalHeader onClose={doCancel} />
          <SettingsSearchInput inputRef={searchInputRef} value={searchQuery} onChange={setSearchQuery} />
          {!isSearching && <SettingsTabBar activeTab={activeTab} onTabChange={setActiveTab} />}
          {isSearching ? (
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              <SettingsSearchResults searchQuery={searchQuery} searchResults={searchResults} onResultClick={handleResultClick} />
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px' }}>
              <SettingsTabContent activeTab={activeTab} draft={api.draft} onChange={api.handleChange} onImport={api.handleImport} onPreviewTheme={api.handlePreviewTheme} />
            </div>
          )}
          <ModalFooter isSaving={api.isSaving} saveError={api.saveError} onCancel={doCancel} onSave={doSave} />
        </ModalCard>
      </ModalOverlay>
    </>
  );

  return createPortal(modal, document.body);
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ModalOverlay({ isVisible, onCancel, children }: {
  isVisible: boolean; onCancel: () => void; children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      role="dialog" aria-modal="true" aria-label="Settings"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(2px)', padding: '24px',
        animation: isVisible ? 'settings-overlay-in 180ms ease forwards' : 'settings-overlay-out 180ms ease forwards',
      }}
    >{children}</div>
  );
}

function ModalCard({ isVisible, children }: {
  isVisible: boolean; children: React.ReactNode;
}): React.ReactElement {
  return (
    <div role="document" style={{
      width: '100%', maxWidth: '680px', maxHeight: 'calc(100vh - 48px)',
      display: 'flex', flexDirection: 'column', borderRadius: '10px',
      background: 'var(--bg)', border: '1px solid var(--border)',
      boxShadow: '0 32px 80px rgba(0,0,0,0.7)', overflow: 'hidden',
      animation: isVisible ? 'settings-card-in 180ms ease forwards' : 'settings-card-out 180ms ease forwards',
    }}>{children}</div>
  );
}

function ModalHeader({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>Settings</h2>
      <button onClick={onClose} aria-label="Close settings" style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>×</button>
    </div>
  );
}

function ModalFooter({ isSaving, saveError, onCancel, onSave }: {
  isSaving: boolean; saveError: string | null; onCancel: () => void; onSave: () => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', padding: '14px 20px', borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-secondary)' }}>
      {saveError && <span role="alert" style={{ flex: 1, fontSize: '12px', color: 'var(--error)' }}>{saveError}</span>}
      <button onClick={onCancel} disabled={isSaving} style={cancelButtonStyle}>Cancel</button>
      <button onClick={onSave} disabled={isSaving} style={saveButtonStyle(isSaving)}>{isSaving ? 'Saving...' : 'Save'}</button>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveTab(initialTab: string): TabId {
  return (TABS.some((t) => t.id === initialTab) ? initialTab : 'general') as TabId;
}

// ── Effects (extracted to satisfy max-lines-per-function) ───────────────────

function useOpenCloseEffect(
  isOpen: boolean, config: ReturnType<typeof useConfig>['config'],
  initialTab: string, api: ReturnType<typeof useSettingsDraft>,
  setActiveTab: (t: TabId) => void, setSearchQuery: (q: string) => void,
  setIsMounted: (v: boolean) => void, setIsVisible: (v: boolean) => void,
): void {
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
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setIsMounted(false), 200);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, config, initialTab]);
}

function useExternalChangeEffect(
  isOpen: boolean,
  setDraft: React.Dispatch<React.SetStateAction<import('../../types/electron').AppConfig | null>>,
): void {
  useEffect(() => {
    if (!isOpen) return;
    const cleanup = window.electronAPI.config.onExternalChange((c) => {
      setDraft({ ...c });
    });
    return cleanup;
  }, [isOpen, setDraft]);
}

function useKeyboardEffect(
  isOpen: boolean, isSearching: boolean,
  searchInputRef: React.RefObject<HTMLInputElement | null>,
  setSearchQuery: (q: string) => void, doCancel: () => void,
): void {
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent): void {
      if (!isSearching && e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isSearching) setSearchQuery('');
        else doCancel();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isSearching]);
}
