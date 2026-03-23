/**
 * SettingsTabBar.tsx — Tab bar for settings sections.
 */

import React from 'react';

import { type TabId,TABS } from './settingsTabs';

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
          onMouseEnter={(e) => {
            if (activeTab !== tab.id) {
              e.currentTarget.style.backgroundColor = 'rgba(128,128,128,0.15)';
              e.currentTarget.style.color = 'var(--text)';
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== tab.id) {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--text-muted)';
            }
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

const barStyle: React.CSSProperties = {
  display: 'flex',
  padding: '0 12px',
  paddingBottom: '6px',
  flexShrink: 0,
  background: 'transparent',
  overflowX: 'auto',
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 12px',
    background: active ? 'rgba(128,128,128,0.15)' : 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: active ? 'var(--text)' : 'var(--text-muted)',
    fontSize: '13px',
    fontWeight: active ? 500 : 400,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'color 150ms ease, background-color 150ms ease',
  };
}
