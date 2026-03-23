import React, { useCallback, useMemo, useRef, useState } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import {
  BranchIcon,
  DROPDOWN_STYLE,
  SEARCH_INPUT_STYLE,
  setElementBackground,
  StatusBarToggleButton,
  TRUNCATE_STYLE,
  useBranches,
  useDismissOnOutsideInteraction,
} from './StatusBarControls.shared';

const MENU_HEADER_STYLE: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--border-semantic)',
  flexShrink: 0,
};

const MENU_BODY_STYLE: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
};

const BRANCH_OPTION_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  width: '100%',
  padding: '5px 10px',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.8125rem',
};

const BRANCH_CHECK_STYLE: React.CSSProperties = {
  width: '12px',
  flexShrink: 0,
};

const BRANCH_SWITCHING_STYLE: React.CSSProperties = {
  color: 'var(--text-faint, var(--text-secondary))',
  fontSize: '0.6875rem',
  flexShrink: 0,
};

const TOGGLE_CONTAINER_STYLE: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
};

function createClearBackgroundHandler() {
  return (event: React.MouseEvent<HTMLButtonElement>) => {
    setElementBackground(event.currentTarget, 'transparent');
  };
}

const clearBackground = createClearBackgroundHandler();

function getBranchOptionStyle(
  isCurrent: boolean,
  checkingOut: string | null,
  isCheckingOut: boolean,
): React.CSSProperties {
  return {
    ...BRANCH_OPTION_STYLE,
    cursor: isCurrent ? 'default' : 'pointer',
    color: isCurrent ? 'var(--interactive-accent)' : 'var(--text-primary)',
    opacity: checkingOut !== null && !isCheckingOut ? 0.5 : 1,
  };
}

function BranchDropdownMessage({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}): React.ReactElement {
  return <div style={{ padding: '12px', color, textAlign: 'center' }}>{children}</div>;
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
  const handleMouseEnter = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!isCurrent && checkingOut === null) {
      setElementBackground(event.currentTarget, 'var(--surface-base)');
    }
  };

  return (
    <button
      type="button"
      role="option"
      aria-selected={isCurrent}
      disabled={isCurrent || isCheckingOut || checkingOut !== null}
      onClick={() => onCheckout(branch)}
      style={getBranchOptionStyle(isCurrent, checkingOut, isCheckingOut)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={clearBackground}
    >
      <span style={BRANCH_CHECK_STYLE}>{isCurrent ? '\u2713' : ''}</span>
      <span style={{ ...TRUNCATE_STYLE, flex: 1 }}>{branch}</span>
      {isCheckingOut ? <span style={BRANCH_SWITCHING_STYLE}>switching...</span> : null}
    </button>
  );
}

function BranchDropdownContent({
  currentBranch,
  filteredBranches,
  checkingOut,
  error,
  loading,
  onCheckout,
}: {
  currentBranch: string;
  filteredBranches: string[];
  checkingOut: string | null;
  error: string | null;
  loading: boolean;
  onCheckout: (branch: string) => void;
}): React.ReactElement {
  if (loading) {
    return <BranchDropdownMessage color="var(--text-faint, var(--text-secondary))">Loading branches...</BranchDropdownMessage>;
  }
  if (error) {
    return <BranchDropdownMessage color="var(--error)">{error}</BranchDropdownMessage>;
  }
  if (filteredBranches.length === 0) {
    return <BranchDropdownMessage color="var(--text-faint)">No branches match.</BranchDropdownMessage>;
  }
  return (
    <>
      {filteredBranches.map((branch) => (
        <BranchListButton
          key={branch}
          branch={branch}
          currentBranch={currentBranch}
          checkingOut={checkingOut}
          onCheckout={onCheckout}
        />
      ))}
    </>
  );
}

function BranchSearchInput({
  search,
  onSearchChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div style={MENU_HEADER_STYLE}>
      <input
        autoFocus
        type="text"
        placeholder="Filter branches..."
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        className="bg-surface-base border border-border-semantic text-text-semantic-primary"
        style={SEARCH_INPUT_STYLE}
      />
    </div>
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
  const filteredBranches = useMemo(
    () => branches.filter((branch) => branch.toLowerCase().includes(search.toLowerCase())),
    [branches, search],
  );

  useDismissOnOutsideInteraction(dropdownRef, onClose);

  return (
    <div ref={dropdownRef} role="listbox" aria-label="Switch branch" className="bg-surface-panel border border-border-semantic" style={DROPDOWN_STYLE}>
      <BranchSearchInput search={search} onSearchChange={setSearch} />
      <div style={MENU_BODY_STYLE}>
        <BranchDropdownContent
          currentBranch={currentBranch}
          filteredBranches={filteredBranches}
          checkingOut={checkingOut}
          error={error}
          loading={loading}
          onCheckout={onCheckout}
        />
      </div>
    </div>
  );
}

function useBranchCheckout(
  projectRoot: string,
  onSuccess: () => void,
): {
  checkingOut: string | null;
  handleCheckout: (branch: string) => Promise<void>;
} {
  const { toast } = useToastContext();
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const handleCheckout = useCallback(async (branch: string) => {
    setCheckingOut(branch);
    try {
      const result = await window.electronAPI.git.checkout(projectRoot, branch);
      if (result.success) {
        toast(`Switched to branch ${branch}`, 'success');
        onSuccess();
      } else {
        toast(result.error ?? `Failed to checkout ${branch}`, 'error');
      }
    } catch (errorValue) {
      toast(errorValue instanceof Error ? errorValue.message : String(errorValue), 'error');
    } finally {
      setCheckingOut(null);
    }
  }, [onSuccess, projectRoot, toast]);

  return { checkingOut, handleCheckout };
}

export function BranchButton({
  gitBranch,
  projectRoot,
}: {
  gitBranch: string;
  projectRoot: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const closeMenu = useCallback(() => setOpen(false), []);
  const { checkingOut, handleCheckout } = useBranchCheckout(projectRoot, closeMenu);
  const label = checkingOut !== null ? 'switching...' : gitBranch;
  const restingColor = checkingOut !== null ? 'var(--text-faint, var(--text-secondary))' : 'var(--text-secondary)';

  return (
    <div style={TOGGLE_CONTAINER_STYLE}>
      <StatusBarToggleButton
        icon={<BranchIcon />}
        label={label}
        maxWidth="120px"
        open={open}
        title={`Branch: ${gitBranch} - click to switch`}
        onToggle={() => setOpen((previous) => !previous)}
        restingColor={restingColor}
        canHover={checkingOut === null}
        cursor={checkingOut !== null ? 'wait' : 'pointer'}
      />
      {open ? (
        <BranchDropdown
          projectRoot={projectRoot}
          currentBranch={gitBranch}
          onClose={closeMenu}
          onCheckout={handleCheckout}
          checkingOut={checkingOut}
        />
      ) : null}
    </div>
  );
}
