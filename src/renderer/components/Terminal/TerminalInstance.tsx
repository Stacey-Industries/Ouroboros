/**
 * TerminalInstance — wraps a single xterm.js Terminal for one PTY session.
 *
 * Responsibilities:
 * - Creates and owns the xterm Terminal lifecycle (open -> dispose)
 * - Attaches FitAddon (ResizeObserver-driven) for auto-sizing
 * - Attaches SearchAddon for in-terminal search (Ctrl+Shift+F)
 * - Attaches WebLinksAddon for clickable URLs
 * - Reads theme colors from CSS vars and applies them on change
 * - Bridges xterm input/output to window.electronAPI.pty
 * - Reports title changes from OSC sequences to parent
 * - Right-click context menu (Copy / Paste / Clear / Select All)
 * - Floating copy button on hover
 * - Paste confirmation banner for large pastes (>1000 chars)
 *
 * Constraints:
 * - Terminal.open() must run after the div ref is attached (inside useEffect)
 * - Never import Node modules -- all IPC via preload bridge
 */

import React, { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import {
  TerminalContextMenu,
  INITIAL_TERMINAL_CONTEXT_MENU,
} from './TerminalContextMenu'
import type { TerminalContextMenuState } from './TerminalContextMenu'
import { CompletionOverlay } from './CompletionOverlay'
import type { Completion } from './CompletionOverlay'

// ─── Selection Tooltip ───────────────────────────────────────────────────────

type TooltipAction = 'url' | 'file' | null

interface SelectionTooltipState {
  visible: boolean
  x: number
  y: number
  text: string
  action: TooltipAction
}

const INITIAL_SELECTION_TOOLTIP: SelectionTooltipState = {
  visible: false,
  x: 0,
  y: 0,
  text: '',
  action: null,
}

function classifySelection(text: string): TooltipAction {
  const trimmed = text.trim()
  if (!trimmed) return null
  // URL: starts with http:// or https://
  if (/^https?:\/\//i.test(trimmed)) return 'url'
  // File path: contains a slash or backslash and a dot extension
  if (/(\/|\\)/.test(trimmed) && /\.\w+/.test(trimmed)) return 'file'
  return null
}

interface SelectionTooltipProps {
  state: SelectionTooltipState
  onOpenUrl: (url: string) => void
  onOpenFile: (filePath: string) => void
  onDismiss: () => void
}

function SelectionTooltip({
  state,
  onOpenUrl,
  onOpenFile,
  onDismiss,
}: SelectionTooltipProps): React.ReactElement | null {
  if (!state.visible || !state.action) return null

  const label = state.action === 'url' ? 'Open link' : 'Open file'

  function handleClick(e: React.MouseEvent): void {
    e.stopPropagation()
    if (state.action === 'url') {
      onOpenUrl(state.text.trim())
    } else {
      onOpenFile(state.text.trim())
    }
    onDismiss()
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: state.x,
        top: state.y,
        zIndex: 1000,
        padding: '3px 10px',
        borderRadius: 4,
        backgroundColor: 'var(--bg-secondary, #1e1e1e)',
        border: '1px solid var(--accent, #58a6ff)',
        color: 'var(--accent, #58a6ff)',
        fontFamily: 'var(--font-ui, sans-serif)',
        fontSize: 11,
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={handleClick}
    >
      {label}
    </div>
  )
}

export interface TerminalInstanceProps {
  sessionId: string
  isActive: boolean
  onTitleChange?: (sessionId: string, title: string) => void
  isRecording?: boolean
  onToggleRecording?: (sessionId: string) => void
  /** Called when user clicks Split button; parent creates a sibling PTY pane */
  onSplit?: (sessionId: string) => void
  /** When true, typed input is mirrored to all other sessions in allSessionIds */
  syncInput?: boolean
  /** IDs of all active terminal sessions (used when syncInput is true) */
  allSessionIds?: string[]
  /** Called when user clicks the sync toggle button */
  onToggleSync?: () => void
  /** Current working directory for the session (used for Tab completions) */
  cwd?: string
}

// ─── OSC 133 Shell Integration ────────────────────────────────────────────────
//
// OSC 133 (also called "semantic shell integration") marks shell prompt and
// command boundaries with invisible escape sequences:
//   \x1b]133;A\x07  — prompt start
//   \x1b]133;B\x07  — command start (user input begins)
//   \x1b]133;C\x07  — command execution starts (output begins)
//   \x1b]133;D;N\x07 — command ends, N is exit code
//
// We parse these from the raw PTY data stream (before writing to xterm) so we
// can track command boundaries and draw decorations on completed blocks.
//
// If no OSC 133 sequences arrive within OSC133_GRACE_MS of first output the
// feature disables itself silently.

const OSC133_GRACE_MS = 3000
const OSC133_RE = /\x1b\]133;([A-D])(?:;(\d+))?\x07/g

interface CommandBlock {
  /** Buffer row where the prompt started */
  promptRow: number
  /** Buffer row where the command output started */
  outputRow: number | null
  /** Exit code, -1 if still running */
  exitCode: number
  /** Whether this block is complete (133;D received) */
  complete: boolean
}

// ─── Command History Search Overlay ──────────────────────────────────────────

interface CommandSearchProps {
  commands: string[]
  onSelect: (cmd: string) => void
  onClose: () => void
}

function CommandSearchOverlay({ commands, onSelect, onClose }: CommandSearchProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const filtered = query.trim()
    ? commands.filter((c) => c.toLowerCase().includes(query.toLowerCase()))
    : commands

  // Reset selected index when filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = filtered[selectedIndex]
      if (cmd) onSelect(cmd)
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '50%',
        backgroundColor: 'var(--bg-secondary, #1e1e1e)',
        borderTop: '1px solid var(--border, #333)',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.4)',
        fontFamily: 'var(--font-ui, sans-serif)',
        fontSize: 12,
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Search input row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderBottom: '1px solid var(--border, #333)',
          flexShrink: 0,
        }}
      >
        <span style={{ color: 'var(--accent, #58a6ff)', fontSize: 11, flexShrink: 0 }}>
          bck-i-search:
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1,
            padding: '2px 6px',
            borderRadius: 3,
            border: '1px solid var(--border, #444)',
            backgroundColor: 'var(--bg, #0d0d0d)',
            color: 'var(--text, #e0e0e0)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
            outline: 'none',
          }}
          placeholder="Type to filter history..."
        />
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted, #888)',
            cursor: 'pointer',
            padding: '2px 4px',
            fontSize: 14,
          }}
          title="Close (Esc)"
        >
          &#x2715;
        </button>
      </div>

      {/* Results list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {filtered.length === 0 && (
          <div style={{ padding: '8px 12px', color: 'var(--text-muted, #888)' }}>
            No matching commands
          </div>
        )}
        {filtered.slice(0, 100).map((cmd, i) => (
          <div
            key={i}
            onClick={() => onSelect(cmd)}
            style={{
              padding: '4px 12px',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 12,
              color: i === selectedIndex ? 'var(--text, #e0e0e0)' : 'var(--text-muted, #888)',
              backgroundColor: i === selectedIndex ? 'var(--bg-tertiary, #2a2a2a)' : 'transparent',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              borderLeft: i === selectedIndex ? '2px solid var(--accent, #58a6ff)' : '2px solid transparent',
            }}
            onMouseEnter={() => setSelectedIndex(i)}
          >
            {cmd}
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div
        style={{
          padding: '4px 10px',
          borderTop: '1px solid var(--border, #333)',
          color: 'var(--text-muted, #888)',
          fontSize: 10,
          flexShrink: 0,
        }}
      >
        Enter to paste  ·  Arrows to navigate  ·  Esc to close
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function buildXtermTheme(): {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
} {
  const bg = getCssVar('--term-bg') || '#0d0d0d'
  const fg = getCssVar('--term-fg') || '#e0e0e0'
  const cursor = getCssVar('--term-cursor') || '#e0e0e0'
  const selection = getCssVar('--term-selection') || 'rgba(255,255,255,0.2)'

  return {
    background: bg,
    foreground: fg,
    cursor,
    cursorAccent: bg,
    selectionBackground: selection,
    // ANSI 16 — lean on system defaults, only override the non-negotiable ones
    black: '#000000',
    red: '#cc5555',
    green: '#55aa55',
    yellow: '#aaaa55',
    blue: '#5555cc',
    magenta: '#aa55aa',
    cyan: '#55aaaa',
    white: '#aaaaaa',
    brightBlack: '#555555',
    brightRed: '#ff5555',
    brightGreen: '#55ff55',
    brightYellow: '#ffff55',
    brightBlue: '#5555ff',
    brightMagenta: '#ff55ff',
    brightCyan: '#55ffff',
    brightWhite: '#ffffff',
  }
}

// ─── Search Bar Component ────────────────────────────────────────────────────

interface TerminalSearchBarProps {
  searchAddon: SearchAddon
  onClose: () => void
}

function TerminalSearchBar({ searchAddon, onClose }: TerminalSearchBarProps): React.ReactElement {
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

// ─── Copy Button (hover overlay) ─────────────────────────────────────────────

interface CopyButtonProps {
  terminal: Terminal | null
  visible: boolean
}

function CopyButton({ terminal, visible }: CopyButtonProps): React.ReactElement {
  const [copied, setCopied] = useState(false)

  function handleCopy(): void {
    if (!terminal) return

    const selection = terminal.getSelection()
    let textToCopy = selection

    if (!textToCopy) {
      // Nothing selected — copy last output block (lines before current cursor row)
      const buffer = terminal.buffer.active
      const cursorRow = buffer.cursorY
      // Collect up to 50 lines before cursor, trimming trailing empty lines
      const lines: string[] = []
      const startRow = Math.max(0, cursorRow - 50)
      for (let i = startRow; i < cursorRow; i++) {
        const line = buffer.getLine(i)
        lines.push(line ? line.translateToString(true) : '')
      }
      // Remove trailing blank lines
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop()
      }
      textToCopy = lines.join('\n')
    }

    if (textToCopy) {
      void navigator.clipboard.writeText(textToCopy).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
    }
  }

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy terminal output'}
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 4,
        border: '1px solid var(--border, #333)',
        backgroundColor: 'var(--bg-secondary, #1e1e1e)',
        color: copied ? 'var(--accent, #58a6ff)' : 'var(--text-muted, #888)',
        fontFamily: 'var(--font-ui, sans-serif)',
        fontSize: 11,
        cursor: 'pointer',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 0.15s ease, color 0.1s ease',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// ─── Paste Confirmation Banner ────────────────────────────────────────────────

const PASTE_CONFIRM_THRESHOLD = 1000

interface PasteConfirmBannerProps {
  text: string
  onConfirm: () => void
  onCancel: () => void
}

function PasteConfirmBanner({ text, onConfirm, onCancel }: PasteConfirmBannerProps): React.ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        backgroundColor: 'var(--bg-secondary, #1e1e1e)',
        borderTop: '1px solid var(--border, #333)',
        fontFamily: 'var(--font-ui, sans-serif)',
        fontSize: 12,
        color: 'var(--text, #e0e0e0)',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.2)',
      }}
    >
      <span style={{ flex: 1, color: 'var(--text-muted, #888)' }}>
        Paste {text.length.toLocaleString()} characters?
      </span>
      <button
        onClick={onConfirm}
        autoFocus
        style={{
          padding: '3px 12px',
          borderRadius: 4,
          border: 'none',
          backgroundColor: 'var(--accent, #58a6ff)',
          color: 'var(--bg, #0d0d0d)',
          fontFamily: 'var(--font-ui, sans-serif)',
          fontSize: 12,
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Yes
      </button>
      <button
        onClick={onCancel}
        style={{
          padding: '3px 10px',
          borderRadius: 4,
          border: '1px solid var(--border, #333)',
          backgroundColor: 'transparent',
          color: 'var(--text-muted, #888)',
          fontFamily: 'var(--font-ui, sans-serif)',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TerminalInstance({
  sessionId,
  isActive,
  onTitleChange,
  isRecording = false,
  onToggleRecording,
  onSplit,
  syncInput = false,
  allSessionIds = [],
  onToggleSync,
  cwd,
}: TerminalInstanceProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  // Guards all fit() calls until xterm's Viewport dimensions are wired up.
  // Set to true only after the double-rAF in the bootstrap effect resolves.
  const isReadyRef = useRef(false)

  // ── Resize throttle/debounce refs ──────────────────────────────────────────
  // RAF id for throttling fit() — cancelled before scheduling a new one
  const rafIdRef = useRef<number>(0)
  // Debounce timer for IPC resize — only sends to main after 50ms of quiet
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Triple-click selection refs ─────────────────────────────────────────────
  const clickCountRef = useRef(0)
  const clickResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Sync input refs — kept current so onData closure always sees latest ─────
  const syncInputRef = useRef(syncInput)
  const allSessionIdsRef = useRef(allSessionIds)
  useEffect(() => { syncInputRef.current = syncInput }, [syncInput])
  useEffect(() => { allSessionIdsRef.current = allSessionIds }, [allSessionIds])

  const [showSearch, setShowSearch] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<TerminalContextMenuState>(
    INITIAL_TERMINAL_CONTEXT_MENU
  )

  // Paste confirmation state — null means no pending paste
  const [pendingPaste, setPendingPaste] = useState<string | null>(null)

  // Selection tooltip state
  const [selectionTooltip, setSelectionTooltip] = useState<SelectionTooltipState>(
    INITIAL_SELECTION_TOOLTIP
  )

  // ── OSC 133 command block state ─────────────────────────────────────────────
  // osc133Enabled: true = active, false = disabled (no sequences seen in grace period)
  // null = not yet determined (waiting for first output or grace period)
  const osc133EnabledRef = useRef<boolean | null>(null)
  const osc133GraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const osc133FirstOutputRef = useRef(false)
  // Current in-progress block
  const currentBlockRef = useRef<CommandBlock | null>(null)
  // All completed block decorations (tracked for cleanup)
  const blockDecorationDisposablesRef = useRef<Array<{ dispose(): void }>>([])

  // ── Command search (Ctrl+R) state ───────────────────────────────────────────
  const [showCmdSearch, setShowCmdSearch] = useState(false)
  const [cmdHistory, setCmdHistory] = useState<string[]>([])
  // Commands gathered from OSC 133 B sequences in this session
  const sessionCommandsRef = useRef<string[]>([])

  // ── App-level command history (Up/Down arrow navigation) ───────────────────
  // historyRef: commands in newest-first order (index 0 = most recent)
  const historyRef = useRef<string[]>([])
  // histPosRef: current position in history; -1 = not navigating
  const histPosRef = useRef<number>(-1)
  // currentLineRef: tracks the line currently being typed (before history nav)
  const currentLineRef = useRef<string>('')

  // ── Tab completion state ────────────────────────────────────────────────────
  const [completions, setCompletions] = useState<Completion[]>([])
  const [completionVisible, setCompletionVisible] = useState(false)
  const [completionIndex, setCompletionIndex] = useState(0)
  const [completionPos, setCompletionPos] = useState({ x: 0, y: 0 })
  // Ref versions so onKey closure always sees current values without re-creating
  const completionVisibleRef = useRef(false)
  const completionIndexRef = useRef(0)
  const completionsRef = useRef<Completion[]>([])
  // cwd ref — updated whenever cwd prop changes so completions always use latest
  const cwdRef = useRef(cwd ?? '')
  // Stable ref for handleTabCompletion used inside bootstrap effect (avoid stale closure)
  const handleTabCompletionRef = useRef<(() => Promise<void>) | null>(null)

  // Keep cwd ref in sync whenever the prop changes
  useEffect(() => { cwdRef.current = cwd ?? '' }, [cwd])

  // ── Write buffer: batch PTY data into one term.write() per animation frame ──
  // Claude Code's TUI moves the cursor across multiple rows during each redraw.
  // Without batching, each small data chunk causes xterm to render the cursor at
  // an intermediate position, creating ghost cursors on the thinking/prompt rows.
  const writeBufferRef = useRef('')
  const writeRafRef = useRef(0)

  // Keep completion refs in sync with state so onKey closure sees current values
  useEffect(() => { completionVisibleRef.current = completionVisible }, [completionVisible])
  useEffect(() => { completionIndexRef.current = completionIndex }, [completionIndex])
  useEffect(() => { completionsRef.current = completions }, [completions])

  // ── Core fit logic (visual + IPC) ──────────────────────────────────────────
  // fitNow: does the actual xterm fit() and schedules a debounced IPC resize.
  // Called only from inside a RAF, so the viewport is always paint-ready.
  const fitNow = useCallback(() => {
    if (!isReadyRef.current) return
    const addon = fitAddonRef.current
    const term = terminalRef.current
    if (!addon || !term) return
    try {
      const proposed = addon.proposeDimensions()
      if (!proposed) return
      // Skip if dimensions haven't actually changed — calling fit() when
      // cols/rows are the same still triggers term.resize() internally,
      // which recalculates the viewport and can reset scroll position to top.
      if (proposed.cols === term.cols && proposed.rows === term.rows) return
      // Instant visual update — local to renderer, no IPC cost
      addon.fit()
      const { cols, rows } = term

      // Debounce the IPC call: cancel previous timer, schedule new one 50ms out.
      // This prevents flooding the main process during continuous drag.
      if (resizeDebounceRef.current !== null) {
        clearTimeout(resizeDebounceRef.current)
      }
      resizeDebounceRef.current = setTimeout(() => {
        resizeDebounceRef.current = null
        void window.electronAPI.pty.resize(sessionId, cols, rows)
      }, 50)
    } catch {
      // fit can throw if the container has zero dimensions; ignore
    }
  }, [sessionId])

  // Stable reference to fit — called from multiple places.
  // Throttled via RAF: cancels any pending frame before scheduling a new one,
  // so at most one fit() runs per animation frame regardless of how frequently
  // the ResizeObserver fires during a drag.
  const fit = useCallback(() => {
    if (!isReadyRef.current) return
    // Cancel any previously scheduled (but not yet run) fit frame
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current)
    }
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = 0
      fitNow()
    })
  }, [fitNow])

  // ── Theme sync ──────────────────────────────────────────────────────────────

  const syncTheme = useCallback(() => {
    const term = terminalRef.current
    if (!term) return
    term.options = { theme: buildXtermTheme() }
  }, [])

  // ── Tab completions ─────────────────────────────────────────────────────────

  const generateCompletions = useCallback(async (
    line: string,
    word: string,
    cwd_: string,
  ): Promise<Completion[]> => {
    const results: Completion[] = []

    // Git branch completion: "git checkout|merge|rebase|diff|branch <partial>"
    if (/\bgit\s+(checkout|merge|rebase|diff|branch)\s+\S*$/.test(line)) {
      const branchResult = await window.electronAPI.git.branches(cwd_)
      if (branchResult.success && branchResult.branches) {
        for (const b of branchResult.branches) {
          if (b.startsWith(word)) results.push({ value: b, type: 'branch' })
        }
      }
      return results.slice(0, 20)
    }

    // Git subcommand completion: "git <partial>"
    if (/^git\s+\S*$/.test(line.trim())) {
      const subcmds = [
        'add', 'commit', 'push', 'pull', 'checkout', 'branch', 'merge',
        'rebase', 'status', 'log', 'diff', 'stash', 'fetch', 'clone',
        'init', 'remote', 'reset', 'restore', 'tag',
      ]
      for (const cmd of subcmds) {
        if (cmd.startsWith(word)) results.push({ value: cmd, type: 'git-subcmd' })
      }
      return results
    }

    // File path completion — only when there's a partial word to complete
    if (word.length > 0) {
      const sep = cwd_.includes('\\') ? '\\' : '/'
      const lastSep = Math.max(word.lastIndexOf('/'), word.lastIndexOf('\\'))
      const dirPart = lastSep >= 0 ? word.slice(0, lastSep + 1) : ''
      const filePart = lastSep >= 0 ? word.slice(lastSep + 1) : word

      const searchDir = dirPart
        ? (dirPart.startsWith('/') || /^[A-Za-z]:/.test(dirPart)
          ? dirPart
          : cwd_ + sep + dirPart)
        : cwd_

      const dirResult = await window.electronAPI.files.readDir(searchDir)
      if (dirResult.success && dirResult.items) {
        for (const item of dirResult.items) {
          if (item.name.startsWith(filePart) && !item.name.startsWith('.')) {
            results.push({
              value: dirPart + item.name,
              type: item.isDirectory ? 'dir' : 'file',
            })
          }
        }
      }
      return results.slice(0, 20)
    }

    return results
  }, [])

  const applyCompletion = useCallback((value: string, type: string) => {
    const line = currentLineRef.current
    const word = line.split(/\s+/).pop() ?? ''
    const suffix = value.slice(word.length)
    void window.electronAPI.pty.write(sessionId, suffix + (type === 'dir' ? '/' : ' '))
    currentLineRef.current = line + suffix + (type === 'dir' ? '/' : ' ')
    completionVisibleRef.current = false
    setCompletionVisible(false)
    setCompletions([])
  }, [sessionId])

  const handleTabCompletion = useCallback(async () => {
    // Refresh cwd from the PTY before completing
    const cwdResult = await window.electronAPI.pty.getCwd(sessionId)
    if (cwdResult.success && cwdResult.cwd) {
      cwdRef.current = cwdResult.cwd
    }

    const line = currentLineRef.current
    const word = line.split(/\s+/).pop() ?? ''

    const suggestions = await generateCompletions(line, word, cwdRef.current)
    if (suggestions.length === 0) return

    if (suggestions.length === 1) {
      // Single match — auto-complete immediately
      const completion = suggestions[0]
      const suffix = completion.value.slice(word.length)
      void window.electronAPI.pty.write(
        sessionId,
        suffix + (completion.type === 'dir' ? '/' : ' '),
      )
      currentLineRef.current = line + suffix + (completion.type === 'dir' ? '/' : ' ')
      return
    }

    // Multiple matches — show popup
    setCompletions(suggestions)
    completionsRef.current = suggestions
    setCompletionIndex(0)
    completionIndexRef.current = 0
    setCompletionVisible(true)
    completionVisibleRef.current = true
    // Position popup above the input area (bottom-left of terminal)
    setCompletionPos({ x: 8, y: 40 })
  }, [sessionId, generateCompletions])

  // Keep callback ref current so the bootstrap onKey closure always calls the latest version
  // (must come after handleTabCompletion is defined)
  useEffect(() => { handleTabCompletionRef.current = handleTabCompletion }, [handleTabCompletion])

  // ── Bootstrap (create + open terminal) ─────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const fontFamily = getCssVar('--font-mono') || 'monospace'
    const fontSize = 13

    const term = new Terminal({
      fontFamily,
      fontSize,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      cursorInactiveStyle: 'none',
      scrollback: 5000,
      allowProposedApi: true,
      theme: buildXtermTheme(),
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    fitAddonRef.current = fitAddon

    // Search addon
    const searchAddon = new SearchAddon()
    term.loadAddon(searchAddon)
    searchAddonRef.current = searchAddon

    // Web links addon — open URLs via Electron shell
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      void window.electronAPI.app.openExternal(uri)
    })
    term.loadAddon(webLinksAddon)

    term.open(container)
    terminalRef.current = term

    // Block OSC 10/11/12 — prevent programs from permanently overriding theme colors.
    // Terminal programs (vim, tmux, shell prompts) can emit these OSC sequences to
    // change the terminal's foreground (10), background (11), and cursor (12) colors.
    // Without blocking, text gradually drifts to white and the cursor changes color.
    const oscFgBlocker = term.parser.registerOscHandler(10, () => true)
    const oscBgBlocker = term.parser.registerOscHandler(11, () => true)
    const oscCursorBlocker = term.parser.registerOscHandler(12, () => true)

    // Watch for title changes from OSC sequences (e.g. shell sets window title)
    const titleDisposable = term.onTitleChange((title) => {
      onTitleChange?.(sessionId, title)
    })

    // ── OSC 133 parser ─────────────────────────────────────────────────────────
    // Parse OSC 133 sequences from raw PTY output before writing to xterm.
    // This lets us draw command block decorations using xterm's decoration API.

    function registerCommandBlockDecoration(block: CommandBlock): void {
      const term_ = terminalRef.current
      if (!term_ || !block.complete) return

      // xterm decoration API requires allowProposedApi: true (already set).
      // registerMarker(offsetFromCurrentCursor) — negative offset goes back in
      // the scrollback. We compute the offset as promptRow minus current absolute row.
      // We then draw a decoration that spans from the prompt to the end of output.
      try {
        const absoluteCursor = term_.buffer.active.viewportY + term_.buffer.active.cursorY
        const offsetFromCursor = block.promptRow - absoluteCursor

        // Calculate block height: from prompt row to current cursor (end of output).
        // At 133;D time the cursor is at the end of the command output.
        const blockHeight = Math.max(1, absoluteCursor - block.promptRow + 1)

        const marker = term_.registerMarker(offsetFromCursor)
        if (!marker) return

        const dec = term_.registerDecoration({
          marker,
          x: 0,
          width: term_.cols,
          height: blockHeight,
          layer: 'bottom',
        })

        if (dec) {
          dec.onRender((element) => {
            element.style.cssText = [
              'border-left:2px solid var(--border,#333)',
              'background:var(--bg-secondary,rgba(30,30,30,0.25))',
              'pointer-events:none',
              'box-sizing:border-box',
              'width:100%',
              'height:100%',
            ].join(';')
          })
          blockDecorationDisposablesRef.current.push(dec)
          // Also dispose the marker we created
          blockDecorationDisposablesRef.current.push(marker)
        }
      } catch {
        // Decoration API may fail in some contexts (older xterm, headless) — ignore
      }
    }

    function handleOsc133(sequence: string, param: string | undefined): void {
      const term_ = terminalRef.current
      if (!term_) return

      const viewportY = term_.buffer.active.viewportY
      const cursorY = term_.buffer.active.cursorY
      const absoluteRow = viewportY + cursorY

      if (sequence === 'A') {
        // Prompt start — begin a new block
        currentBlockRef.current = {
          promptRow: absoluteRow,
          outputRow: null,
          exitCode: -1,
          complete: false,
        }
        osc133EnabledRef.current = true
        if (osc133GraceTimerRef.current !== null) {
          clearTimeout(osc133GraceTimerRef.current)
          osc133GraceTimerRef.current = null
        }
      } else if (sequence === 'B') {
        // Command start — the line the user is typing
        // Record current prompt for the command we're about to collect
        // (nothing to record yet — we'll grab the text on 'C')
      } else if (sequence === 'C') {
        // Output start — command is running
        if (currentBlockRef.current) {
          currentBlockRef.current.outputRow = absoluteRow
        }
      } else if (sequence === 'D') {
        // Command end
        const exitCode = param !== undefined ? parseInt(param, 10) : 0
        const block = currentBlockRef.current
        if (block) {
          block.exitCode = exitCode
          block.complete = true
          registerCommandBlockDecoration(block)
          currentBlockRef.current = null
        }
      }
    }

    function parseAndStripOsc133(raw: string): string {
      // Mark that we've seen output; if no OSC 133 in grace period, disable
      if (!osc133FirstOutputRef.current) {
        osc133FirstOutputRef.current = true
        if (osc133EnabledRef.current === null) {
          osc133GraceTimerRef.current = setTimeout(() => {
            // No OSC 133 sequences in grace period — disable silently
            if (osc133EnabledRef.current === null) {
              osc133EnabledRef.current = false
            }
            osc133GraceTimerRef.current = null
          }, OSC133_GRACE_MS)
        }
      }

      if (osc133EnabledRef.current === false) {
        return raw // Feature disabled — pass through unchanged
      }

      // Parse OSC 133 sequences; strip them from the output sent to xterm
      // (xterm would ignore them anyway, but stripping keeps the buffer clean)
      OSC133_RE.lastIndex = 0
      let result = raw
      let match: RegExpExecArray | null

      // Collect matches first (avoid mutation during iteration)
      const matches: Array<{ sequence: string; param: string | undefined; full: string }> = []
      while ((match = OSC133_RE.exec(raw)) !== null) {
        matches.push({ sequence: match[1], param: match[2], full: match[0] })
      }

      for (const m of matches) {
        handleOsc133(m.sequence, m.param)
        result = result.replace(m.full, '')
      }

      return result
    }

    // Track commands entered via OSC 133 B→C transitions
    // We snapshot the terminal buffer at the 'B' marker position.
    // Simpler: intercept xterm's onData for commands typed by user.

    // Bridge: PTY -> xterm (with OSC 133 interception)
    // Data is buffered and flushed once per animation frame to prevent ghost
    // cursors. TUI apps like Claude Code rapidly reposition the cursor across
    // multiple rows during a single redraw; batching ensures xterm only renders
    // the cursor at the final position of each frame.
    const dataCleanup = window.electronAPI.pty.onData(sessionId, (data) => {
      const stripped = parseAndStripOsc133(data)
      writeBufferRef.current += stripped
      if (!writeRafRef.current) {
        writeRafRef.current = requestAnimationFrame(() => {
          writeRafRef.current = 0
          const buf = writeBufferRef.current
          if (buf) {
            writeBufferRef.current = ''
            term.write(buf)
          }
        })
      }
    })

    // Bridge: xterm -> PTY (with paste confirmation for large pastes)
    // Also intercept command lines for Ctrl+R history
    const inputDisposable = term.onData((data) => {
      // Track commands: when user presses Enter, grab the current line
      if (data === '\r' || data === '\n') {
        // Grab the current cursor line as a command candidate
        try {
          const buffer = term.buffer.active
          const row = buffer.viewportY + buffer.cursorY
          const line = buffer.getLine(row)
          if (line) {
            const text = line.translateToString(true).trim()
            if (text && text.length > 0 && text.length < 500) {
              // Add to front of session commands (dedup)
              const cmds = sessionCommandsRef.current
              if (cmds[0] !== text) {
                sessionCommandsRef.current = [text, ...cmds.filter((c) => c !== text)].slice(0, 200)
              }
            }
          }
        } catch {
          // Buffer access can fail in edge cases — ignore
        }
      }

      // Detect paste: data longer than 1 char that isn't an escape sequence
      // (xterm sends the full clipboard text as a single onData event when
      // bracketedPaste is off, or wrapped with ESC[?2004h brackets when on)
      if (data.length > PASTE_CONFIRM_THRESHOLD) {
        // Large paste — show confirmation banner instead of writing immediately
        setPendingPaste(data)
        return
      }
      void window.electronAPI.pty.write(sessionId, data)

      // Mirror input to all other sessions when sync mode is active
      if (syncInputRef.current) {
        for (const otherId of allSessionIdsRef.current) {
          if (otherId !== sessionId) {
            void window.electronAPI.pty.write(otherId, data)
          }
        }
      }
    })

    // ── App-level Up/Down arrow history navigation ──────────────────────────
    // This intercepts ArrowUp/ArrowDown before they reach the PTY so we can
    // implement reliable history navigation even when the shell's readline
    // history isn't working correctly.
    //
    // Strategy:
    //   - Track each printable character typed to build currentLineRef
    //   - On Enter: push currentLineRef to historyRef (newest-first, max 500)
    //   - On ArrowUp: increment histPosRef, send Ctrl+U then the history entry
    //   - On ArrowDown: decrement histPosRef; at -1 send Ctrl+U to clear
    //   - Backspace: trim currentLineRef
    //   - Any other navigation: reset histPosRef so arrow keys work normally
    //     after the user manually edits the recalled line

    const historyKeyDisposable = term.onKey((e) => {
      const { domEvent, key } = e
      const code = domEvent.code

      // ── Tab completion ────────────────────────────────────────────────────
      if (domEvent.key === 'Tab') {
        domEvent.preventDefault()
        if (completionVisibleRef.current) {
          // Cycle to next completion
          const next = (completionIndexRef.current + 1) % completionsRef.current.length
          completionIndexRef.current = next
          setCompletionIndex(next)
        } else {
          void handleTabCompletionRef.current?.()
        }
        return
      }

      // ── When completion popup is visible, intercept navigation keys ───────
      if (completionVisibleRef.current) {
        if (code === 'ArrowDown') {
          domEvent.preventDefault()
          const next = Math.min(completionIndexRef.current + 1, completionsRef.current.length - 1)
          completionIndexRef.current = next
          setCompletionIndex(next)
          return
        }
        if (code === 'ArrowUp') {
          domEvent.preventDefault()
          const prev = Math.max(completionIndexRef.current - 1, 0)
          completionIndexRef.current = prev
          setCompletionIndex(prev)
          return
        }
        if (key === '\r' || key === '\n') {
          // Enter — apply selected completion
          domEvent.preventDefault()
          const selected = completionsRef.current[completionIndexRef.current]
          if (selected) {
            const line = currentLineRef.current
            const word = line.split(/\s+/).pop() ?? ''
            const suffix = selected.value.slice(word.length)
            void window.electronAPI.pty.write(
              sessionId,
              suffix + (selected.type === 'dir' ? '/' : ' '),
            )
            currentLineRef.current = line + suffix + (selected.type === 'dir' ? '/' : ' ')
          }
          setCompletionVisible(false)
          completionVisibleRef.current = false
          setCompletions([])
          return
        }
        if (domEvent.key === 'Escape') {
          // Dismiss popup
          setCompletionVisible(false)
          completionVisibleRef.current = false
          setCompletions([])
          return
        }
        // Any other key dismisses the popup and falls through to normal handling
        setCompletionVisible(false)
        completionVisibleRef.current = false
        setCompletions([])
      }

      if (code === 'ArrowUp') {
        // Navigate backward through history
        const history = historyRef.current
        if (history.length === 0) return // nothing to navigate; let PTY handle it
        const nextPos = histPosRef.current + 1
        if (nextPos >= history.length) return // already at oldest; stop
        domEvent.preventDefault()
        histPosRef.current = nextPos
        const entry = history[nextPos]
        // Ctrl+U clears the current input in readline/zsh, then we write the entry
        void window.electronAPI.pty.write(sessionId, '\x15' + entry)
        currentLineRef.current = entry
        return
      }

      if (code === 'ArrowDown') {
        if (histPosRef.current < 0) return // not navigating; let PTY handle it
        domEvent.preventDefault()
        const prevPos = histPosRef.current - 1
        histPosRef.current = prevPos
        if (prevPos < 0) {
          // Back to the unmodified input — clear line
          void window.electronAPI.pty.write(sessionId, '\x15')
          currentLineRef.current = ''
        } else {
          const entry = historyRef.current[prevPos]
          void window.electronAPI.pty.write(sessionId, '\x15' + entry)
          currentLineRef.current = entry
        }
        return
      }

      // Any key other than arrows resets history position so normal editing resumes
      if (code !== 'ArrowLeft' && code !== 'ArrowRight' && code !== 'ShiftLeft' && code !== 'ShiftRight') {
        histPosRef.current = -1
      }

      if (key === '\r' || key === '\n') {
        // Enter pressed — record the command
        const cmd = currentLineRef.current.trim()
        if (cmd.length > 0 && cmd.length < 500) {
          const h = historyRef.current
          // Dedup: don't push if identical to most recent
          if (h[0] !== cmd) {
            historyRef.current = [cmd, ...h.filter((c) => c !== cmd)].slice(0, 500)
          }
        }
        currentLineRef.current = ''
        return
      }

      if (key === '\x7f' || key === '\b') {
        // Backspace
        if (currentLineRef.current.length > 0) {
          currentLineRef.current = currentLineRef.current.slice(0, -1)
        }
        return
      }

      // Printable character (skip control sequences)
      if (key.length === 1 && key.charCodeAt(0) >= 32) {
        currentLineRef.current += key
      }
    })

    // Keyboard shortcut: Ctrl+Shift+F to toggle search; Ctrl+R for command search
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type !== 'keydown') return true
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        setShowSearch((prev) => !prev)
        return false // Prevent xterm from processing
      }
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'r') {
        // Show our command search overlay; let the shell's Ctrl+R also fire
        // by returning true (shell handles reverse-isearch natively too)
        setShowCmdSearch(true)
        // Load history from shell history file (fallback) merged with session commands
        void window.electronAPI.shellHistory.read().then((result) => {
          const fileHistory = result.commands ?? []
          // Merge session commands (more recent) with file history
          const seen = new Set<string>()
          const merged: string[] = []
          for (const c of [...sessionCommandsRef.current, ...fileHistory]) {
            if (c && !seen.has(c)) {
              seen.add(c)
              merged.push(c)
            }
          }
          setCmdHistory(merged)
        })
        return false // Don't let xterm pass Ctrl+R to the shell (we show our overlay)
      }
      // Ctrl+C — copy selection if text is selected, otherwise send SIGINT
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'c') {
        const selection = term.getSelection()
        if (selection) {
          void navigator.clipboard.writeText(selection)
          term.clearSelection()
          return false // Don't send SIGINT when copying
        }
        return true // No selection — let SIGINT through
      }
      // Ctrl+V — paste from clipboard manually and suppress the browser paste event
      // to prevent double-paste (xterm's textarea also catches the native paste)
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'v') {
        e.preventDefault() // Kill the native paste event on the helper textarea
        void navigator.clipboard.readText().then((text) => {
          if (text) {
            if (text.length > PASTE_CONFIRM_THRESHOLD) {
              setPendingPaste(text)
            } else {
              void window.electronAPI.pty.write(sessionId, text)
            }
          }
        })
        return false // Suppress ^V being sent to the PTY
      }
      return true
    })

    // ── Triple-click to select line / Smart selection tooltip ─────────────────
    // xterm's DOM element for pointer events is the screen element inside container.
    // We listen on the container itself at the capture phase.
    function handleContainerMouseUp(e: MouseEvent): void {
      // After any mouse-up, check selection and maybe show tooltip
      // Use a brief delay so xterm has committed the selection
      setTimeout(() => {
        const selected = term.getSelection()
        if (!selected) {
          setSelectionTooltip(INITIAL_SELECTION_TOOLTIP)
          return
        }
        const action = classifySelection(selected)
        if (!action) {
          setSelectionTooltip(INITIAL_SELECTION_TOOLTIP)
          return
        }
        // Position tooltip just above the mouse pointer
        setSelectionTooltip({
          visible: true,
          x: e.clientX,
          y: e.clientY - 28,
          text: selected,
          action,
        })
      }, 10)
    }

    function handleContainerClick(e: MouseEvent): void {
      // Increment click counter
      clickCountRef.current += 1

      // Reset counter after 300ms of no further clicks
      if (clickResetTimerRef.current !== null) {
        clearTimeout(clickResetTimerRef.current)
      }
      clickResetTimerRef.current = setTimeout(() => {
        clickCountRef.current = 0
        clickResetTimerRef.current = null
      }, 300)

      // Triple-click: select the current line
      if (clickCountRef.current >= 3) {
        clickCountRef.current = 0
        if (clickResetTimerRef.current !== null) {
          clearTimeout(clickResetTimerRef.current)
          clickResetTimerRef.current = null
        }
        // Get the row under the cursor using xterm buffer
        const buffer = term.buffer.active
        const cellHeight = (container.clientHeight / term.rows) || 16
        const row = Math.floor(e.offsetY / cellHeight)
        const bufferRow = buffer.viewportY + row
        const line = buffer.getLine(bufferRow)
        if (line) {
          const lineText = line.translateToString(false)
          // Select the text of this line by selecting all then narrowing
          // xterm doesn't expose a per-line select API, so we use selectLines
          // which is available via the internal API. As a reliable fallback,
          // we use selectAll then immediately reduce selection to the line text.
          // The simplest correct approach: use term.select(col, row, length)
          term.select(0, bufferRow, lineText.length)
        }
        e.preventDefault()
      }
    }

    container.addEventListener('click', handleContainerClick)
    container.addEventListener('mouseup', handleContainerMouseUp)

    // Dismiss tooltip when xterm selection is cleared (e.g. new click elsewhere)
    const selectionDisposable = term.onSelectionChange(() => {
      if (!term.getSelection()) {
        setSelectionTooltip(INITIAL_SELECTION_TOOLTIP)
      }
    })

    // ResizeObserver — attached after xterm is ready to avoid triggering
    // Viewport._innerRefresh before dimensions are initialized.
    const ro = new ResizeObserver(() => {
      fit()
    })

    // Double-rAF: xterm defers Viewport/RenderService setup one extra cycle
    // after open(). Mark ready and attach the ResizeObserver only after both
    // frames resolve so fit() can never run against an uninitialized Viewport.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        isReadyRef.current = true
        ro.observe(container)
        fit()
      })
    )

    return () => {
      isReadyRef.current = false
      // Cancel any pending RAF and debounce timer
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = 0
      }
      if (resizeDebounceRef.current !== null) {
        clearTimeout(resizeDebounceRef.current)
        resizeDebounceRef.current = null
      }
      if (clickResetTimerRef.current !== null) {
        clearTimeout(clickResetTimerRef.current)
        clickResetTimerRef.current = null
      }
      if (osc133GraceTimerRef.current !== null) {
        clearTimeout(osc133GraceTimerRef.current)
        osc133GraceTimerRef.current = null
      }
      // Cancel pending write buffer flush
      if (writeRafRef.current) {
        cancelAnimationFrame(writeRafRef.current)
        writeRafRef.current = 0
      }
      writeBufferRef.current = ''
      // Dispose all command block decorations
      for (const d of blockDecorationDisposablesRef.current) {
        try { d.dispose() } catch { /* ignore */ }
      }
      blockDecorationDisposablesRef.current = []
      container.removeEventListener('click', handleContainerClick)
      container.removeEventListener('mouseup', handleContainerMouseUp)
      selectionDisposable.dispose()
      ro.disconnect()
      titleDisposable.dispose()
      inputDisposable.dispose()
      historyKeyDisposable.dispose()
      oscFgBlocker.dispose()
      oscBgBlocker.dispose()
      oscCursorBlocker.dispose()
      dataCleanup()
      searchAddonRef.current = null
      fitAddonRef.current = null
      term.dispose()
      terminalRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally run once on mount
  }, [sessionId])

  // ── Fit when becoming active ────────────────────────────────────────────────

  useEffect(() => {
    if (isActive) {
      // Double-rAF: the display:block CSS change propagates in the first frame;
      // xterm needs a second frame to re-measure after becoming visible.
      requestAnimationFrame(() => requestAnimationFrame(fit))
    }
  }, [isActive, fit])

  // ── Theme updates ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!window.electronAPI?.theme?.onChange) return
    const cleanup = window.electronAPI.theme.onChange(() => {
      // CSS vars are updated by useTheme before this callback fires
      requestAnimationFrame(syncTheme)
    })
    return cleanup
  }, [syncTheme])

  // Also sync when CSS vars are updated (covers async initial load on Ctrl+R)
  useEffect(() => {
    const handler = () => requestAnimationFrame(syncTheme)
    window.addEventListener('agent-ide:theme-applied', handler)
    return () => window.removeEventListener('agent-ide:theme-applied', handler)
  }, [syncTheme])

  // ── Context menu handler ────────────────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const term = terminalRef.current
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      hasSelection: term ? term.getSelection().length > 0 : false,
    })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(INITIAL_TERMINAL_CONTEXT_MENU)
  }, [])

  // ── Paste confirmation handlers ─────────────────────────────────────────────

  const handlePasteConfirm = useCallback(() => {
    if (pendingPaste) {
      void window.electronAPI.pty.write(sessionId, pendingPaste)
    }
    setPendingPaste(null)
  }, [pendingPaste, sessionId])

  const handlePasteCancel = useCallback(() => {
    setPendingPaste(null)
  }, [])

  // Dismiss paste banner on Escape
  useEffect(() => {
    if (!pendingPaste) return
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        setPendingPaste(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [pendingPaste])

  // ── Command search handlers ─────────────────────────────────────────────────

  const handleCmdSearchSelect = useCallback((cmd: string) => {
    setShowCmdSearch(false)
    // Paste the command into the terminal without executing
    const term = terminalRef.current
    if (term) {
      void window.electronAPI.pty.write(sessionId, cmd)
    }
  }, [sessionId])

  const handleCmdSearchClose = useCallback(() => {
    setShowCmdSearch(false)
    // Refocus the terminal
    terminalRef.current?.focus()
  }, [])

  // Dismiss command search on Escape (document-level, capture phase)
  useEffect(() => {
    if (!showCmdSearch) return
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setShowCmdSearch(false)
        terminalRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [showCmdSearch])

  // ── Selection tooltip handlers ──────────────────────────────────────────────

  const handleTooltipOpenUrl = useCallback((url: string) => {
    void window.electronAPI.app.openExternal(url)
  }, [])

  const handleTooltipOpenFile = useCallback((filePath: string) => {
    window.dispatchEvent(
      new CustomEvent('agent-ide:open-file', { detail: { path: filePath } })
    )
  }, [])

  const handleTooltipDismiss = useCallback(() => {
    setSelectionTooltip(INITIAL_SELECTION_TOOLTIP)
  }, [])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        display: isActive ? 'block' : 'none',
        backgroundColor: 'var(--term-bg, var(--bg))',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={handleContextMenu}
    >
      {showSearch && searchAddonRef.current && (
        <TerminalSearchBar
          searchAddon={searchAddonRef.current}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* Floating copy button — top-right, visible on hover */}
      {/* Offset right to not overlap search bar */}
      {!showSearch && (
        <CopyButton
          terminal={terminalRef.current}
          visible={isHovered}
        />
      )}

      {/* Sync input button — visible on hover or when sync is active */}
      {onToggleSync && (syncInput || isHovered) && !showSearch && (
        <button
          onClick={onToggleSync}
          title="Sync input across terminals"
          style={{
            position: 'absolute',
            top: 6,
            right: isHovered ? 155 : 6,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            borderRadius: 4,
            border: syncInput
              ? '1px solid var(--accent, #58a6ff)'
              : '1px solid var(--border, #333)',
            backgroundColor: syncInput
              ? 'rgba(88,166,255,0.15)'
              : 'var(--bg-secondary, #1e1e1e)',
            color: syncInput ? 'var(--accent, #58a6ff)' : 'var(--text-muted, #888)',
            fontFamily: 'var(--font-ui, sans-serif)',
            fontSize: 11,
            cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 5h8M8 2l3 3-3 3M14 11H6M8 14l-3-3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Sync
        </button>
      )}

      {/* Split button — visible on hover when onSplit is provided */}
      {onSplit && isHovered && !showSearch && (
        <button
          onClick={() => onSplit(sessionId)}
          title="Split terminal pane"
          style={{
            position: 'absolute',
            top: 6,
            right: isHovered ? 110 : 6,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            borderRadius: 4,
            border: '1px solid var(--border, #333)',
            backgroundColor: 'var(--bg-secondary, #1e1e1e)',
            color: 'var(--text-muted, #888)',
            fontFamily: 'var(--font-ui, sans-serif)',
            fontSize: 11,
            cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Split
        </button>
      )}

      {/* Recording button — shown when recording or on hover */}
      {onToggleRecording && (isRecording || isHovered) && (
        <button
          onClick={() => onToggleRecording(sessionId)}
          title={isRecording ? 'Stop recording' : 'Start recording terminal session'}
          style={{
            position: 'absolute',
            top: 6,
            right: isHovered && !showSearch ? 70 : 6,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 8px',
            borderRadius: 4,
            border: isRecording
              ? '1px solid var(--recording-dot, #e53935)'
              : '1px solid var(--border, #333)',
            backgroundColor: isRecording
              ? 'rgba(229,57,53,0.12)'
              : 'var(--bg-secondary, #1e1e1e)',
            color: isRecording ? 'var(--recording-dot, #e53935)' : 'var(--text-muted, #888)',
            fontFamily: 'var(--font-ui, sans-serif)',
            fontSize: 11,
            cursor: 'pointer',
            transition: 'opacity 0.15s ease',
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {isRecording ? (
            <>
              <span
                style={{
                  display: 'inline-block',
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: 'var(--recording-dot, #e53935)',
                  flexShrink: 0,
                  animation: 'pty-rec-pulse 1.2s ease-in-out infinite',
                }}
              />
              Stop
            </>
          ) : (
            <>
              <span
                style={{
                  display: 'inline-block',
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: 'var(--text-muted, #888)',
                  flexShrink: 0,
                }}
              />
              Rec
            </>
          )}
        </button>
      )}

      {/* Keyframe for recording pulse animation */}
      {isRecording && (
        <style>{`
          @keyframes pty-rec-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}</style>
      )}

      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        }}
        aria-label="Terminal"
        data-session-id={sessionId}
      />

      {/* Tab completion popup — floats above the input area */}
      {completionVisible && (
        <CompletionOverlay
          completions={completions}
          selectedIndex={completionIndex}
          visible={completionVisible}
          position={completionPos}
          onSelect={(value) => {
            const type = completions.find((c) => c.value === value)?.type ?? 'file'
            applyCompletion(value, type)
          }}
          onNavigate={(delta) => {
            const next = Math.max(0, Math.min(completionIndex + delta, completions.length - 1))
            setCompletionIndex(next)
            completionIndexRef.current = next
          }}
          onDismiss={() => {
            setCompletionVisible(false)
            completionVisibleRef.current = false
            setCompletions([])
          }}
        />
      )}

      {/* Paste confirmation banner — appears at bottom */}
      {pendingPaste && (
        <PasteConfirmBanner
          text={pendingPaste}
          onConfirm={handlePasteConfirm}
          onCancel={handlePasteCancel}
        />
      )}

      {/* Right-click context menu */}
      <TerminalContextMenu
        state={contextMenu}
        terminal={terminalRef.current}
        sessionId={sessionId}
        onClose={closeContextMenu}
      />

      {/* Smart selection tooltip — shown when selection looks like URL or file path */}
      <SelectionTooltip
        state={selectionTooltip}
        onOpenUrl={handleTooltipOpenUrl}
        onOpenFile={handleTooltipOpenFile}
        onDismiss={handleTooltipDismiss}
      />

      {/* Command search overlay — Ctrl+R history search */}
      {showCmdSearch && (
        <CommandSearchOverlay
          commands={cmdHistory}
          onSelect={handleCmdSearchSelect}
          onClose={handleCmdSearchClose}
        />
      )}
    </div>
  )
}
