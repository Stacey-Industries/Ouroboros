import React from 'react';
import { createPortal } from 'react-dom';

import type { AppConfig } from '../../types/electron';
import type { SearchMatch } from './searchHelpers';
import type { SettingsEntry } from './settingsEntries';
import { ModalCard, ModalOverlay } from './SettingsModalFrame';
import { cancelButtonStyle, KEYFRAMES, saveButtonStyle } from './settingsModalStyles';
import { SettingsSearchInput } from './SettingsSearchInput';
import { SettingsSearchResults } from './SettingsSearchResults';
import { SettingsTabBar } from './SettingsTabBar';
import { SettingsTabContent } from './SettingsTabContent';
import type { TabId } from './settingsTabs';

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
  searchResults: SearchMatch[];
  setActiveTab: (tab: TabId) => void;
  setSearchQuery: (query: string) => void;
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
  searchResults: SearchMatch[];
}

function CloseButton({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
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
        borderBottom: '1px solid var(--border-default)',
        flexShrink: 0,
      }}
    >
      <h2
        className="text-text-semantic-primary"
        style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}
      >
        Settings
      </h2>
      <CloseButton onClose={onClose} />
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
}: Pick<
  ModalContentProps,
  'activeTab' | 'draft' | 'onChange' | 'onImport' | 'onPreviewTheme'
>): React.ReactElement {
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
  return props.isSearching ? (
    <SearchResultsPanel
      onResultClick={props.onResultClick}
      searchQuery={props.searchQuery}
      searchResults={props.searchResults}
    />
  ) : (
    <TabContentPanel
      activeTab={props.activeTab}
      draft={props.draft}
      onChange={props.onChange}
      onImport={props.onImport}
      onPreviewTheme={props.onPreviewTheme}
    />
  );
}

function FooterButtons({
  isSaving,
  onCancel,
  onSave,
}: {
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
}): React.ReactElement {
  return (
    <>
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
    </>
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
        borderTop: '1px solid var(--border-default)',
        flexShrink: 0,
        background: 'var(--surface-panel)',
      }}
    >
      {saveError && (
        <span role="alert" className="text-status-error" style={{ flex: 1, fontSize: '12px' }}>
          {saveError}
        </span>
      )}
      <FooterButtons isSaving={isSaving} onCancel={onCancel} onSave={onSave} />
    </div>
  );
}

function ModalSearchAndNav({
  activeTab,
  isSearching,
  searchInputRef,
  searchQuery,
  setActiveTab,
  setSearchQuery,
}: Pick<
  SettingsModalPortalProps,
  'activeTab' | 'isSearching' | 'searchInputRef' | 'searchQuery' | 'setActiveTab' | 'setSearchQuery'
>): React.ReactElement {
  return (
    <>
      <SettingsSearchInput
        inputRef={searchInputRef}
        value={searchQuery}
        onChange={setSearchQuery}
      />
      {!isSearching && <SettingsTabBar activeTab={activeTab} onTabChange={setActiveTab} />}
    </>
  );
}

function ModalBody(props: SettingsModalPortalProps): React.ReactElement {
  return (
    <>
      <ModalSearchAndNav
        activeTab={props.activeTab}
        isSearching={props.isSearching}
        searchInputRef={props.searchInputRef}
        searchQuery={props.searchQuery}
        setActiveTab={props.setActiveTab}
        setSearchQuery={props.setSearchQuery}
      />
      <ModalContent
        activeTab={props.activeTab}
        draft={props.draft}
        isSearching={props.isSearching}
        onChange={props.onChange}
        onImport={props.onImport}
        onPreviewTheme={props.onPreviewTheme}
        onResultClick={props.onResultClick}
        searchQuery={props.searchQuery}
        searchResults={props.searchResults}
      />
    </>
  );
}

function ModalMain(props: SettingsModalPortalProps): React.ReactElement {
  return (
    <>
      <ModalHeader onClose={props.onCancel} />
      <ModalBody {...props} />
      <ModalFooter
        isSaving={props.isSaving}
        onCancel={props.onCancel}
        onSave={props.onSave}
        saveError={props.saveError}
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
