/**
 * BlockNavigator — floating toolbar for navigating between command blocks.
 *
 * Sits in the top-right of the terminal container:
 * - Up/Down arrows to jump between blocks
 * - Block counter (e.g. "5 / 12")
 * - Appears only when there are 2+ blocks
 */

import React from 'react'

interface BlockNavigatorProps {
  totalBlocks: number
  activeIndex: number
  onNavigateUp: () => void
  onNavigateDown: () => void
  visible: boolean
}

export function BlockNavigator({
  totalBlocks,
  activeIndex,
  onNavigateUp,
  onNavigateDown,
  visible,
}: BlockNavigatorProps): React.ReactElement | null {
  if (!visible || totalBlocks < 2) return null

  const displayIndex = activeIndex >= 0 ? activeIndex + 1 : '-'

  return (
    <div
      style={{
        position: 'absolute',
        top: 36,
        right: 8,
        zIndex: 15,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '2px 4px',
        borderRadius: 4,
        border: '1px solid var(--border, #333)',
        backgroundColor: 'var(--bg-secondary, rgba(30,30,30,0.9))',
        backdropFilter: 'blur(4px)',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 10,
        color: 'var(--text-muted, #888)',
        userSelect: 'none',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
      }}
    >
      {/* Up arrow */}
      <button
        onClick={(e) => { e.stopPropagation(); onNavigateUp() }}
        disabled={activeIndex <= 0}
        title="Previous block (Alt+Up)"
        style={{
          background: 'none',
          border: 'none',
          color: activeIndex <= 0 ? 'var(--text-muted, #555)' : 'var(--text, #ccc)',
          cursor: activeIndex <= 0 ? 'default' : 'pointer',
          padding: '1px 3px',
          fontSize: 11,
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          opacity: activeIndex <= 0 ? 0.3 : 0.8,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 10l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Block counter */}
      <span style={{ padding: '0 2px', minWidth: 30, textAlign: 'center' }}>
        {displayIndex} / {totalBlocks}
      </span>

      {/* Down arrow */}
      <button
        onClick={(e) => { e.stopPropagation(); onNavigateDown() }}
        disabled={activeIndex >= totalBlocks - 1}
        title="Next block (Alt+Down)"
        style={{
          background: 'none',
          border: 'none',
          color: activeIndex >= totalBlocks - 1 ? 'var(--text-muted, #555)' : 'var(--text, #ccc)',
          cursor: activeIndex >= totalBlocks - 1 ? 'default' : 'pointer',
          padding: '1px 3px',
          fontSize: 11,
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          opacity: activeIndex >= totalBlocks - 1 ? 0.3 : 0.8,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}
