import React from 'react';
import { createPortal } from 'react-dom';
import type { AppConfig } from '../../types/electron';
import type { SettingsEntry } from './settingsEntries';
import { SettingsSearchInput } from './SettingsSearchInput';
import { SettingsSearchResults } from './SettingsSearchResults';
import { SettingsTabBar } from './SettingsTabBar';
import { SettingsTabContent } from './SettingsTabContent';
import type { TabId } from './settingsTabs';
import { cancelButtonStyle, KEYFRAMES, saveButtonStyle } from './settingsModalStyles';

type SettingsChangeHandler = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;

interface SettingsModalPortalProps {
  activeTab: TabId;
  draft: AppConfig;
  isSaving: boolean;
  isSearching: boolean;
  isVisible: boolean;
  onCancel: () => void;
  onChange: SettingsChangeHandler;
  onImport: (imported: AppConfig) => void;
  onPreviewTheme: (themeId: string) => void;
  onResultClick: (entry: SettingsEntry) => void;
  onSave: () => void;
  saveError: string | null;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchQuery: string;
  searchResults: SettingsEntry[];
  setActiveTab: (tab: TabId) => void;
  setSearchQuery: (query: string) => void;
}

interface ModalFrameProps {
  children: React.ReactNode;
  isVisible: boolean;
  onCancel: () => void;
}

interface ModalContentProps {
  activeTab: TabId;
  draft: AppConfig;
  isSearching: boolean;
  onChange: SettingsChangeHandler;
  onImport: (imported: AppConfig) => void;
  onPreviewTheme: (themeId: string) => void;
  onResultClick: (entry: SettingsEntry) => void;
  searchQuery: string;
  searchResults: SettingsEntry[];
}

function ModalOverlay({
  children,
  isVisible,
  onCancel,
}: ModalFrameProps): React.ReactElement {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(2px)',
        padding: '24px',
        animation: isVisible
          ? 'settings-overlay-in 180ms ease forwards'
          : 'settings-overlay-out 180ms ease forwards',
      }}
    >
      {children}
    </div>
  );
}

function ModalCard({
  children,
  isVisible,
}: Omit<ModalFrameProps, 'onCancel'>): React.ReactElement {
  return (
    <div
      role="document"
      style={{
        width: '100%',
        maxWidth: '680px',
        maxHeight: 'calc(100vh - 48px)',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '10px',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        boxShadow: '0 32px 80px rgba(0, 0, 0, 0.7)',
        overflow: 'hidden',
        animation: isVisible
          ? 'settings-card-in 180ms ease forwards'
          : 'settings-card-out 180ms ease forwards',
      }}
    >
      {children}
    </div>
  );
}

function ModalHeader({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      <h2 className="text-text-semantic-primary" style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
        Settings
      </h2>
      <button
        onClick={onClose}
        aria-label="Close settings"
        className="text-text-semantic-muted"
        style={{
          width: '28px',
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '6px',
          border: 'none',
          background: 'transparent',
          fontSize: '18px',
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        x
      </button>
    </div>
  );
}

function SearchResultsPanel({
  onResultClick,
  searchQuery,
  searchResults,
}: Pick<ModalContentProps, 'onResultClick' | 'searchQuery' | 'searchResults'>): React.ReactElement {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
      <SettingsSearchResults
        searchQuery={searchQuery}
        searchResults={searchResults}
        onResultClick={onResultClick}
      />
    </div>
  );
}

function TabContentPanel({
  activeTab,
  draft,
  onChange,
  onImport,
  onPreviewTheme,
}: Pick<ModalContentProps, 'activeTab' | 'draft' | 'onChange' | 'onImport' | 'onPreviewTheme'>): React.ReactElement {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px' }}>
      <SettingsTabContent
        activeTab={activeTab}
        draft={draft}
        onChange={onChange}
        onImport={onImport}
        onPreviewTheme={onPreviewTheme}
      />
    </div>
  );
}

function ModalContent(props: ModalContentProps): React.ReactElement {
  return props.isSearching
    ? (
        <SearchResultsPanel
          onResultClick={props.onResultClick}
          searchQuery={props.searchQuery}
          searchResults={props.searchResults}
        />
      )
    : (
        <TabContentPanel
          activeTab={props.activeTab}
          draft={props.draft}
          onChange={props.onChange}
          onImport={props.onImport}
          onPreviewTheme={props.onPreviewTheme}
        />
      );
}

function ModalFooter({
  isSaving,
  onCancel,
  onSave,
  saveError,
}: {
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
  saveError: string | null;
}): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '10px',
        padding: '14px 20px',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
        background: 'var(--bg-secondary)',
      }}
    >
      {saveError && (
        <span role="alert" className="text-status-error" style={{ flex: 1, fontSize: '12px' }}>
          {saveError}
        </span>
      )}
      <button onClick={onCancel} disabled={isSaving} className="text-text-semantic-secondary" style={cancelButtonStyle}>
        Cancel
      </button>
      <button onClick={onSave} disabled={isSaving} style={saveButtonStyle(isSaving)}>
        {isSaving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}

function ModalMain({ activeTab, draft, isSaving, isSearching, onCancel, onChange, onImport, onPreviewTheme, onResultClick, onSave, saveError, searchInputRef, searchQuery, searchResults, setActiveTab, setSearchQuery }: SettingsModalPortalProps): React.ReactElement {
  return (
    <>
      <ModalHeader onClose={onCancel} />
      <SettingsSearchInput inputRef={searchInputRef} value={searchQuery} onChange={setSearchQuery} />
      {!isSearching && <SettingsTabBar activeTab={activeTab} onTabChange={setActiveTab} />}
      <ModalContent
        activeTab={activeTab}
        draft={draft}
        isSearching={isSearching}
        onChange={onChange}
        onImport={onImport}
        onPreviewTheme={onPreviewTheme}
        onResultClick={onResultClick}
        searchQuery={searchQuery}
        searchResults={searchResults}
      />
      <ModalFooter
        isSaving={isSaving}
        onCancel={onCancel}
        onSave={onSave}
        saveError={saveError}
      />
    </>
  );
}

export function SettingsModalPortal(props: SettingsModalPortalProps): React.ReactElement {
  return createPortal(
    <>
      <style>{KEYFRAMES}</style>
      <ModalOverlay isVisible={props.isVisible} onCancel={props.onCancel}>
        <ModalCard isVisible={props.isVisible}>
          <ModalMain {...props} />
        </ModalCard>
      </ModalOverlay>
    </>,
    document.body,
  );
}
