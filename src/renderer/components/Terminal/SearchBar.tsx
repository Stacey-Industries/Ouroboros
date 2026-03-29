/**
 * TerminalSearchBar — in-terminal search bar (Ctrl+Shift+F).
 * Wraps the xterm SearchAddon with a find-next/prev UI.
 */

import type { SearchAddon } from '@xterm/addon-search'
import React, { useCallback,useEffect, useRef, useState } from 'react'

interface TerminalSearchBarProps {
  searchAddon: SearchAddon
  onClose: () => void
}

const containerStyle: React.CSSProperties = {
  position: 'absolute', top: 4, right: 16, zIndex: 10,
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '4px 8px', borderRadius: 4,
  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  fontFamily: 'var(--font-ui, sans-serif)', fontSize: 12,
}

const inputStyle: React.CSSProperties = {
  width: 160, padding: '3px 6px', borderRadius: 3,
  fontFamily: 'var(--font-mono, monospace)', fontSize: 12,
  outline: 'none',
}

const navBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none',
  cursor: 'pointer',
  padding: '2px 4px', fontSize: 14, lineHeight: 1,
}

function useSearchState(searchAddon: SearchAddon) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [matchInfo, setMatchInfo] = useState<{ resultIndex: number; resultCount: number } | null>(null)

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])

  useEffect(() => {
    const d = searchAddon.onDidChangeResults((e) => {
      setMatchInfo(e ? { resultIndex: e.resultIndex, resultCount: e.resultCount } : null)
    })
    return () => d.dispose()
  }, [searchAddon])

  return { inputRef, query, setQuery, matchInfo, setMatchInfo }
}

export function TerminalSearchBar({ searchAddon, onClose }: TerminalSearchBarProps): React.ReactElement<any> {
  const { inputRef, query, setQuery, matchInfo, setMatchInfo } = useSearchState(searchAddon)

  const findNext = useCallback(() => { if (query) searchAddon.findNext(query) }, [query, searchAddon])
  const findPrev = useCallback(() => { if (query) searchAddon.findPrevious(query) }, [query, searchAddon])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setQuery(v)
    if (v) {
      searchAddon.findNext(v)
      return
    }
    searchAddon.clearDecorations()
    setMatchInfo(null)
  }, [searchAddon, setQuery, setMatchInfo])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      searchAddon.clearDecorations()
      onClose()
      return
    }
    if (e.key === 'Enter') {
      if (e.shiftKey) findPrev()
      else findNext()
    }
  }, [onClose, findNext, findPrev, searchAddon])

  const matchLabel = matchInfo
    ? matchInfo.resultCount > 0 ? `${matchInfo.resultIndex + 1} of ${matchInfo.resultCount}` : 'No results'
    : ''

  return (
    <div className="bg-surface-panel border border-border-semantic" style={containerStyle} onKeyDown={handleKeyDown}>
      <input ref={inputRef} type="text" value={query} onChange={handleInputChange} placeholder="Search..." className="bg-surface-base text-text-semantic-primary border border-border-semantic rounded" style={inputStyle} />
      {matchLabel && <span className="text-text-semantic-muted" style={{ minWidth: 60, textAlign: 'center' }}>{matchLabel}</span>}
      <button onClick={findPrev} title="Previous match (Shift+Enter)" className="text-text-semantic-primary" style={navBtnStyle}>&#x25B2;</button>
      <button onClick={findNext} title="Next match (Enter)" className="text-text-semantic-primary" style={navBtnStyle}>&#x25BC;</button>
      <button onClick={() => { searchAddon.clearDecorations(); onClose() }} title="Close (Escape)" className="text-text-semantic-primary" style={{ ...navBtnStyle, marginLeft: 4 }}>&#x2715;</button>
    </div>
  )
}
