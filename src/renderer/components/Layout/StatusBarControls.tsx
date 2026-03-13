import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToastContext } from '../../contexts/ToastContext';
import { LayoutSwitcher } from './LayoutSwitcher';
import type { StatusBarLayoutProps } from './StatusBar';

const STATUS_BUTTON_STYLE: React.CSSProperties = {
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

const TRUNCATE_STYLE: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const DROPDOWN_STYLE: React.CSSProperties = {
  position: 'fixed',
  bottom: '26px',
  left: '0',
  zIndex: 1000,
  minWidth: '220px',
  maxWidth: '320px',
  maxHeight: '280px',
  backgroundColor: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.4)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.8125rem',
};

const SEARCH_INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  color: 'var(--text)',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-ui)',
  padding: '3px 6px',
  outline: 'none',
  boxSizing: 'border-box',
};

function setElementColor(
  target: HTMLSpanElement | HTMLButtonElement,
  color: string,
): void {
  target.style.color = color;
}

function setElementBackground(target: HTMLButtonElement, color: string): void {
  target.style.backgroundColor = color;
}

function useDismissOnOutsideInteraction(
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

function useBranches(projectRoot: string): {
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

        setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectRoot]);

  return { branches, loading, error };
}

function BranchDropdownMessage({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}): React.ReactElement {
  return (
    <div style={{ padding: '12px', color, textAlign: 'center' }}>
      {children}
    </div>
  );
}

function BranchListButton({
  branch,
  currentBranch,
  checkingOut,
  onCheckout,
}: {
  branch: string;
  currentBranch: string;
  checkingOut: string | null;
  onCheckout: (branch: string) => void;
}): React.ReactElement {
  const isCurrent = branch === currentBranch;
  const isCheckingOut = checkingOut === branch;

  return (
    <button
      type="button"
      role="option"
      aria-selected={isCurrent}
      disabled={isCurrent || isCheckingOut || checkingOut !== null}
      onClick={() => {
        if (!isCurrent) {
          onCheckout(branch);
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        width: '100%',
        padding: '5px 10px',
        background: 'none',
        border: 'none',
        cursor: isCurrent ? 'default' : 'pointer',
        textAlign: 'left',
        color: isCurrent ? 'var(--accent)' : 'var(--text)',
        fontFamily: 'var(--font-ui)',
        fontSize: '0.8125rem',
        opacity: checkingOut !== null && !isCheckingOut ? 0.5 : 1,
      }}
      onMouseEnter={(event) => {
        if (!isCurrent && checkingOut === null) {
          setElementBackground(event.currentTarget, 'var(--bg)');
        }
      }}
      onMouseLeave={(event) => {
        setElementBackground(event.currentTarget, 'transparent');
      }}
    >
      <span style={{ width: '12px', flexShrink: 0 }}>
        {isCurrent ? '\u2713' : ''}
      </span>
      <span style={{ ...TRUNCATE_STYLE, flex: 1 }}>
        {branch}
      </span>
      {isCheckingOut && (
        <span style={{ color: 'var(--text-faint)', fontSize: '0.6875rem', flexShrink: 0 }}>
          switching...
        </span>
      )}
    </button>
  );
}

function BranchDropdown({
  projectRoot,
  currentBranch,
  onClose,
  onCheckout,
  checkingOut,
}: {
  projectRoot: string;
  currentBranch: string;
  onClose: () => void;
  onCheckout: (branch: string) => void;
  checkingOut: string | null;
}): React.ReactElement {
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { branches, loading, error } = useBranches(projectRoot);

  useDismissOnOutsideInteraction(dropdownRef, onClose);

  const filteredBranches = useMemo(
    () => branches.filter((branch) => branch.toLowerCase().includes(search.toLowerCase())),
    [branches, search],
  );

  return (
    <div ref={dropdownRef} role="listbox" aria-label="Switch branch" style={DROPDOWN_STYLE}>
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-muted)', flexShrink: 0 }}>
        <input
          autoFocus
          type="text"
          placeholder="Filter branches..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={SEARCH_INPUT_STYLE}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <BranchDropdownMessage color="var(--text-faint)">Loading branches...</BranchDropdownMessage>}
        {error && <BranchDropdownMessage color="var(--error)">{error}</BranchDropdownMessage>}
        {!loading && !error && filteredBranches.length === 0 && (
          <BranchDropdownMessage color="var(--text-faint)">No branches match.</BranchDropdownMessage>
        )}
        {filteredBranches.map((branch) => (
          <BranchListButton
            key={branch}
            branch={branch}
            currentBranch={currentBranch}
            checkingOut={checkingOut}
            onCheckout={onCheckout}
          />
        ))}
      </div>
    </div>
  );
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
      className="flex items-center px-2 truncate"
      title={title}
      style={{
        color: 'var(--text-faint)',
        transition: 'color 120ms ease',
        cursor: 'default',
      }}
      onMouseEnter={(event) => {
        setElementColor(event.currentTarget, 'var(--text-muted)');
      }}
      onMouseLeave={(event) => {
        setElementColor(event.currentTarget, 'var(--text-faint)');
      }}
    >
      {children}
    </span>
  );
}

export function Divider(): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      style={{
        width: '1px',
        height: '12px',
        backgroundColor: 'var(--border)',
        flexShrink: 0,
      }}
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

function LayoutIcon(): React.ReactElement {
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

export function BranchButton({
  gitBranch,
  projectRoot,
}: {
  gitBranch: string;
  projectRoot: string;
}): React.ReactElement {
  const { toast } = useToastContext();
  const [open, setOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  const handleCheckout = useCallback(
    async (branch: string): Promise<void> => {
      setCheckingOut(branch);

      try {
        const result = await window.electronAPI.git.checkout(projectRoot, branch);
        if (result.success) {
          toast(`Switched to branch ${branch}`, 'success');
          setOpen(false);
        } else {
          toast(result.error ?? `Failed to checkout ${branch}`, 'error');
        }
      } catch (errorValue) {
        toast(errorValue instanceof Error ? errorValue.message : String(errorValue), 'error');
      } finally {
        setCheckingOut(null);
      }
    },
    [projectRoot, toast],
  );

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        title={`Branch: ${gitBranch} - click to switch`}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          ...STATUS_BUTTON_STYLE,
          cursor: checkingOut !== null ? 'wait' : 'pointer',
          color: checkingOut !== null ? 'var(--text-faint)' : 'var(--text-muted)',
        }}
        onMouseEnter={(event) => {
          if (checkingOut === null) {
            setElementColor(event.currentTarget, 'var(--text)');
          }
        }}
        onMouseLeave={(event) => {
          const color = checkingOut !== null ? 'var(--text-faint)' : 'var(--text-muted)';
          setElementColor(event.currentTarget, color);
        }}
      >
        <BranchIcon />
        <span style={{ ...TRUNCATE_STYLE, maxWidth: '120px' }}>
          {checkingOut !== null ? 'switching...' : gitBranch}
        </span>
        <span style={{ fontSize: '8px', lineHeight: 1, color: 'var(--text-faint)' }}>&#9650;</span>
      </button>

      {open && (
        <BranchDropdown
          projectRoot={projectRoot}
          currentBranch={gitBranch}
          onClose={() => setOpen(false)}
          onCheckout={handleCheckout}
          checkingOut={checkingOut}
        />
      )}
    </div>
  );
}

export function LayoutControl({
  layout,
}: {
  layout: StatusBarLayoutProps;
}): React.ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        title={`Layout: ${layout.activeLayoutName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          ...STATUS_BUTTON_STYLE,
          cursor: 'pointer',
          color: 'var(--text-muted)',
        }}
        onMouseEnter={(event) => {
          setElementColor(event.currentTarget, 'var(--text)');
        }}
        onMouseLeave={(event) => {
          setElementColor(event.currentTarget, 'var(--text-muted)');
        }}
      >
        <LayoutIcon />
        <span style={{ ...TRUNCATE_STYLE, maxWidth: '100px' }}>
          {layout.activeLayoutName}
        </span>
      </button>
      {open && (
        <LayoutSwitcher
          layouts={layout.layouts}
          activeLayoutName={layout.activeLayoutName}
          currentPanelSizes={layout.currentPanelSizes}
          currentVisiblePanels={layout.currentVisiblePanels}
          onSelect={(selectedLayout) => {
            layout.onSelectLayout(selectedLayout);
            setOpen(false);
          }}
          onSave={layout.onSaveLayout}
          onUpdate={layout.onUpdateLayout}
          onDelete={layout.onDeleteLayout}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
