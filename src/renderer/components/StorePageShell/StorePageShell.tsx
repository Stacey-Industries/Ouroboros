/**
 * StorePageShell.tsx — Generic tabbed page shell for Extension and MCP stores.
 * Provides header, tab bar (Browse / Installed), and scrollable content area.
 */

import React from 'react';

import {
  contentScrollStyle,
  refreshButtonStyle,
  shellHeaderStyle,
  shellRootStyle,
  shellSubtitleStyle,
  shellTitleStyle,
  tabBarStyle,
  tabStyle,
} from './storePageShellStyles';

export type StoreTab = 'browse' | 'installed';

export interface StorePageShellProps {
  title: string;
  subtitle: string;
  activeTab: StoreTab;
  onTabChange: (tab: StoreTab) => void;
  onRefresh?: () => void;
  children: React.ReactNode;
}

const TABS: Array<{ id: StoreTab; label: string }> = [
  { id: 'browse', label: 'Browse' },
  { id: 'installed', label: 'Installed' },
];

export function StorePageShell({
  title,
  subtitle,
  activeTab,
  onTabChange,
  onRefresh,
  children,
}: StorePageShellProps): React.ReactElement {
  return (
    <div className="bg-surface-base" style={shellRootStyle}>
      <ShellHeader title={title} subtitle={subtitle} onRefresh={onRefresh} />
      <ShellTabBar activeTab={activeTab} onTabChange={onTabChange} />
      <div style={contentScrollStyle}>{children}</div>
    </div>
  );
}

function ShellHeader({
  title,
  subtitle,
  onRefresh,
}: {
  title: string;
  subtitle: string;
  onRefresh?: () => void;
}): React.ReactElement {
  return (
    <div style={shellHeaderStyle}>
      <div>
        <p className="text-text-semantic-primary" style={shellTitleStyle}>
          {title}
        </p>
        <p className="text-text-semantic-muted" style={shellSubtitleStyle}>
          {subtitle}
        </p>
      </div>
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="text-text-semantic-primary"
          style={refreshButtonStyle}
        >
          Refresh
        </button>
      )}
    </div>
  );
}

function ShellTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: StoreTab;
  onTabChange: (tab: StoreTab) => void;
}): React.ReactElement {
  return (
    <div style={tabBarStyle} role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTab}
          className={
            tab.id === activeTab
              ? 'text-text-semantic-primary'
              : 'text-text-semantic-muted'
          }
          style={tabStyle(tab.id === activeTab)}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
