import React, { memo, useState } from 'react';
import { UsageCurrentTab } from './UsageCurrentTab';
import { UsageHistoryTab } from './UsageHistoryTab';

type UsageTab = 'current' | 'history';

const TABS: { key: UsageTab; label: string }[] = [
  { key: 'current', label: 'Current' },
  { key: 'history', label: 'History' },
];

export interface UsagePanelProps {
  onClose: () => void;
}

function UsageTitle(): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="5" width="3" height="10" rx="0.5" />
        <rect x="6.5" y="1" width="3" height="14" rx="0.5" />
        <rect x="12" y="3" width="3" height="12" rx="0.5" />
      </svg>
      <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>Claude Code Usage</span>
    </div>
  );
}

function UsageCloseButton({ onClose }: UsagePanelProps): React.ReactElement {
  return (
    <button
      onClick={onClose}
      aria-label="Close usage"
      style={{
        width: '28px',
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '6px',
        border: 'none',
        background: 'transparent',
        color: 'var(--text-muted)',
        fontSize: '18px',
        cursor: 'pointer',
        lineHeight: 1,
      }}
    >
      x
    </button>
  );
}

function UsagePanelHeader({ onClose }: UsagePanelProps): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      <UsageTitle />
      <UsageCloseButton onClose={onClose} />
    </div>
  );
}

function UsageTabBar({
  activeTab,
  onSelect,
}: {
  activeTab: UsageTab;
  onSelect: (tab: UsageTab) => void;
}): React.ReactElement {
  return (
    <div className="flex" style={{ borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-secondary)' }}>
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onSelect(tab.key)}
          className="flex items-center gap-1.5 px-4 py-2 text-[12px] transition-colors"
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === tab.key ? 'var(--text)' : 'var(--text-muted)',
            fontWeight: activeTab === tab.key ? 600 : 400,
            cursor: 'pointer',
            marginBottom: '-1px',
            fontFamily: 'var(--font-ui)',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export const UsagePanel = memo(function UsagePanel({ onClose }: UsagePanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<UsageTab>('current');
  const content = activeTab === 'current' ? <UsageCurrentTab /> : <UsageHistoryTab />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', fontFamily: 'var(--font-ui)' }}>
      <UsagePanelHeader onClose={onClose} />
      <UsageTabBar activeTab={activeTab} onSelect={setActiveTab} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{content}</div>
    </div>
  );
});
