/**
 * EmptyState.tsx - Reusable empty state component with SVG illustration.
 *
 * Displays a monochrome icon, title, optional description, and optional action button.
 * All colors use CSS custom properties for theme compatibility.
 */

import React, { memo } from 'react';

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: '12px',
  padding: '24px',
  userSelect: 'none',
};

const iconWrapperStyle: React.CSSProperties = { opacity: 0.35 };
const titleStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  fontWeight: 500,
};

const descriptionStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  textAlign: 'center',
  maxWidth: '240px',
  lineHeight: '1.5',
};

const actionButtonStyle: React.CSSProperties = {
  marginTop: '4px',
  padding: '6px 16px',
  fontSize: '0.75rem',
  borderRadius: '4px',
  border: 'none',
  backgroundColor: 'var(--interactive-accent)',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  fontWeight: 500,
  transition: 'background-color 100ms',
};

const AGENT_EYE_POSITIONS = [19, 29] as const;
const AGENT_ANTENNA_PATHS = ['M20 14V10', 'M28 14V10'] as const;
const AGENT_SIDE_PORT_PATHS = ['M8 22H12', 'M36 22H40', 'M8 28H12', 'M36 28H40'] as const;

/** Folder icon for "no project open" state */
function FolderIcon(): React.ReactElement {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M8 14C8 12.3431 9.34315 11 11 11H19L23 15H37C38.6569 15 40 16.3431 40 18V34C40 35.6569 38.6569 37 37 37H11C9.34315 37 8 35.6569 8 34V14Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 20H40" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Document icon for "no file selected" state */
function DocumentIcon(): React.ReactElement {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M14 8H28L36 16V38C36 39.1046 35.1046 40 34 40H14C12.8954 40 12 39.1046 12 38V10C12 8.89543 12.8954 8 14 8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M28 8V16H36" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path
        d="M18 24H30M18 30H30M18 36H26"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Agent/robot icon for "no agents running" state */
function AgentIcon(): React.ReactElement {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="12" y="14" width="24" height="22" rx="4" stroke="currentColor" strokeWidth="1.5" />
      {AGENT_EYE_POSITIONS.map((cx) => (
        <circle key={cx} cx={cx} cy="24" r="2" fill="currentColor" />
      ))}
      <path
        d="M19 31C19 31 21 34 24 34C27 34 29 31 29 31"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {AGENT_ANTENNA_PATHS.map((d) => (
        <path key={d} d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      ))}
      <path
        d="M24 10C24 8.89543 24.8954 8 26 8H22C23.1046 8 24 8.89543 24 10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {AGENT_SIDE_PORT_PATHS.map((d) => (
        <path key={d} d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      ))}
    </svg>
  );
}

/** Terminal icon for "no terminals open" state */
function TerminalIcon(): React.ReactElement {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="6" y="10" width="36" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 16H42" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M14 24L20 28L14 32"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M24 32H32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const ICONS = {
  folder: FolderIcon,
  document: DocumentIcon,
  agent: AgentIcon,
  terminal: TerminalIcon,
} as const;

export type EmptyStateIcon = keyof typeof ICONS;

export interface EmptyStateProps {
  /** Which SVG icon to display */
  icon: EmptyStateIcon;
  /** Primary title text */
  title: string;
  /** Optional description below the title */
  description?: string;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
  };
}

function EmptyStateDescription({
  description,
}: {
  description?: string;
}): React.ReactElement | null {
  return description ? (
    <span className="text-text-semantic-faint" style={descriptionStyle}>
      {description}
    </span>
  ) : null;
}

function handleActionHover(target: HTMLButtonElement, hovering: boolean): void {
  target.style.backgroundColor = hovering
    ? 'var(--interactive-hover)'
    : 'var(--interactive-accent)';
}

function EmptyStateAction({
  action,
}: {
  action: NonNullable<EmptyStateProps['action']>;
}): React.ReactElement {
  return (
    <button
      onClick={action.onClick}
      className="text-text-semantic-on-accent"
      style={actionButtonStyle}
      onMouseEnter={(e) => {
        handleActionHover(e.currentTarget, true);
      }}
      onMouseLeave={(e) => {
        handleActionHover(e.currentTarget, false);
      }}
    >
      {action.label}
    </button>
  );
}

/**
 * EmptyState - displays a centered illustration with message and optional action.
 */
export const EmptyState = memo(function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps): React.ReactElement {
  const IconComponent = ICONS[icon];

  return (
    <div className="text-text-semantic-faint" style={containerStyle}>
      <div style={iconWrapperStyle}>
        <IconComponent />
      </div>
      <span className="text-text-semantic-muted" style={titleStyle}>
        {title}
      </span>
      <EmptyStateDescription description={description} />
      {action && <EmptyStateAction action={action} />}
    </div>
  );
});
