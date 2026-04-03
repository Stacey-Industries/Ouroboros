/**
 * SettingsTabBar.tsx — Two-level tab bar: main tabs (pill) + subtabs (underline).
 */

import React from 'react';

import {
  getSubTabLabel,
  MAIN_TABS,
  type MainTabId,
  type TabId,
} from './settingsTabs';

interface SettingsTabBarProps {
  activeMainTab: MainTabId;
  activeSubTab: TabId;
  onMainTabChange: (tab: MainTabId) => void;
  onSubTabChange: (tab: TabId) => void;
}

export function SettingsTabBar({
  activeMainTab,
  activeSubTab,
  onMainTabChange,
  onSubTabChange,
}: SettingsTabBarProps): React.ReactElement {
  const activeMain = MAIN_TABS.find((m) => m.id === activeMainTab);
  const subtabs = activeMain?.subtabs ?? [];

  return (
    <div style={wrapperStyle}>
      <MainTabRow
        activeMainTab={activeMainTab}
        onMainTabChange={onMainTabChange}
      />
      {subtabs.length > 1 && (
        <SubTabRow
          subtabs={subtabs}
          activeSubTab={activeSubTab}
          onSubTabChange={onSubTabChange}
        />
      )}
    </div>
  );
}

/* ── Main tab row (pill style) ───────────────────────────── */

function MainTabRow({
  activeMainTab,
  onMainTabChange,
}: {
  activeMainTab: MainTabId;
  onMainTabChange: (tab: MainTabId) => void;
}): React.ReactElement {
  return (
    <div role="tablist" aria-label="Settings categories" style={mainBarStyle}>
      {MAIN_TABS.map((tab) => {
        const active = activeMainTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onMainTabChange(tab.id)}
            style={mainTabStyle(active)}
            onMouseEnter={(e) => {
              if (!active) {
                e.currentTarget.style.backgroundColor =
                  'rgba(128,128,128,0.15)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-muted)';
              }
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Subtab row (underline style) ────────────────────────── */

function SubTabRow({
  subtabs,
  activeSubTab,
  onSubTabChange,
}: {
  subtabs: TabId[];
  activeSubTab: TabId;
  onSubTabChange: (tab: TabId) => void;
}): React.ReactElement {
  return (
    <div role="tablist" aria-label="Settings section" style={subBarStyle}>
      {subtabs.map((id) => {
        const active = activeSubTab === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => onSubTabChange(id)}
            style={subTabStyle(active)}
            onMouseEnter={(e) => {
              if (!active) {
                e.currentTarget.style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                e.currentTarget.style.color = active
                  ? 'var(--text-primary)'
                  : 'var(--text-muted)';
              }
            }}
          >
            {getSubTabLabel(id)}
          </button>
        );
      })}
    </div>
  );
}

/* ── Styles ──────────────────────────────────────────────── */

const wrapperStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
};

const mainBarStyle: React.CSSProperties = {
  display: 'flex',
  padding: '0 12px',
  paddingBottom: '4px',
  background: 'transparent',
  overflowX: 'auto',
  gap: '2px',
};

function mainTabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 12px',
    background: active ? 'rgba(128,128,128,0.15)' : 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    fontSize: '13px',
    fontWeight: active ? 500 : 400,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'color 150ms ease, background-color 150ms ease',
  };
}

const subBarStyle: React.CSSProperties = {
  display: 'flex',
  padding: '0 16px',
  borderBottom: '1px solid var(--border-subtle)',
  background: 'transparent',
  overflowX: 'auto',
  gap: '0px',
};

function subTabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    background: 'transparent',
    border: 'none',
    borderBottom: active
      ? '2px solid var(--interactive-accent)'
      : '2px solid transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    fontSize: '12px',
    fontWeight: active ? 500 : 400,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition:
      'color 150ms ease, border-color 150ms ease',
    marginBottom: '-1px',
  };
}
