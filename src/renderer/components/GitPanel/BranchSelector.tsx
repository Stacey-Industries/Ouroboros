/**
 * BranchSelector.tsx â€” Branch dropdown for the Git panel.
 *
 * Shows current branch name and allows switching between local branches.
 */

import React, { memo, useCallback, useEffect,useRef, useState } from 'react'

export interface BranchSelectorProps {
  currentBranch: string | null
  branches: string[]
  onCheckout: (branch: string) => void
  isLoading?: boolean
}

function useDropdownDismiss(
  dropdownRef: React.RefObject<HTMLDivElement | null>,
  isOpen: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(event: MouseEvent): void {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownRef, isOpen, onClose])
}

export const BranchSelector = memo(function BranchSelector({
  currentBranch,
  branches,
  onCheckout,
  isLoading,
}: BranchSelectorProps): React.ReactElement<any> {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useDropdownDismiss(dropdownRef, isOpen, () => setIsOpen(false))

  const handleSelect = useCallback((branch: string) => {
    if (branch !== currentBranch) {
      onCheckout(branch)
    }
    setIsOpen(false)
  }, [currentBranch, onCheckout])

  return (
    <div className="relative" ref={dropdownRef}>
      <BranchSelectorTrigger currentBranch={currentBranch} isLoading={isLoading} onToggle={() => setIsOpen((prev) => !prev)} />
      {isOpen && branches.length > 0 && (
        <BranchDropdown branches={branches} currentBranch={currentBranch} onSelect={handleSelect} />
      )}
    </div>
  )
})

function BranchSelectorTrigger({
  currentBranch,
  isLoading,
  onToggle,
}: {
  currentBranch: string | null
  isLoading?: boolean
  onToggle: () => void
}): React.ReactElement<any> {
  return (
    <button
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
  )
}

function BranchDropdown({
  branches,
  currentBranch,
  onSelect,
}: {
  branches: string[]
  currentBranch: string | null
  onSelect: (branch: string) => void
}): React.ReactElement<any> {
  return (
    <div
      className="
        frosted-panel absolute z-50 left-0 right-0 mt-1
        bg-surface-panel border border-border-semantic
        rounded shadow-lg overflow-y-auto
      "
      style={{ maxHeight: '200px' }}
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
  )
}

function BranchOption({
  branch,
  isCurrent,
  onSelect,
}: {
  branch: string
  isCurrent: boolean
  onSelect: () => void
}): React.ReactElement<any> {
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
  )
}

function BranchIcon(): React.ReactElement<any> {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-interactive-accent">
      <path d="M6 3v8" />
      <path d="M10 3v4" />
      <circle cx="6" cy="13" r="1.5" />
      <circle cx="6" cy="3" r="1.5" />
      <circle cx="10" cy="3" r="1.5" />
      <path d="M10 7c0 2-4 2-4 4" />
    </svg>
  )
}

function ChevronIcon(): React.ReactElement<any> {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-text-semantic-muted">
      <path d="M2.5 4L5 6.5L7.5 4" />
    </svg>
  )
}
