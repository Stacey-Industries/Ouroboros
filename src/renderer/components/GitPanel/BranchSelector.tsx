/**
 * BranchSelector.tsx â€” Branch dropdown for the Git panel.
 *
 * Shows current branch name and allows switching between local branches.
 */

import React, { memo, useState, useCallback, useRef, useEffect } from 'react'

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
}: BranchSelectorProps): React.ReactElement {
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
}): React.ReactElement {
  return (
    <button
      onClick={onToggle}
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
      <BranchIcon />
      <span className="flex-1 truncate" style={{ color: 'var(--text)' }}>
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
}): React.ReactElement {
  return (
    <div
      className="
        absolute z-50 left-0 right-0 mt-1
        bg-[var(--bg-secondary)] border border-[var(--border)]
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
}): React.ReactElement {
  return (
    <button
      onClick={onSelect}
      className="
        w-full px-2 py-1 text-left text-xs truncate
        hover:bg-[var(--bg-tertiary)]
        transition-colors duration-75
      "
      style={{
        fontFamily: 'var(--font-mono, monospace)',
        color: isCurrent ? 'var(--accent)' : 'var(--text)',
        fontWeight: isCurrent ? 600 : 400,
      }}
      title={branch}
    >
      {isCurrent && <span className="mr-1" style={{ color: 'var(--accent)' }}>*</span>}
      {branch}
    </button>
  )
}

function BranchIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: 'var(--accent)' }}>
      <path d="M6 3v8" />
      <path d="M10 3v4" />
      <circle cx="6" cy="13" r="1.5" />
      <circle cx="6" cy="3" r="1.5" />
      <circle cx="10" cy="3" r="1.5" />
      <path d="M10 7c0 2-4 2-4 4" />
    </svg>
  )
}

function ChevronIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
      <path d="M2.5 4L5 6.5L7.5 4" />
    </svg>
  )
}
