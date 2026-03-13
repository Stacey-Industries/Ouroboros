/**
 * RightSidebarTabs.tsx — Tab switcher for the right sidebar.
 *
 * Renders tab headers ("Monitor" | "Git" | "Analytics") and conditionally
 * shows the corresponding panel content.
 */

import React, { useState, memo } from 'react';

export type RightSidebarTab = 'monitor' | 'git' | 'analytics';

export interface RightSidebarTabsProps {
  monitorContent: React.ReactNode;
  gitContent: React.ReactNode;
  analyticsContent?: React.ReactNode;
}

export const RightSidebarTabs = memo(function RightSidebarTabs({
  monitorContent,
  gitContent,
  analyticsContent,
}: RightSidebarTabsProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<RightSidebarTab>('monitor');

  const renderContent = () => {
    switch (activeTab) {
      case 'monitor': return monitorContent;
      case 'git': return gitContent;
      case 'analytics': return analyticsContent ?? null;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab headers */}
      <div
        className="flex-shrink-0 flex border-b border-[var(--border)]"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <TabButton
          label="Monitor"
          isActive={activeTab === 'monitor'}
          onClick={() => setActiveTab('monitor')}
        />
        <TabButton
          label="Git"
          isActive={activeTab === 'git'}
          onClick={() => setActiveTab('git')}
        />
        <TabButton
          label="Analytics"
          isActive={activeTab === 'analytics'}
          onClick={() => setActiveTab('analytics')}
        />
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
});

function TabButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="
        flex-1 px-3 py-1.5 text-xs font-medium
        transition-colors duration-100
        border-b-2
      "
      style={{
        color: isActive ? 'var(--accent)' : 'var(--text-muted)',
        borderBottomColor: isActive ? 'var(--accent)' : 'transparent',
        backgroundColor: 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.color = 'var(--text)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.color = 'var(--text-muted)';
      }}
    >
      {label}
    </button>
  );
}
