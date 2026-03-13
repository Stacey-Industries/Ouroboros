/**
 * SettingsTabBar.tsx — Tab bar for settings sections.
 */

import React from 'react';
import { TABS, type TabId } from './settingsTabs';

interface SettingsTabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function SettingsTabBar({
  activeTab,
  onTabChange,
}: SettingsTabBarProps): React.ReactElement {
  return (
    <div role="tablist" style={barStyle}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
          style={tabStyle(activeTab === tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

const barStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--border)',
  padding: '0 12px',
  flexShrink: 0,
  background: 'var(--bg-secondary)',
  overflowX: 'auto',
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '10px 14px',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    color: active ? 'var(--text)' : 'var(--text-muted)',
    fontSize: '13px',
    fontWeight: active ? 500 : 400,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    marginBottom: '-1px',
    transition: 'color 150ms ease, border-color 150ms ease',
  };
}
