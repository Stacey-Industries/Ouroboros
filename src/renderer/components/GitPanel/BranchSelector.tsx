/**
 * BranchSelector.tsx — Branch dropdown for the Git panel.
 *
 * Shows current branch name and allows switching between local branches.
 */

import React, { memo, useState, useCallback, useRef, useEffect } from 'react';

export interface BranchSelectorProps {
  currentBranch: string | null;
  branches: string[];
  onCheckout: (branch: string) => void;
  isLoading?: boolean;
}

export const BranchSelector = memo(function BranchSelector({
  currentBranch,
  branches,
  onCheckout,
  isLoading,
}: BranchSelectorProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent): void {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = useCallback((branch: string) => {
    if (branch !== currentBranch) {
      onCheckout(branch);
    }
    setIsOpen(false);
  }, [currentBranch, onCheckout]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={isLoading}
        className="
          flex items-center gap-1.5 w-full px-2 py-1 rounded
          text-xs text-left
          bg-[var(--bg-tertiary)] hover:bg-[var(--bg)]
          border border-[var(--border)]
          transition-colors duration-75
          disabled:opacity-50
        "
        style={{ fontFamily: 'var(--font-mono, monospace)' }}
        title={currentBranch ?? 'No branch'}
      >
        {/* Branch icon */}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: 'var(--accent)' }}>
          <path d="M6 3v8" />
          <path d="M10 3v4" />
          <circle cx="6" cy="13" r="1.5" />
          <circle cx="6" cy="3" r="1.5" />
          <circle cx="10" cy="3" r="1.5" />
          <path d="M10 7c0 2-4 2-4 4" />
        </svg>

        <span className="flex-1 truncate" style={{ color: 'var(--text)' }}>
          {currentBranch ?? 'detached'}
        </span>

        {/* Chevron */}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
          <path d="M2.5 4L5 6.5L7.5 4" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && branches.length > 0 && (
        <div
          className="
            absolute z-50 left-0 right-0 mt-1
            bg-[var(--bg-secondary)] border border-[var(--border)]
            rounded shadow-lg overflow-y-auto
          "
          style={{ maxHeight: '200px' }}
        >
          {branches.map((branch) => (
            <button
              key={branch}
              onClick={() => handleSelect(branch)}
              className="
                w-full px-2 py-1 text-left text-xs truncate
                hover:bg-[var(--bg-tertiary)]
                transition-colors duration-75
              "
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                color: branch === currentBranch ? 'var(--accent)' : 'var(--text)',
                fontWeight: branch === currentBranch ? 600 : 400,
              }}
              title={branch}
            >
              {branch === currentBranch && (
                <span className="mr-1" style={{ color: 'var(--accent)' }}>*</span>
              )}
              {branch}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
