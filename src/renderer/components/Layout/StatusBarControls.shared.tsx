import React, { useCallback, useEffect, useState } from 'react';
import type { WorkspaceLayout } from '../../types/electron';
import { LayoutSwitcher } from './LayoutSwitcher';
import type { StatusBarLayoutProps } from './StatusBar';

export const STATUS_BUTTON_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  background: 'none',
  border: 'none',
  padding: '0 8px',
  height: '22px',
  fontFamily: 'var(--font-ui)',
  fontSize: '11px',
  transition: 'color 120ms ease',
};

export const TRUNCATE_STYLE: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const DROPDOWN_STYLE: React.CSSProperties = {
  position: 'fixed',
  bottom: '26px',
  left: '0',
  zIndex: 1000,
  minWidth: '220px',
  maxWidth: '320px',
  maxHeight: '280px',
  borderRadius: '6px',
  boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.4)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.8125rem',
};

export const SEARCH_INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  borderRadius: '4px',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-ui)',
  padding: '3px 6px',
  outline: 'none',
  boxSizing: 'border-box',
};

function getErrorMessage(errorValue: unknown): string {
  return errorValue instanceof Error ? errorValue.message : String(errorValue);
}

export function setElementColor(
  target: HTMLSpanElement | HTMLButtonElement,
  color: string,
): void {
  target.style.color = color;
}

export function setElementBackground(target: HTMLButtonElement, color: string): void {
  target.style.backgroundColor = color;
}

export function useDismissOnOutsideInteraction(
  ref: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [onClose, ref]);
}

export function useBranches(projectRoot: string): {
  branches: string[];
  loading: boolean;
  error: string | null;
} {
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    window.electronAPI.git.branches(projectRoot)
      .then((result) => {
        if (!active) {
          return;
        }
        if (result.success && result.branches) {
          setBranches(result.branches);
          setError(null);
        } else {
          setError(result.error ?? 'Failed to fetch branches');
        }
        setLoading(false);
      })
      .catch((errorValue: unknown) => {
        if (!active) {
          return;
        }
        setError(getErrorMessage(errorValue));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectRoot]);

  return { branches, loading, error };
}

export function StatusItem({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}): React.ReactElement {
  return (
    <span
      className="flex items-center px-2 truncate text-text-semantic-faint"
      title={title}
      style={{ transition: 'color 120ms ease', cursor: 'default' }}
      onMouseEnter={(event) => setElementColor(event.currentTarget, 'var(--text-secondary)')}
      onMouseLeave={(event) => setElementColor(event.currentTarget, '')}
    >
      {children}
    </span>
  );
}

export function Divider(): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="bg-border-semantic"
      style={{ width: '1px', height: '12px', flexShrink: 0 }}
    />
  );
}

export function BranchIcon(): React.ReactElement {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M5 3a2 2 0 1 0-4 0 2 2 0 0 0 4 0ZM5 3H4a2 2 0 0 0-2 2v3.17A3.001 3.001 0 0 1 5 11v0a3 3 0 0 0 3-3V5a2 2 0 0 0-2-2H5ZM5 13a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM15 3a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LayoutIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <rect x="1" y="1" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" strokeWidth="1.3" />
      <line x1="1" y1="11" x2="15" y2="11" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function StatusBarToggleButton({
  icon,
  label,
  maxWidth,
  open,
  title,
  onToggle,
  restingColor,
  canHover = true,
  cursor = 'pointer',
}: {
  icon: React.ReactNode;
  label: string;
  maxWidth: string;
  open: boolean;
  title: string;
  onToggle: () => void;
  restingColor: string;
  canHover?: boolean;
  cursor?: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title}
      aria-haspopup="listbox"
      aria-expanded={open}
      style={{ ...STATUS_BUTTON_STYLE, cursor, color: restingColor }}
      onMouseEnter={(event) => canHover && setElementColor(event.currentTarget, 'var(--text-primary)')}
      onMouseLeave={(event) => setElementColor(event.currentTarget, restingColor)}
    >
      {icon}
      <span style={{ ...TRUNCATE_STYLE, maxWidth }}>{label}</span>
      <span style={{ fontSize: '8px', lineHeight: 1, color: 'var(--text-faint, var(--text-secondary))' }}>&#9650;</span>
    </button>
  );
}

export function LayoutControl({
  layout,
}: {
  layout: StatusBarLayoutProps;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const closeMenu = useCallback(() => setOpen(false), []);
  const handleSelect = useCallback((selectedLayout: WorkspaceLayout) => {
    layout.onSelectLayout(selectedLayout);
    closeMenu();
  }, [closeMenu, layout]);

  return (
    <>
      <StatusBarToggleButton
        icon={<LayoutIcon />}
        label={layout.activeLayoutName}
        maxWidth="100px"
        open={open}
        title={`Layout: ${layout.activeLayoutName}`}
        onToggle={() => setOpen((previous) => !previous)}
        restingColor="var(--text-secondary)"
      />
      {open ? (
        <LayoutSwitcher
          layouts={layout.layouts}
          activeLayoutName={layout.activeLayoutName}
          currentPanelSizes={layout.currentPanelSizes}
          currentVisiblePanels={layout.currentVisiblePanels}
          onSelect={handleSelect}
          onSave={layout.onSaveLayout}
          onUpdate={layout.onUpdateLayout}
          onDelete={layout.onDeleteLayout}
          onClose={closeMenu}
        />
      ) : null}
    </>
  );
}
