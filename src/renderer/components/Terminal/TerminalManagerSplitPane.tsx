import React, { useCallback, useRef, useState } from 'react'

const SPLIT_LAYOUT_STYLE: React.CSSProperties = {
  display: 'flex',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
}

const SPLIT_DIVIDER_STYLE: React.CSSProperties = {
  width: 5,
  flexShrink: 0,
  cursor: 'col-resize',
  backgroundColor: 'var(--border, #333)',
  position: 'relative',
  zIndex: 5,
}

const SPLIT_RIGHT_PANE_STYLE: React.CSSProperties = {
  flex: 1,
  height: '100%',
  position: 'relative',
  overflow: 'hidden',
  minWidth: 0,
}

const SPLIT_CLOSE_BUTTON_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 4,
  right: 4,
  zIndex: 20,
  padding: '2px 6px',
  borderRadius: 3,
  border: '1px solid var(--border, #333)',
  backgroundColor: 'var(--bg-secondary, #1e1e1e)',
  color: 'var(--text-muted, #888)',
  fontFamily: 'var(--font-ui, sans-serif)',
  fontSize: 10,
  cursor: 'pointer',
}

function getLeftPaneStyle(splitRatio: number): React.CSSProperties {
  return {
    width: `${splitRatio * 100}%`,
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  }
}

function clampSplitRatio(nextRatio: number): number {
  return Math.max(0.2, Math.min(0.8, nextRatio))
}

export function useSplitResize(): {
  splitRatio: number
  containerRef: React.RefObject<HTMLDivElement | null>
  handleDividerMouseDown: (event: React.MouseEvent) => void
} {
  const [splitRatio, setSplitRatio] = useState(0.5)
  const isDraggingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleDividerMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    isDraggingRef.current = true

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const container = containerRef.current
      if (!isDraggingRef.current || !container) {
        return
      }

      const rect = container.getBoundingClientRect()
      const nextRatio = (moveEvent.clientX - rect.left) / rect.width
      setSplitRatio(clampSplitRatio(nextRatio))
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  return { splitRatio, containerRef, handleDividerMouseDown }
}

function SplitDivider({
  onMouseDown,
}: {
  onMouseDown: (event: React.MouseEvent) => void
}): React.ReactElement {
  return (
    <div
      style={SPLIT_DIVIDER_STYLE}
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize split pane"
    />
  )
}

function SplitCloseButton({
  onClose,
}: {
  onClose: () => void
}): React.ReactElement {
  return (
    <button onClick={onClose} title="Close split pane" style={SPLIT_CLOSE_BUTTON_STYLE}>
      Close split
    </button>
  )
}

interface SplitPaneLayoutFrameProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  splitRatio: number
  handleDividerMouseDown: (event: React.MouseEvent) => void
  onClose: () => void
  leftPane: React.ReactNode
  rightPane: React.ReactNode
}

export function SplitPaneLayoutFrame({
  containerRef,
  splitRatio,
  handleDividerMouseDown,
  onClose,
  leftPane,
  rightPane,
}: SplitPaneLayoutFrameProps): React.ReactElement {
  return (
    <div ref={containerRef} style={SPLIT_LAYOUT_STYLE}>
      <div style={getLeftPaneStyle(splitRatio)}>{leftPane}</div>
      <SplitDivider onMouseDown={handleDividerMouseDown} />
      <div style={SPLIT_RIGHT_PANE_STYLE}>
        <SplitCloseButton onClose={onClose} />
        {rightPane}
      </div>
    </div>
  )
}
