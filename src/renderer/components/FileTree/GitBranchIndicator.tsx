import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useGitBranch } from '../../hooks/useGitBranch';
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
  performCheckout,
  performCreateBranch,
  searchInputStyle,
  sectionLabelStyle,
} from './GitBranchIndicator.helpers';

export interface GitBranchIndicatorProps {
  projectRoot: string;
  isRepo: boolean;
}

function useBranchFetch(projectRoot: string, isRepo: boolean) {
  const { branch: polledBranch } = useGitBranch(isRepo ? projectRoot : null);
  const [branch, setBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);

  useEffect(() => {
    if (polledBranch !== null) setBranch(polledBranch);
  }, [polledBranch]);

  const fetchBranches = useCallback(async () => {
    if (!projectRoot) return;
    try {
      const r = await window.electronAPI.git.branches(projectRoot);
      if (r.success && r.branches)
        setBranches(r.branches.filter((b) => !b.includes('/HEAD') && !b.startsWith('origin/')));
    } catch {
      /* ignore */
    }
  }, [projectRoot]);
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
        await performCheckout(projectRoot, targetBranch, setBranch);
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
      setSwitching(true);
      try {
        await performCreateBranch(projectRoot, setBranch);
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
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, containerRef]);
  return { isOpen, setIsOpen, search, setSearch, searchInputRef };
}

type SearchInputProps = {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  search: string;
  setSearch: (v: string) => void;
};
function BranchSearchInput({
  searchInputRef,
  search,
  setSearch,
}: SearchInputProps): React.ReactElement {
  return (
    <input
      ref={searchInputRef as React.RefObject<HTMLInputElement | null>}
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

type BranchListProps = {
  filteredBranches: string[];
  branch: string;
  search: string;
  handleCheckout: (b: string, setOpen: (v: boolean) => void) => Promise<void>;
  setIsOpen: (v: boolean) => void;
};
function BranchList({
  filteredBranches,
  branch,
  search,
  handleCheckout,
  setIsOpen,
}: BranchListProps): React.ReactElement {
  const emptyMsg = search ? 'No matching branches' : 'No branches found';
  return (
    <div role="listbox" aria-label="Git branches">
      {filteredBranches.length === 0 && (
        <div
          className="text-text-semantic-faint"
          style={{ padding: '8px', fontSize: '0.75rem', textAlign: 'center' }}
        >
          {emptyMsg}
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
  );
}

type BranchDropdownProps = {
  search: string;
  setSearch: (v: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  filteredBranches: string[];
  branch: string;
  handleCheckout: (b: string, setOpen: (v: boolean) => void) => Promise<void>;
  handleCreateBranch: (setOpen: (v: boolean) => void) => Promise<void>;
  setIsOpen: (v: boolean) => void;
};
function BranchDropdown(p: BranchDropdownProps): React.ReactElement {
  return (
    <div
      className="frosted-panel bg-surface-panel border border-border-semantic"
      style={dropdownStyle}
    >
      <div style={dropdownHeaderStyle}>
        <BranchSearchInput
          searchInputRef={p.searchInputRef}
          search={p.search}
          setSearch={p.setSearch}
        />
      </div>
      <div className="text-text-semantic-faint" style={sectionLabelStyle}>
        Local Branches
      </div>
      <BranchList
        filteredBranches={p.filteredBranches}
        branch={p.branch}
        search={p.search}
        handleCheckout={p.handleCheckout}
        setIsOpen={p.setIsOpen}
      />
      <CreateBranchRow onClick={() => void p.handleCreateBranch(p.setIsOpen)} />
    </div>
  );
}

type BarProps = {
  displayName: string;
  switching: boolean;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
};
function BranchIndicatorBar({
  displayName,
  switching,
  isOpen,
  setIsOpen,
}: BarProps): React.ReactElement {
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
