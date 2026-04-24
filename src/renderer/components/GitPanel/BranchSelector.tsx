/**
 * BranchSelector.tsx â€” Branch dropdown for the Git panel.
 *
 * Shows current branch name and allows switching between local branches.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface BranchSelectorProps {
  currentBranch: string | null;
  branches: string[];
  onCheckout: (branch: string) => void;
  isLoading?: boolean;
}

interface DropdownDismissOptions {
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  isOpen: boolean;
  updatePosition: () => void;
  onClose: () => void;
}

function useDropdownDismiss(opts: DropdownDismissOptions): void {
  const { dropdownRef, buttonRef, isOpen, updatePosition, onClose } = opts;
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent): void {
      const target = event.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      onClose();
    }
    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    function handleWindowChange(): void {
      updatePosition();
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [buttonRef, dropdownRef, isOpen, onClose, updatePosition]);
}

function useBranchSelectorState(
  currentBranch: string | null,
  onCheckout: (branch: string) => void,
): {
  isOpen: boolean;
  menuPos: { left: number; top: number; width: number } | null;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  handleSelect: (branch: string) => void;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
} {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const updateMenuPos = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({ left: rect.left, top: rect.bottom + 4, width: rect.width });
  }, []);
  useDropdownDismiss({
    dropdownRef,
    buttonRef,
    isOpen,
    updatePosition: updateMenuPos,
    onClose: () => setIsOpen(false),
  });
  useEffect(() => {
    if (!isOpen) return;
    updateMenuPos();
  }, [isOpen, updateMenuPos]);
  const handleSelect = useCallback(
    (branch: string) => {
      if (branch !== currentBranch) onCheckout(branch);
      setIsOpen(false);
    },
    [currentBranch, onCheckout],
  );
  return { isOpen, menuPos, dropdownRef, buttonRef, handleSelect, setIsOpen };
}

export const BranchSelector = memo(function BranchSelector({
  currentBranch,
  branches,
  onCheckout,
  isLoading,
}: BranchSelectorProps): React.ReactElement {
  const { isOpen, menuPos, dropdownRef, buttonRef, handleSelect, setIsOpen } =
    useBranchSelectorState(currentBranch, onCheckout);
  return (
    <div className="relative">
      <BranchSelectorTrigger
        buttonRef={buttonRef}
        currentBranch={currentBranch}
        isLoading={isLoading}
        onToggle={() => setIsOpen((prev) => !prev)}
      />
      {isOpen &&
        branches.length > 0 &&
        menuPos &&
        createPortal(
          <BranchDropdown
            dropdownRef={dropdownRef}
            branches={branches}
            currentBranch={currentBranch}
            onSelect={handleSelect}
            style={{
              position: 'fixed',
              left: menuPos.left,
              top: menuPos.top,
              width: menuPos.width,
            }}
          />,
          document.body,
        )}
    </div>
  );
});

function BranchSelectorTrigger({
  buttonRef,
  currentBranch,
  isLoading,
  onToggle,
}: {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  currentBranch: string | null;
  isLoading?: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <button
      ref={buttonRef}
      onClick={onToggle}
      disabled={isLoading}
      className="
        flex items-center gap-1.5 w-full px-2 py-1 rounded
        text-xs text-left
        bg-surface-raised hover:bg-surface-base
        border border-border-semantic
        transition-colors duration-75
        disabled:opacity-50
      "
      style={{ fontFamily: 'var(--font-mono, monospace)' }}
      title={currentBranch ?? 'No branch'}
    >
      <BranchIcon />
      <span className="flex-1 truncate text-text-semantic-primary">
        {currentBranch ?? 'detached'}
      </span>
      <ChevronIcon />
    </button>
  );
}

const branchDropdownStyle: React.CSSProperties = {
  maxHeight: '200px',
  backdropFilter: 'blur(24px) saturate(140%)',
  WebkitBackdropFilter: 'blur(24px) saturate(140%)',
  ...({ WebkitAppRegion: 'no-drag' } as React.CSSProperties),
};

function BranchDropdown({
  dropdownRef,
  branches,
  currentBranch,
  onSelect,
  style,
}: {
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  branches: string[];
  currentBranch: string | null;
  onSelect: (branch: string) => void;
  style: React.CSSProperties;
}): React.ReactElement {
  return (
    <div
      ref={dropdownRef}
      role="listbox"
      aria-label="Git branches"
      className="frosted-panel z-[9999] bg-surface-overlay border border-border-semantic rounded shadow-lg overflow-y-auto"
      style={{ ...branchDropdownStyle, ...style }}
    >
      {branches.map((branch) => (
        <BranchOption
          key={branch}
          branch={branch}
          isCurrent={branch === currentBranch}
          onSelect={() => onSelect(branch)}
        />
      ))}
    </div>
  );
}

function BranchOption({
  branch,
  isCurrent,
  onSelect,
}: {
  branch: string;
  isCurrent: boolean;
  onSelect: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onSelect}
      className={`
        w-full px-2 py-1 text-left text-xs truncate
        hover:bg-surface-raised
        transition-colors duration-75
        ${isCurrent ? 'text-interactive-accent' : 'text-text-semantic-primary'}
      `}
      style={{
        fontFamily: 'var(--font-mono, monospace)',
        fontWeight: isCurrent ? 600 : 400,
      }}
      title={branch}
    >
      {isCurrent && <span className="mr-1 text-interactive-accent">*</span>}
      {branch}
    </button>
  );
}

function BranchIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0 text-interactive-accent"
    >
      <path d="M6 3v8" />
      <path d="M10 3v4" />
      <circle cx="6" cy="13" r="1.5" />
      <circle cx="6" cy="3" r="1.5" />
      <circle cx="10" cy="3" r="1.5" />
      <path d="M10 7c0 2-4 2-4 4" />
    </svg>
  );
}

function ChevronIcon(): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0 text-text-semantic-muted"
    >
      <path d="M2.5 4L5 6.5L7.5 4" />
    </svg>
  );
}
