/**
 * RightSidebarTabs panel sub-components — ViewSwitcherDropdown, SecondaryViewHeader.
 * Thread-tab components live in RightSidebarTabs.tabs.tsx.
 * Extracted to keep RightSidebarTabs.tsx under 300 lines.
 */

import React, { useEffect, useRef } from 'react';

import type { RightSidebarView } from './RightSidebarTabs';
import {
  AnalyticsIcon,
  BackArrowIcon,
  DispatchIcon,
  GitIcon,
  MemoryIcon,
  MonitorIcon,
  RulesIcon,
} from './RightSidebarTabs.icons';
export { RecentThreadTabs, ThreadStatusIcon } from './RightSidebarTabs.tabs';

// ── ViewSwitcherDropdown ──────────────────────────────────────────────────────

const BASE_SECONDARY_VIEWS: Array<{
  id: RightSidebarView;
  label: string;
  Icon: () => React.ReactElement;
}> = [
  { id: 'monitor', label: 'Monitor', Icon: MonitorIcon },
  { id: 'git', label: 'Git Status', Icon: GitIcon },
  { id: 'analytics', label: 'Analytics', Icon: AnalyticsIcon },
  { id: 'memory', label: 'Memory', Icon: MemoryIcon },
  { id: 'rules' as RightSidebarView, label: 'Claude Config', Icon: RulesIcon },
];

const DISPATCH_VIEW = { id: 'dispatch' as RightSidebarView, label: 'Dispatch', Icon: DispatchIcon };

function viewSwitcherItemStyle(isActive: boolean): React.CSSProperties {
  return {
    color: isActive ? 'var(--interactive-accent)' : undefined,
    backgroundColor: isActive
      ? 'color-mix(in srgb, var(--interactive-accent) 8%, transparent)'
      : 'transparent',
  };
}

function ViewSwitcherItem({
  id,
  label,
  Icon,
  isActive,
  onSwitchView,
  onClose,
}: {
  id: RightSidebarView;
  label: string;
  Icon: () => React.ReactElement;
  isActive: boolean;
  onSwitchView: (view: RightSidebarView) => void;
  onClose: () => void;
}): React.ReactElement {
  const handleClick = () => {
    onSwitchView(id);
    onClose();
  };
  const handleEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!isActive) e.currentTarget.style.backgroundColor = 'var(--surface-raised)';
  };
  const handleLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
  };
  return (
    <button
      key={id}
      onClick={handleClick}
      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors duration-75 text-text-semantic-primary"
      style={viewSwitcherItemStyle(isActive)}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <Icon />
      <span>{label}</span>
    </button>
  );
}

function useDropdownDismiss(
  ref: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleEscape(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [ref, onClose]);
}

const DROPDOWN_PANEL_STYLE: React.CSSProperties = {
  top: '100%',
  marginTop: 2,
  borderRadius: 6,
  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
  minWidth: 150,
  padding: '4px 0',
};

function BackToChatButton({
  onSwitchView,
  onClose,
}: {
  onSwitchView: (v: RightSidebarView) => void;
  onClose: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={() => {
        onSwitchView('chat');
        onClose();
      }}
      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors duration-75 text-interactive-accent"
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--surface-raised)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <BackArrowIcon />
      <span>Back to Chat</span>
    </button>
  );
}

export function ViewSwitcherDropdown({
  activeView,
  onSwitchView,
  onClose,
  showDispatch = false,
}: {
  activeView: RightSidebarView;
  onSwitchView: (view: RightSidebarView) => void;
  onClose: () => void;
  showDispatch?: boolean;
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useDropdownDismiss(ref, onClose);
  const views = showDispatch ? [...BASE_SECONDARY_VIEWS, DISPATCH_VIEW] : BASE_SECONDARY_VIEWS;
  return (
    <div
      ref={ref}
      className="absolute right-1 z-50 bg-surface-overlay border border-border-semantic backdrop-blur-xl"
      style={DROPDOWN_PANEL_STYLE}
    >
      {views.map(({ id, label, Icon }) => (
        <ViewSwitcherItem
          key={id}
          id={id}
          label={label}
          Icon={Icon}
          isActive={activeView === id}
          onSwitchView={onSwitchView}
          onClose={onClose}
        />
      ))}
      <div className="my-1 border-t border-border-semantic" />
      {activeView !== 'chat' && <BackToChatButton onSwitchView={onSwitchView} onClose={onClose} />}
    </div>
  );
}

// ── SecondaryViewHeader ───────────────────────────────────────────────────────

export function SecondaryViewHeader({
  label,
  onBackToChat,
}: {
  label: string;
  onBackToChat: () => void;
}): React.ReactElement {
  return (
    <div
      className="flex-shrink-0 flex items-center h-8 border-b bg-surface-panel pl-2"
      style={{ borderColor: 'var(--border-subtle, var(--border-default))' }}
    >
      <button
        onClick={onBackToChat}
        className="flex items-center gap-1 px-1.5 text-xs transition-colors duration-100 text-text-semantic-muted"
        title="Back to Chat"
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--interactive-accent)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '';
        }}
      >
        <BackArrowIcon />
        <span>Chat</span>
      </button>
      <span className="mx-1 text-[10px] text-border-semantic">|</span>
      <span
        className="text-xs font-semibold uppercase tracking-wider select-none text-text-semantic-muted"
        style={{ letterSpacing: '0.06em' }}
      >
        {label}
      </span>
      <div className="flex-1" />
    </div>
  );
}
