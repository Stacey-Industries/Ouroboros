/**
 * GitBranchIndicator - shows current git branch at the top of the file tree
 * with a dropdown for switching branches and creating new ones.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GitBranchIndicatorProps {
  projectRoot: string;
  isRepo: boolean;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const indicatorStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 8px',
  cursor: 'pointer',
  userSelect: 'none',
  borderBottom: '1px solid var(--border-muted)',
  minHeight: '26px',
  position: 'relative',
};

const branchNameStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '0.75rem',
  fontWeight: 600,
  fontFamily: 'var(--font-mono)',
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  zIndex: 100,
  backgroundColor: 'var(--bg-secondary, var(--bg))',
  border: '1px solid var(--border)',
  borderRadius: '0 0 4px 4px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  maxHeight: '280px',
  overflowY: 'auto',
};

const dropdownHeaderStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--border-muted)',
};

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  color: 'var(--text)',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-ui)',
  outline: 'none',
  boxSizing: 'border-box',
};

const branchItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 8px',
  cursor: 'pointer',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-secondary)',
  userSelect: 'none',
  minHeight: '26px',
};

const branchItemActiveStyle: React.CSSProperties = {
  ...branchItemStyle,
  color: 'var(--accent)',
  fontWeight: 600,
};

const sectionLabelStyle: React.CSSProperties = {
  padding: '6px 8px 2px',
  fontSize: '0.625rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-faint)',
};

const createBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 8px',
  cursor: 'pointer',
  fontSize: '0.75rem',
  color: 'var(--accent)',
  fontFamily: 'var(--font-ui)',
  userSelect: 'none',
  borderTop: '1px solid var(--border-muted)',
  minHeight: '28px',
};

const DROPDOWN_CSS = `
  .branch-item:hover { background-color: var(--bg-tertiary); }
  .branch-create-btn:hover { background-color: var(--bg-tertiary); }
`;

const chevronStyle: React.CSSProperties = {
  flexShrink: 0,
  color: 'var(--text-faint)',
  transition: 'transform 150ms',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function BranchIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0, color: 'var(--accent)' }}>
      <path d="M5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5 11a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM11 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5 7v4M11 7C11 9 9 11 5 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DropdownChevron({ open }: { open: boolean }): React.ReactElement {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"
      style={{ ...chevronStyle, transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
    >
      <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckMark(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ flexShrink: 0, color: 'var(--accent)' }}>
      <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BranchItem({
  name,
  isCurrent,
  onClick,
}: {
  name: string;
  isCurrent: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <div
      className="branch-item"
      style={isCurrent ? branchItemActiveStyle : branchItemStyle}
      onClick={onClick}
      role="option"
      aria-selected={isCurrent}
      title={name}
    >
      {isCurrent ? <CheckMark /> : <span style={{ width: '10px', flexShrink: 0 }} />}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
    </div>
  );
}

function CreateBranchRow({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <div className="branch-create-btn" style={createBtnStyle} onClick={onClick} role="button" tabIndex={0}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M5 2V8M2 5H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span>Create new branch...</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GitBranchIndicator({ projectRoot, isRepo }: GitBranchIndicatorProps): React.ReactElement | null {
  const [branch, setBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [switching, setSwitching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch current branch
  const fetchBranch = useCallback(async () => {
    if (!projectRoot || !isRepo) return;
    try {
      const result = await window.electronAPI.git.branch(projectRoot);
      if (result.success && result.branch) {
        setBranch(result.branch);
      }
    } catch {
      /* ignore */
    }
  }, [projectRoot, isRepo]);

  // Fetch branch list when dropdown opens
  const fetchBranches = useCallback(async () => {
    if (!projectRoot) return;
    try {
      const result = await window.electronAPI.git.branches(projectRoot);
      if (result.success && result.branches) {
        // Filter out remote tracking refs like origin/HEAD
        const localBranches = result.branches.filter(
          (b) => !b.includes('/HEAD') && !b.startsWith('origin/')
        );
        setBranches(localBranches);
      }
    } catch {
      /* ignore */
    }
  }, [projectRoot]);

  // Poll branch name
  useEffect(() => {
    fetchBranch();
    const interval = setInterval(fetchBranch, 5000);
    return () => clearInterval(interval);
  }, [fetchBranch]);

  // Fetch branches when dropdown opens
  useEffect(() => {
    if (isOpen) {
      void fetchBranches();
      // Focus search input
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else {
      setSearch('');
    }
  }, [isOpen, fetchBranches]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  const handleCheckout = useCallback(async (targetBranch: string) => {
    if (!projectRoot || targetBranch === branch) {
      setIsOpen(false);
      return;
    }
    setSwitching(true);
    try {
      const result = await window.electronAPI.git.checkout(projectRoot, targetBranch);
      if (result.success) {
        setBranch(targetBranch);
      }
    } catch {
      /* ignore */
    } finally {
      setSwitching(false);
      setIsOpen(false);
    }
  }, [projectRoot, branch]);

  const handleCreateBranch = useCallback(async () => {
    const name = prompt('New branch name:');
    if (!name || !name.trim() || !projectRoot) return;
    const trimmed = name.trim();
    setSwitching(true);
    try {
      // TODO: Add a dedicated git:createBranch IPC handler that runs `git checkout -b <name>`.
      // The current git:checkout handler passes the argument directly as a branch name to
      // `git checkout <branch>`, so `-b name` would be treated as a literal branch name.
      // Workaround: run the branch creation and checkout as two separate steps via
      // a terminal command, or accept that this feature is non-functional until
      // a proper IPC handler is added.
      // For now, we still call checkout — if the branch already exists as a local ref
      // this will switch to it; creating a truly new branch requires the IPC fix.
      const result = await window.electronAPI.git.checkout(projectRoot, trimmed);
      if (result.success) {
        setBranch(trimmed);
      }
    } catch {
      /* ignore */
    } finally {
      setSwitching(false);
      setIsOpen(false);
    }
  }, [projectRoot]);

  if (!isRepo || !branch) return null;

  const filteredBranches = search
    ? branches.filter((b) => b.toLowerCase().includes(search.toLowerCase()))
    : branches;

  const isDetachedHead = branch === 'HEAD';
  const displayName = isDetachedHead ? 'Detached HEAD' : branch;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <style>{DROPDOWN_CSS}</style>
      <div
        style={{
          ...indicatorStyle,
          backgroundColor: isOpen ? 'var(--bg-tertiary)' : 'transparent',
        }}
        onClick={() => !switching && setIsOpen((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen((v) => !v); } }}
        aria-label={`Git branch: ${displayName}`}
        aria-expanded={isOpen}
      >
        <BranchIcon />
        <span style={branchNameStyle}>
          {switching ? 'Switching...' : displayName}
        </span>
        <DropdownChevron open={isOpen} />
      </div>

      {isOpen && (
        <div style={dropdownStyle}>
          <div style={dropdownHeaderStyle}>
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search branches..."
              style={searchInputStyle}
              className="selectable"
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            />
          </div>

          <div style={sectionLabelStyle}>Local Branches</div>
          <div role="listbox" aria-label="Git branches">
            {filteredBranches.length === 0 && (
              <div style={{ padding: '8px', fontSize: '0.75rem', color: 'var(--text-faint)', textAlign: 'center' }}>
                {search ? 'No matching branches' : 'No branches found'}
              </div>
            )}
            {filteredBranches.map((b) => (
              <BranchItem
                key={b}
                name={b}
                isCurrent={b === branch}
                onClick={() => void handleCheckout(b)}
              />
            ))}
          </div>

          <CreateBranchRow onClick={() => void handleCreateBranch()} />
        </div>
      )}
    </div>
  );
}
