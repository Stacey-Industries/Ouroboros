import React from 'react';

import {
  BUTTON_BASE_STYLE,
  MENU_STYLE,
  RECENT_BUTTON_STYLE,
  RECENT_PATH_STYLE,
  SECTION_LABEL_STYLE,
  TOGGLE_BUTTON_STYLE,
  TRUNCATE_STYLE,
} from './ProjectPickerMenu.styles';
import { basename } from './useProjectPickerController';

function setButtonBackground(target: HTMLButtonElement, color: string): void {
  target.style.backgroundColor = color;
}

function createHoverHandler(color: string) {
  return (event: React.MouseEvent<HTMLButtonElement>) => {
    setButtonBackground(event.currentTarget, color);
  };
}

const clearHover = createHoverHandler('transparent');
const actionHover = createHoverHandler('rgba(88, 166, 255, 0.1)');
const recentHover = createHoverHandler('var(--surface-panel)');

function FolderIcon(): React.ReactElement {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M1.5 3.5C1.5 2.948 1.948 2.5 2.5 2.5H5L6.5 4H10.5C11.052 4 11.5 4.448 11.5 5V9.5C11.5 10.052 11.052 10.5 10.5 10.5H2.5C1.948 10.5 1.5 10.052 1.5 9.5V3.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDownIcon(): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M2 4L5 7L8 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon(): React.ReactElement {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M6.5 2.5V10.5M2.5 6.5H10.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ActionButton({
  borderBottom,
  children,
  icon,
  onClick,
}: {
  borderBottom?: string;
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => Promise<void>;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      onClick={() => void onClick()}
      className="text-interactive-accent"
      style={{ ...BUTTON_BASE_STYLE, borderBottom }}
      onMouseEnter={actionHover}
      onMouseLeave={clearHover}
    >
      {icon}
      {children}
    </button>
  );
}

function RecentProjectButton({
  path,
  onSelect,
}: {
  path: string;
  onSelect: (path: string) => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      onClick={() => onSelect(path)}
      title={path}
      className="text-text-semantic-primary"
      style={RECENT_BUTTON_STYLE}
      onMouseEnter={recentHover}
      onMouseLeave={clearHover}
    >
      <span style={TRUNCATE_STYLE}>{basename(path)}</span>
      <span className="text-text-semantic-faint" style={RECENT_PATH_STYLE}>
        {path}
      </span>
    </button>
  );
}

function RecentProjectsSection({
  recents,
  onSelectRecent,
}: {
  recents: string[];
  onSelectRecent: (path: string) => void;
}): React.ReactElement | null {
  if (recents.length === 0) {
    return null;
  }
  return (
    <div>
      <div className="text-text-semantic-faint" style={SECTION_LABEL_STYLE}>
        Recent
      </div>
      {recents.map((path) => (
        <RecentProjectButton key={path} path={path} onSelect={onSelectRecent} />
      ))}
    </div>
  );
}

export function ProjectPickerToggle({
  busy,
  currentPath,
  hasMultipleRoots,
  open,
  projectName,
  rootCount,
  onToggle,
}: {
  busy: boolean;
  currentPath: string | null;
  hasMultipleRoots: boolean;
  open: boolean;
  projectName: string;
  rootCount: number;
  onToggle: () => void;
}): React.ReactElement {
  const label = hasMultipleRoots ? `Workspace (${rootCount})` : projectName;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      title={currentPath ?? 'No folder open'}
      aria-haspopup="listbox"
      aria-expanded={open}
      className={busy ? 'text-text-semantic-faint' : 'text-text-semantic-primary'}
      style={{ ...TOGGLE_BUTTON_STYLE, cursor: busy ? 'wait' : 'pointer' }}
    >
      <span className="text-text-semantic-muted">
        <FolderIcon />
      </span>
      <span style={{ ...TRUNCATE_STYLE, flex: 1, textAlign: 'left' }}>{label}</span>
      <span className="text-text-semantic-muted">
        <ChevronDownIcon />
      </span>
    </button>
  );
}

function MenuActionButtons({
  canAddProject,
  rootCount,
  onAddFolder,
  onOpenFolder,
}: {
  canAddProject: boolean;
  rootCount: number;
  onAddFolder: () => Promise<void>;
  onOpenFolder: () => Promise<void>;
}): React.ReactElement {
  const openFolderLabel = rootCount > 0 ? 'Open folder... (replace workspace)' : 'Open folder...';
  return (
    <>
      <ActionButton
        borderBottom="1px solid var(--border-subtle)"
        icon={<FolderIcon />}
        onClick={onOpenFolder}
      >
        {openFolderLabel}
      </ActionButton>
      {canAddProject ? (
        <ActionButton
          borderBottom="1px solid var(--border-subtle)"
          icon={<PlusIcon />}
          onClick={onAddFolder}
        >
          Add folder to workspace...
        </ActionButton>
      ) : null}
    </>
  );
}

export function ProjectPickerMenu({
  canAddProject,
  recents,
  rootCount,
  onAddFolder,
  onOpenFolder,
  onSelectRecent,
}: {
  canAddProject: boolean;
  recents: string[];
  rootCount: number;
  onAddFolder: () => Promise<void>;
  onOpenFolder: () => Promise<void>;
  onSelectRecent: (path: string) => void;
}): React.ReactElement {
  return (
    <div
      role="listbox"
      aria-label="Project selector"
      className="bg-surface-raised border border-border-semantic"
      style={MENU_STYLE}
    >
      <MenuActionButtons
        canAddProject={canAddProject}
        rootCount={rootCount}
        onAddFolder={onAddFolder}
        onOpenFolder={onOpenFolder}
      />
      <RecentProjectsSection recents={recents} onSelectRecent={onSelectRecent} />
    </div>
  );
}
