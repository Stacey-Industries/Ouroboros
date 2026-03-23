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

function UsageTabBar({
  activeTab,
  onSelect,
}: {
  activeTab: UsageTab;
  onSelect: (tab: UsageTab) => void;
}): React.ReactElement {
  return (
    <div className="flex border-b border-border-semantic bg-surface-panel" style={{ flexShrink: 0 }}>
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

export const UsagePanel = memo(function UsagePanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<UsageTab>('current');
  const content = activeTab === 'current' ? <UsageCurrentTab /> : <UsageHistoryTab />;

  return (
    <div className="flex flex-col h-full bg-surface-base" style={{ fontFamily: 'var(--font-ui)' }}>
      <UsageTabBar activeTab={activeTab} onSelect={setActiveTab} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{content}</div>
    </div>
  );
});
