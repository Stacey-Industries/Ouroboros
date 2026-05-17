/**
 * InnerSidebar — 280px sidebar for the active project (Wave 59 Phase B).
 *
 * Structure:
 *   Header  — project name breadcrumb
 *   Tabs    — Chats | Terminals | Code (3 tabs, active tab persisted per-project)
 *   Body    — tab content (stubbed; Phase D fills these in)
 *   Footer  — workspace status (chat/terminal counts)
 */

import React from 'react';

export type InnerSidebarTab = 'chats' | 'terminals' | 'code';

export interface InnerSidebarProps {
  /** Path of the currently active project. */
  activeProject: string | null;
  /** Currently selected tab. */
  activeTab: InnerSidebarTab;
  /** Called when user switches tabs. */
  onSelectTab: (tab: InnerSidebarTab) => void;
  /** Content to render in the Chats tab body. Provided by Phase D. */
  chatsContent?: React.ReactNode;
  /** Content to render in the Terminals tab body. Provided by Phase D. */
  terminalsContent?: React.ReactNode;
  /** Content to render in the Code tab body. Provided by Phase D. */
  codeContent?: React.ReactNode;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function projectDisplayName(path: string | null): string {
  if (!path) return 'No project';
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

// Chats tab hidden post-Wave-89 terminal-first pivot — surface is redundant
// (no chat workspace mounted in this shell). InnerSidebarChats kept for
// reference; restore the 'chats' entries here + in PANEL_DEFS to bring back.
const TABS: { id: InnerSidebarTab; label: string }[] = [
  { id: 'terminals', label: 'Terminals' },
  { id: 'code', label: 'Code' },
];

function SidebarHeader({ activeProject }: { activeProject: string | null }): React.ReactElement {
  return (
    <div
      className="shrink-0 border-b border-border-semantic px-3 py-2"
      data-testid="inner-sidebar-header"
    >
      <p
        className="truncate text-sm font-medium text-text-semantic-primary"
        title={activeProject ?? undefined}
      >
        {projectDisplayName(activeProject)}
      </p>
    </div>
  );
}

function TabStrip({
  activeTab,
  onSelectTab,
}: {
  activeTab: InnerSidebarTab;
  onSelectTab: (tab: InnerSidebarTab) => void;
}): React.ReactElement {
  return (
    <div
      role="tablist"
      aria-label="Inner sidebar tabs"
      className="flex shrink-0 border-b border-border-semantic"
      data-testid="inner-sidebar-tabstrip"
    >
      {TABS.map(({ id, label }) => {
        const isActive = id === activeTab;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`inner-sidebar-panel-${id}`}
            id={`inner-sidebar-tab-${id}`}
            onClick={() => onSelectTab(id)}
            data-testid={`inner-sidebar-tab-${id}`}
            className={[
              'flex-1 py-2 text-xs font-medium transition-colors',
              isActive
                ? 'border-b-2 border-interactive-accent text-text-semantic-primary'
                : 'text-text-semantic-muted hover:text-text-semantic-primary',
            ].join(' ')}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const PANEL_DEFS: { id: InnerSidebarTab; label: string }[] = [
  { id: 'terminals', label: 'Terminals' },
  { id: 'code', label: 'Code' },
];

type PanelContentMap = Partial<Record<InnerSidebarTab, React.ReactNode>>;

function TabPanel({
  activeTab,
  content,
  id,
  label,
}: {
  activeTab: InnerSidebarTab;
  content: React.ReactNode | undefined;
  id: InnerSidebarTab;
  label: string;
}): React.ReactElement {
  const isActive = activeTab === id;
  return (
    <div
      role="tabpanel"
      id={`inner-sidebar-panel-${id}`}
      aria-labelledby={`inner-sidebar-tab-${id}`}
      hidden={!isActive}
      data-testid={`inner-sidebar-panel-${id}`}
      className={isActive ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
    >
      {content ?? <EmptyTabBody label={label} />}
    </div>
  );
}

function TabBody({
  activeTab,
  contentMap,
}: {
  activeTab: InnerSidebarTab;
  contentMap: PanelContentMap;
}): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {PANEL_DEFS.map(({ id, label }) => (
        <TabPanel key={id} activeTab={activeTab} content={contentMap[id]} id={id} label={label} />
      ))}
    </div>
  );
}

function EmptyTabBody({ label }: { label: string }): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center p-4 text-center">
      <p className="text-xs text-text-semantic-faint">{label} — coming soon</p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function InnerSidebar({
  activeProject,
  activeTab,
  codeContent,
  onSelectTab,
  terminalsContent,
}: InnerSidebarProps): React.ReactElement {
  // Coerce persisted 'chats' activeTab to 'terminals' since the chats tab is hidden.
  const effectiveActiveTab: InnerSidebarTab = activeTab === 'chats' ? 'terminals' : activeTab;
  const contentMap: PanelContentMap = {
    terminals: terminalsContent,
    code: codeContent,
  };
  return (
    <aside
      aria-label="Project sidebar"
      className="flex h-full w-[280px] shrink-0 flex-col overflow-hidden border-r border-border-semantic bg-surface-panel/90"
      data-testid="inner-sidebar"
    >
      <SidebarHeader activeProject={activeProject} />
      <TabStrip activeTab={effectiveActiveTab} onSelectTab={onSelectTab} />
      <TabBody activeTab={effectiveActiveTab} contentMap={contentMap} />
    </aside>
  );
}
