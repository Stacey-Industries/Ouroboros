/**
 * WorkbenchRightPane — single right-side container that hosts either the
 * utility drawer or the artifact pane (mutually exclusive, layout-enforced).
 * A thin header above the active pane provides a dropdown to switch views.
 */

import React, { Suspense, useEffect, useRef, useState } from 'react';

import { ChatWorkbenchUtilityDrawer } from './ChatWorkbenchUtilityDrawer';
import type { ChatWorkbenchUtilityTab, RightPaneView } from './useChatWorkbenchLayout';

const ChatWorkbenchArtifactPane = React.lazy(() =>
  import('./ChatWorkbenchArtifactPane').then((m) => ({ default: m.ChatWorkbenchArtifactPane })),
);

interface WorkbenchRightPaneProps {
  view: RightPaneView;
  activeUtilityTab: ChatWorkbenchUtilityTab;
  onSelectUtilityTab: (tab: ChatWorkbenchUtilityTab) => void;
  onSelectView: (view: RightPaneView) => void;
  onClose: () => void;
}

const VIEW_LABEL: Record<RightPaneView, string> = {
  utility: 'Utility Drawer',
  artifact: 'Artifact Pane',
};

function ChevronDownIcon(): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="2,3.5 5,6.5 8,3.5" />
    </svg>
  );
}

function useDismissOnOutside(
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

interface ViewSwitcherMenuProps {
  view: RightPaneView;
  onSelectView: (view: RightPaneView) => void;
  onClose: () => void;
}

function ViewSwitcherMenu({
  view,
  onSelectView,
  onClose,
}: ViewSwitcherMenuProps): React.ReactElement {
  return (
    <div
      role="menu"
      className="absolute left-0 top-full mt-1 z-[1000] min-w-[160px] rounded border border-border-semantic bg-surface-overlay shadow-lg"
      data-testid="right-pane-view-switcher-menu"
    >
      {(['utility', 'artifact'] as RightPaneView[]).map((id) => (
        <button
          key={id}
          type="button"
          role="menuitem"
          onClick={() => {
            onSelectView(id);
            onClose();
          }}
          className={`flex w-full items-center px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover ${
            id === view ? 'text-interactive-accent' : 'text-text-semantic-primary'
          }`}
          data-testid={`right-pane-view-switcher-item-${id}`}
        >
          {VIEW_LABEL[id]}
        </button>
      ))}
    </div>
  );
}

interface ViewSwitcherProps {
  view: RightPaneView;
  onSelectView: (view: RightPaneView) => void;
}

function ViewSwitcher({ view, onSelectView }: ViewSwitcherProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useDismissOnOutside(ref, () => setOpen(false));
  return (
    <div ref={ref} className="relative" data-testid="right-pane-view-switcher">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-text-semantic-primary hover:bg-surface-hover"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="right-pane-view-switcher-trigger"
      >
        <span>{VIEW_LABEL[view]}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <ViewSwitcherMenu view={view} onSelectView={onSelectView} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function CloseIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <line x1="2" y1="2" x2="10" y2="10" />
      <line x1="10" y1="2" x2="2" y2="10" />
    </svg>
  );
}

interface RightPaneHeaderProps {
  view: RightPaneView;
  onSelectView: (view: RightPaneView) => void;
  onClose: () => void;
}

function RightPaneHeader({
  view,
  onSelectView,
  onClose,
}: RightPaneHeaderProps): React.ReactElement {
  return (
    <header
      className="flex shrink-0 items-center justify-between border-b border-border-semantic bg-surface-panel/95 px-2 py-1"
      data-testid="workbench-right-pane-header"
    >
      <ViewSwitcher view={view} onSelectView={onSelectView} />
      <button
        type="button"
        onClick={onClose}
        className="flex h-6 w-6 items-center justify-center rounded text-text-semantic-muted transition-colors hover:bg-surface-hover hover:text-text-semantic-primary"
        title="Close pane"
        aria-label="Close pane"
        data-testid="workbench-right-pane-close"
      >
        <CloseIcon />
      </button>
    </header>
  );
}

export function WorkbenchRightPane({
  view,
  activeUtilityTab,
  onSelectUtilityTab,
  onSelectView,
  onClose,
}: WorkbenchRightPaneProps): React.ReactElement {
  return (
    <aside
      className="flex h-full w-[360px] shrink-0 flex-col overflow-hidden border-l border-border-semantic bg-surface-base"
      data-testid="workbench-right-pane"
    >
      <RightPaneHeader view={view} onSelectView={onSelectView} onClose={onClose} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {view === 'artifact' ? (
          <Suspense fallback={null}>
            <ChatWorkbenchArtifactPane onClose={onClose} />
          </Suspense>
        ) : (
          <ChatWorkbenchUtilityDrawer
            activeTab={activeUtilityTab}
            onSelectTab={onSelectUtilityTab}
            onClose={onClose}
          />
        )}
      </div>
    </aside>
  );
}
