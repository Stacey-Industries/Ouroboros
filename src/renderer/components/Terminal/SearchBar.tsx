/**
 * TerminalSearchBar — in-terminal search bar (Ctrl+Shift+F).
 * Wraps the xterm SearchAddon with a find-next/prev UI.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { SearchAddon } from '@xterm/addon-search'

interface TerminalSearchBarProps {
  searchAddon: SearchAddon
  onClose: () => void
}

export function TerminalSearchBar({ searchAddon, onClose }: TerminalSearchBarProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [matchInfo, setMatchInfo] = useState<{ resultIndex: number; resultCount: number } | null>(null)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // Listen for search result changes
  useEffect(() => {
    const disposable = searchAddon.onDidChangeResults((e) => {
      if (e) {
        setMatchInfo({ resultIndex: e.resultIndex, resultCount: e.resultCount })
      } else {
        setMatchInfo(null)
      }
    })
    return () => disposable.dispose()
  }, [searchAddon])

  const findNext = useCallback(() => {
    if (query) searchAddon.findNext(query)
  }, [query, searchAddon])

  const findPrev = useCallback(() => {
    if (query) searchAddon.findPrevious(query)
  }, [query, searchAddon])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    if (value) {
      searchAddon.findNext(value)
    } else {
      searchAddon.clearDecorations()
      setMatchInfo(null)
    }
  }, [searchAddon])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      searchAddon.clearDecorations()
      onClose()
    } else if (e.key === 'Enter') {
      if (e.shiftKey) {
        findPrev()
      } else {
        findNext()
      }
    }
  }, [onClose, findNext, findPrev, searchAddon])

  const matchLabel = matchInfo
    ? matchInfo.resultCount > 0
      ? `${matchInfo.resultIndex + 1} of ${matchInfo.resultCount}`
      : 'No results'
    : ''

  return (
    <div
      style={{
        position: 'absolute',
        top: 4,
        right: 16,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderRadius: 4,
        backgroundColor: 'var(--bg-secondary, #1e1e1e)',
        border: '1px solid var(--border, #333)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        fontFamily: 'var(--font-ui, sans-serif)',
        fontSize: 12,
      }}
      onKeyDown={handleKeyDown}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInputChange}
        placeholder="Search..."
        style={{
          width: 160,
          padding: '3px 6px',
          borderRadius: 3,
          border: '1px solid var(--border, #444)',
          backgroundColor: 'var(--bg, #0d0d0d)',
          color: 'var(--text, #e0e0e0)',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 12,
          outline: 'none',
        }}
      />
      {matchLabel && (
        <span style={{ color: 'var(--text-secondary, #888)', minWidth: 60, textAlign: 'center' }}>
          {matchLabel}
        </span>
      )}
      <button
        onClick={findPrev}
        title="Previous match (Shift+Enter)"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text, #e0e0e0)',
          cursor: 'pointer',
          padding: '2px 4px',
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        &#x25B2;
      </button>
      <button
        onClick={findNext}
        title="Next match (Enter)"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text, #e0e0e0)',
          cursor: 'pointer',
          padding: '2px 4px',
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        &#x25BC;
      </button>
      <button
        onClick={() => {
          searchAddon.clearDecorations()
          onClose()
        }}
        title="Close (Escape)"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text, #e0e0e0)',
          cursor: 'pointer',
          padding: '2px 4px',
          fontSize: 14,
          lineHeight: 1,
          marginLeft: 4,
        }}
      >
        &#x2715;
      </button>
    </div>
  )
}
