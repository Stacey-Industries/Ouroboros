/**
 * GitBranchIndicator - shows current git branch at the top of the file tree
 * with a dropdown for switching branches and creating new ones.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  BranchIcon,
  BranchItem,
  branchNameStyle,
  CreateBranchRow,
  DROPDOWN_CSS,
  DropdownChevron,
  dropdownHeaderStyle,
  dropdownStyle,
  indicatorStyle,
  searchInputStyle,
  sectionLabelStyle,
} from './GitBranchIndicator.helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GitBranchIndicatorProps {
  projectRoot: string;
  isRepo: boolean;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useBranchFetch(projectRoot: string, isRepo: boolean) {
  const [branch, setBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);

  const fetchBranch = useCallback(async () => {
    if (!projectRoot || !isRepo) return;
    try {
      const result = await window.electronAPI.git.branch(projectRoot);
      if (result.success && result.branch) setBranch(result.branch);
    } catch {
      /* ignore */
    }
  }, [projectRoot, isRepo]);

  const fetchBranches = useCallback(async () => {
    if (!projectRoot) return;
    try {
      const result = await window.electronAPI.git.branches(projectRoot);
      if (result.success && result.branches) {
        setBranches(
          result.branches.filter((b) => !b.includes('/HEAD') && !b.startsWith('origin/')),
        );
      }
    } catch {
      /* ignore */
    }
  }, [projectRoot]);

  useEffect(() => {
    fetchBranch();
    const interval = setInterval(fetchBranch, 5000);
    return () => clearInterval(interval);
  }, [fetchBranch]);

  return { branch, setBranch, branches, fetchBranches };
}

function useBranchActions(
  projectRoot: string,
  branch: string | null,
  setBranch: (b: string) => void,
) {
  const [switching, setSwitching] = useState(false);

  const handleCheckout = useCallback(
    async (targetBranch: string, setIsOpen: (v: boolean) => void) => {
      if (!projectRoot || targetBranch === branch) {
        setIsOpen(false);
        return;
      }
      setSwitching(true);
      try {
        const result = await window.electronAPI.git.checkout(projectRoot, targetBranch);
        if (result.success) setBranch(targetBranch);
      } catch {
        /* ignore */
      } finally {
        setSwitching(false);
        setIsOpen(false);
      }
    },
    [projectRoot, branch, setBranch],
  );

  const handleCreateBranch = useCallback(
    async (setIsOpen: (v: boolean) => void) => {
      const name = prompt('New branch name:');
      if (!name || !name.trim() || !projectRoot) return;
      const trimmed = name.trim();
      setSwitching(true);
      try {
        const result = await window.electronAPI.git.checkout(projectRoot, trimmed);
        if (result.success) setBranch(trimmed);
      } catch {
        /* ignore */
      } finally {
        setSwitching(false);
        setIsOpen(false);
      }
    },
    [projectRoot, setBranch],
  );

  return { switching, handleCheckout, handleCreateBranch };
}

function useBranchState(projectRoot: string, isRepo: boolean) {
  const { branch, setBranch, branches, fetchBranches } = useBranchFetch(projectRoot, isRepo);
  const { switching, handleCheckout, handleCreateBranch } = useBranchActions(
    projectRoot,
    branch,
    setBranch as (b: string) => void,
  );
  return { branch, branches, switching, fetchBranches, handleCheckout, handleCreateBranch };
}

function useBranchDropdown(
  containerRef: React.RefObject<HTMLDivElement | null>,
  fetchBranches: () => Promise<void>,
) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      void fetchBranches();
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else setSearch('');
  }, [isOpen, fetchBranches]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, containerRef]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  return { isOpen, setIsOpen, search, setSearch, searchInputRef };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BranchSearchInput({
  searchInputRef,
  search,
  setSearch,
}: {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  search: string;
  setSearch: (v: string) => void;
}): React.ReactElement {
  return (
    <input
      ref={searchInputRef}
      type="text"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="Search branches..."
      style={searchInputStyle}
      className="selectable bg-surface-base border border-border-semantic text-text-semantic-primary"
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--interactive-accent)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-default)';
      }}
    />
  );
}

function BranchDropdown({
  search,
  setSearch,
  searchInputRef,
  filteredBranches,
  branch,
  handleCheckout,
  handleCreateBranch,
  setIsOpen,
}: {
  search: string;
  setSearch: (v: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  filteredBranches: string[];
  branch: string;
  handleCheckout: (b: string, setOpen: (v: boolean) => void) => Promise<void>;
  handleCreateBranch: (setOpen: (v: boolean) => void) => Promise<void>;
  setIsOpen: (v: boolean) => void;
}): React.ReactElement {
  return (
    <div className="bg-surface-panel border border-border-semantic" style={dropdownStyle}>
      <div style={dropdownHeaderStyle}>
        <BranchSearchInput searchInputRef={searchInputRef} search={search} setSearch={setSearch} />
      </div>
      <div className="text-text-semantic-faint" style={sectionLabelStyle}>
        Local Branches
      </div>
      <div role="listbox" aria-label="Git branches">
        {filteredBranches.length === 0 && (
          <div
            className="text-text-semantic-faint"
            style={{ padding: '8px', fontSize: '0.75rem', textAlign: 'center' }}
          >
            {search ? 'No matching branches' : 'No branches found'}
          </div>
        )}
        {filteredBranches.map((b) => (
          <BranchItem
            key={b}
            name={b}
            isCurrent={b === branch}
            onClick={() => void handleCheckout(b, setIsOpen)}
          />
        ))}
      </div>
      <CreateBranchRow onClick={() => void handleCreateBranch(setIsOpen)} />
    </div>
  );
}

function BranchIndicatorBar({
  displayName,
  switching,
  isOpen,
  setIsOpen,
}: {
  displayName: string;
  switching: boolean;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
}): React.ReactElement {
  return (
    <div
      style={{
        ...indicatorStyle,
        backgroundColor: isOpen ? 'var(--surface-raised)' : 'transparent',
      }}
      onClick={() => !switching && setIsOpen(!isOpen)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIsOpen(!isOpen);
        }
      }}
      aria-label={`Git branch: ${displayName}`}
      aria-expanded={isOpen}
    >
      <BranchIcon />
      <span className="text-text-semantic-primary" style={branchNameStyle}>
        {switching ? 'Switching...' : displayName}
      </span>
      <DropdownChevron open={isOpen} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GitBranchIndicator({
  projectRoot,
  isRepo,
}: GitBranchIndicatorProps): React.ReactElement | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const { branch, branches, switching, fetchBranches, handleCheckout, handleCreateBranch } =
    useBranchState(projectRoot, isRepo);
  const { isOpen, setIsOpen, search, setSearch, searchInputRef } = useBranchDropdown(
    containerRef,
    fetchBranches,
  );

  if (!isRepo || !branch) return null;
  const filteredBranches = search
    ? branches.filter((b) => b.toLowerCase().includes(search.toLowerCase()))
    : branches;
  const displayName = branch === 'HEAD' ? 'Detached HEAD' : branch;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <style>{DROPDOWN_CSS}</style>
      <BranchIndicatorBar
        displayName={displayName}
        switching={switching}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
      />
      {isOpen && (
        <BranchDropdown
          search={search}
          setSearch={setSearch}
          searchInputRef={searchInputRef}
          filteredBranches={filteredBranches}
          branch={branch}
          handleCheckout={handleCheckout}
          handleCreateBranch={handleCreateBranch}
          setIsOpen={setIsOpen}
        />
      )}
    </div>
  );
}
