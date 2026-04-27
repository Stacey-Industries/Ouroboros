/**
 * OuterProjectRail — 52px icon-only project rail (Wave 59 Phase B).
 *
 * Renders a Discord/Slack-style vertical icon column:
 *   - "+" button at the top to add a project via folder picker
 *   - Project icons (one per project), stacked top-down
 *   - Footer with Search / Settings icons
 *
 * Active project: filled accent background. Inactive: muted, hover tooltip.
 */

import React, { useCallback } from 'react';

import { useProject } from '../../../contexts/ProjectContext';
import { WORKBENCH_OPEN_CHAT_SEARCH_EVENT } from '../../../hooks/appEventNames';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface OuterProjectRailProps {
  /** Ordered list of project paths to display. */
  projects: string[];
  /** Currently active project path. */
  activeProject: string | null;
  /** Called when user clicks a project icon. */
  onSelectProject: (projectPath: string) => void;
  /** Called after user picks a folder to add. */
  onAddProject: (projectPath: string) => void;
  /** Called when settings icon is clicked. */
  onOpenSettings: () => void;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export function projectInitials(path: string): string {
  const name = path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '?';
  return name.slice(0, 2).toUpperCase();
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const ICON_BTN_BASE =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ' +
  'transition-colors duration-100';

const ICON_BTN_ACTIVE = 'bg-interactive-accent text-text-on-accent';

const ICON_BTN_IDLE =
  'bg-surface-raised/60 text-text-semantic-muted hover:bg-interactive-hover ' +
  'hover:text-text-semantic-primary';

const FOOTER_BTN_CLASS =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-text-semantic-muted ' +
  'transition-colors duration-100 hover:bg-interactive-hover hover:text-text-semantic-primary';

function ProjectIconButton({
  isActive,
  onClick,
  path,
}: {
  isActive: boolean;
  onClick: () => void;
  path: string;
}): React.ReactElement {
  const label = projectInitials(path);
  const title = path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path;
  return (
    <button
      type="button"
      title={title}
      aria-label={`Switch to project ${title}`}
      aria-pressed={isActive}
      onClick={onClick}
      data-testid={`project-icon-${label}`}
      className={`${ICON_BTN_BASE} ${isActive ? ICON_BTN_ACTIVE : ICON_BTN_IDLE}`}
    >
      {label}
    </button>
  );
}

function SearchIcon(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="6.5" cy="6.5" r="4" />
      <line x1="10" y1="10" x2="14" y2="14" />
    </svg>
  );
}

function SettingsIcon(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="2" />
      <path d="M8 2v1M8 13v1M2 8h1M13 8h1M3.6 3.6l.7.7M11.7 11.7l.7.7M11.7 3.6l-.7.7M4.3 11.7l-.7.7" />
    </svg>
  );
}

function RailFooter({ onOpenSettings }: { onOpenSettings: () => void }): React.ReactElement {
  const handleSearch = useCallback(() => {
    window.dispatchEvent(new CustomEvent(WORKBENCH_OPEN_CHAT_SEARCH_EVENT));
  }, []);
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <button
        type="button"
        title="Search chats"
        aria-label="Search chats"
        onClick={handleSearch}
        data-testid="outer-rail-search"
        className={FOOTER_BTN_CLASS}
      >
        <SearchIcon />
      </button>
      <button
        type="button"
        title="Settings"
        aria-label="Settings"
        onClick={onOpenSettings}
        data-testid="outer-rail-settings"
        className={FOOTER_BTN_CLASS}
      >
        <SettingsIcon />
      </button>
    </div>
  );
}

function ProjectList({
  activeProject,
  onSelectProject,
  projects,
}: {
  activeProject: string | null;
  onSelectProject: (p: string) => void;
  projects: string[];
}): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto py-1">
      {projects.map((projectPath) => (
        <ProjectIconButton
          key={projectPath}
          isActive={projectPath === activeProject}
          onClick={() => onSelectProject(projectPath)}
          path={projectPath}
        />
      ))}
    </div>
  );
}

// ── Add-project handler ────────────────────────────────────────────────────────

function useAddProject(onAddProject: (path: string) => void): () => void {
  const { addProjectRoot } = useProject();
  return useCallback(async () => {
    if (!window.electronAPI?.files?.selectFolder) return;
    const result = await window.electronAPI.files.selectFolder();
    if (result.success && result.path) {
      addProjectRoot(result.path);
      onAddProject(result.path);
    }
  }, [addProjectRoot, onAddProject]) as () => void;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function OuterProjectRail({
  activeProject,
  onAddProject,
  onOpenSettings,
  onSelectProject,
  projects,
}: OuterProjectRailProps): React.ReactElement {
  const handleAdd = useAddProject(onAddProject);
  return (
    <aside
      aria-label="Projects"
      data-testid="outer-project-rail"
      className="flex h-full w-[52px] shrink-0 flex-col items-center gap-1.5 overflow-hidden border-r border-border-semantic bg-surface-panel/95 py-2"
    >
      <button
        type="button"
        title="Add project"
        aria-label="Add project"
        onClick={handleAdd}
        data-testid="outer-rail-add-project"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg font-light text-text-semantic-muted transition-colors hover:bg-interactive-hover hover:text-text-semantic-primary"
      >
        +
      </button>
      <div className="mx-auto h-px w-8 shrink-0 bg-border-semantic" />
      <ProjectList
        activeProject={activeProject}
        onSelectProject={onSelectProject}
        projects={projects}
      />
      <RailFooter onOpenSettings={onOpenSettings} />
    </aside>
  );
}
