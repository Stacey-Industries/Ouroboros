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
  handleDividerPointerDown: (event: React.PointerEvent) => void
} {
  const [splitRatio, setSplitRatio] = useState(0.5)
  const isDraggingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleDividerPointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault()
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
    isDraggingRef.current = true

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const container = containerRef.current
      if (!isDraggingRef.current || !container) {
        return
      }

      const rect = container.getBoundingClientRect()
      const nextRatio = (moveEvent.clientX - rect.left) / rect.width
      setSplitRatio(clampSplitRatio(nextRatio))
    }

    const handlePointerUp = () => {
      isDraggingRef.current = false
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
      document.removeEventListener('pointercancel', handlePointerUp)
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('pointercancel', handlePointerUp)
  }, [])

  return { splitRatio, containerRef, handleDividerPointerDown }
}

function SplitDivider({
  onPointerDown,
}: {
  onPointerDown: (event: React.PointerEvent) => void
}): React.ReactElement<any> {
  return (
    <div
      className="bg-border-semantic"
      style={{ ...SPLIT_DIVIDER_STYLE, touchAction: 'none' }}
      onPointerDown={onPointerDown}
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
}): React.ReactElement<any> {
  return (
    <button onClick={onClose} title="Close split pane" className="border border-border-semantic bg-surface-panel text-text-semantic-muted" style={SPLIT_CLOSE_BUTTON_STYLE}>
      Close split
    </button>
  )
}

interface SplitPaneLayoutFrameProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  splitRatio: number
  handleDividerPointerDown: (event: React.PointerEvent) => void
  onClose: () => void
  leftPane: React.ReactNode
  rightPane: React.ReactNode
}

export function SplitPaneLayoutFrame({
  containerRef,
  splitRatio,
  handleDividerPointerDown,
  onClose,
  leftPane,
  rightPane,
}: SplitPaneLayoutFrameProps): React.ReactElement<any> {
  return (
    <div ref={containerRef as React.RefObject<HTMLDivElement | null>} style={SPLIT_LAYOUT_STYLE}>
      <div style={getLeftPaneStyle(splitRatio)}>{leftPane}</div>
      <SplitDivider onPointerDown={handleDividerPointerDown} />
      <div style={SPLIT_RIGHT_PANE_STYLE}>
        <SplitCloseButton onClose={onClose} />
        {rightPane}
      </div>
    </div>
  );
}
