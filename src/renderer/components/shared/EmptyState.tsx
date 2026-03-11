/**
 * EmptyState.tsx — Reusable empty state component with SVG illustration.
 *
 * Displays a monochrome icon, title, optional description, and optional action button.
 * All colors use CSS custom properties for theme compatibility.
 */

import React, { memo } from 'react';

// ── SVG Icons ────────────────────────────────────────────────────────────────

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
      <path
        d="M8 20H40"
        stroke="currentColor"
        strokeWidth="1.5"
      />
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
      <path
        d="M28 8V16H36"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
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
      <rect
        x="12"
        y="14"
        width="24"
        height="22"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="19" cy="24" r="2" fill="currentColor" />
      <circle cx="29" cy="24" r="2" fill="currentColor" />
      <path
        d="M19 31C19 31 21 34 24 34C27 34 29 31 29 31"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M20 14V10M28 14V10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M24 10C24 8.89543 24.8954 8 26 8H22C23.1046 8 24 8.89543 24 10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M8 22H12M36 22H40M8 28H12M36 28H40"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
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
      <rect
        x="6"
        y="10"
        width="36"
        height="28"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M6 16H42"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M14 24L20 28L14 32"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 32H32"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Icon registry ─────────────────────────────────────────────────────────────

const ICONS = {
  folder: FolderIcon,
  document: DocumentIcon,
  agent: AgentIcon,
  terminal: TerminalIcon,
} as const;

export type EmptyStateIcon = keyof typeof ICONS;

// ── EmptyState component ─────────────────────────────────────────────────────

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

/**
 * EmptyState — displays a centered illustration with message and optional action.
 */
export const EmptyState = memo(function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps): React.ReactElement {
  const IconComponent = ICONS[icon];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '12px',
        padding: '24px',
        userSelect: 'none',
        color: 'var(--text-faint)',
      }}
    >
      <div style={{ opacity: 0.35 }}>
        <IconComponent />
      </div>

      <span
        style={{
          fontSize: '0.875rem',
          fontWeight: 500,
          color: 'var(--text-muted)',
        }}
      >
        {title}
      </span>

      {description && (
        <span
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-faint)',
            textAlign: 'center',
            maxWidth: '240px',
            lineHeight: '1.5',
          }}
        >
          {description}
        </span>
      )}

      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: '4px',
            padding: '6px 16px',
            fontSize: '0.75rem',
            borderRadius: '4px',
            border: 'none',
            backgroundColor: 'var(--accent)',
            color: 'var(--bg)',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            fontWeight: 500,
            transition: 'background-color 100ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent)';
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
});
