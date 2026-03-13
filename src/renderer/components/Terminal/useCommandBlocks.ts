/**
 * useCommandBlocks — tracks command boundaries in terminal output.
 *
 * Two detection strategies:
 * 1. OSC 133 shell integration markers (preferred, precise)
 * 2. Heuristic prompt pattern matching (fallback, best-effort)
 *
 * Returns an array of CommandBlock objects representing discrete command units,
 * plus navigation helpers for the BlockNavigator UI.
 */

import { useCallback, useRef, useState } from 'react'
import type { Terminal } from '@xterm/xterm'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CommandBlock {
  id: string
  /** The command text (best-effort extraction) */
  command: string
  /** First line in xterm buffer (prompt line) */
  startLine: number
  /** Last line in xterm buffer (end of output, updated as output streams) */
  endLine: number
  /** The prompt line number */
  promptLine: number
  /** First line of command output (after the prompt/command line) */
  outputStartLine: number
  /** Timestamp when block was created */
  timestamp: number
  /** Exit code from OSC 133;D or undefined if unknown */
  exitCode?: number
  /** Whether this block is collapsed in the overlay */
  collapsed: boolean
  /** Duration in ms between command start and next prompt */
  duration?: number
  /** Whether the block is complete (next prompt appeared or OSC 133;D received) */
  complete: boolean
  /** Detection method: 'osc133' or 'heuristic' */
  source: 'osc133' | 'heuristic'
}

export interface UseCommandBlocksOptions {
  enabled: boolean
  promptPattern?: string
}

export interface UseCommandBlocksResult {
  blocks: CommandBlock[]
  activeBlockIndex: number
  /** Called from OSC 133 handler — sequence is 'A'|'B'|'C'|'D', param is exit code for D */
  handleOsc133: (sequence: string, param: string | undefined, term: Terminal) => void
  /** Called when new data arrives (for heuristic prompt detection) */
  handleData: (data: string, term: Terminal) => void
  /** Navigate to a specific block index */
  navigateTo: (index: number, term: Terminal) => void
  /** Navigate to next block */
  navigateNext: (term: Terminal) => void
  /** Navigate to previous block */
  navigatePrev: (term: Terminal) => void
  /** Toggle collapse on a block */
  toggleCollapse: (blockId: string) => void
  /** Get text content of a block's output from the terminal buffer */
  getBlockOutput: (block: CommandBlock, term: Terminal) => string
  /** Reset all blocks (e.g. on terminal clear) */
  reset: () => void
  /** Whether OSC 133 is active (null = undetermined) */
  osc133Active: boolean | null
}

// ─── Default prompt patterns ────────────────────────────────────────────────

const DEFAULT_PROMPT_PATTERNS = [
  // bash default: "user@host:path$ " or just "$ "
  /^(?:\S+@\S+[:\s][^$]*|)\$\s$/,
  // simple "$ " at start
  /^\$\s/,
  // zsh default: "user@host % " or "% "
  /^(?:\S+@\S+\s[^%]*|)%\s$/,
  /^%\s/,
  // PowerShell: "PS C:\path> "
  /^PS\s+[A-Z]:\\[^>]*>\s*$/,
  // Generic "> " prompt (PowerShell, some custom shells)
  /^>\s$/,
  // fish: "user@host ~/path> "
  /^\S+@\S+\s+[~/][^>]*>\s*$/,
]

const MAX_BLOCKS = 500
const MAX_BLOCK_LINES = 1000
let blockIdCounter = 0

function generateBlockId(): string {
  return `cb_${Date.now()}_${++blockIdCounter}`
}

function getAbsoluteRow(term: Terminal): number {
  return term.buffer.active.viewportY + term.buffer.active.cursorY
}

function getLineText(term: Terminal, row: number): string {
  const line = term.buffer.active.getLine(row)
  return line ? line.translateToString(true).trimEnd() : ''
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useCommandBlocks(options: UseCommandBlocksOptions): UseCommandBlocksResult {
  const { enabled, promptPattern } = options
  const [blocks, setBlocks] = useState<CommandBlock[]>([])
  const [activeBlockIndex, setActiveBlockIndex] = useState(-1)
  const [osc133Active, setOsc133Active] = useState<boolean | null>(null)

  // Refs for mutable state that doesn't need re-renders
  const blocksRef = useRef<CommandBlock[]>([])
  const currentBlockRef = useRef<CommandBlock | null>(null)
  const osc133ActiveRef = useRef<boolean | null>(null)
  const lastPromptTimeRef = useRef<number>(0)
  const customPatternRef = useRef<RegExp | null>(null)
  // Debounce heuristic detection — don't detect prompt mid-stream
  const heuristicTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingLineRef = useRef<{ row: number; text: string } | null>(null)

  // Compile custom prompt pattern if provided
  if (promptPattern && !customPatternRef.current) {
    try {
      customPatternRef.current = new RegExp(promptPattern)
    } catch {
      customPatternRef.current = null
    }
  }

  const commitBlocks = useCallback((newBlocks: CommandBlock[]) => {
    blocksRef.current = newBlocks
    setBlocks([...newBlocks])
  }, [])

  const finalizeCurrentBlock = useCallback((endLine: number) => {
    const current = currentBlockRef.current
    if (!current) return
    current.complete = true
    current.endLine = endLine
    current.duration = Date.now() - current.timestamp
    currentBlockRef.current = null
  }, [])

  const startNewBlock = useCallback((promptLine: number, term: Terminal, source: 'osc133' | 'heuristic') => {
    // Finalize previous block if still open
    if (currentBlockRef.current) {
      finalizeCurrentBlock(Math.max(promptLine - 1, currentBlockRef.current.startLine))
    }

    const block: CommandBlock = {
      id: generateBlockId(),
      command: '', // Will be filled when command starts (OSC B) or on heuristic enter
      startLine: promptLine,
      endLine: promptLine,
      promptLine,
      outputStartLine: promptLine + 1,
      timestamp: Date.now(),
      collapsed: false,
      complete: false,
      source,
    }

    currentBlockRef.current = block
    lastPromptTimeRef.current = Date.now()

    const updated = [...blocksRef.current, block].slice(-MAX_BLOCKS)
    commitBlocks(updated)
  }, [commitBlocks, finalizeCurrentBlock])

  // ── OSC 133 handler ─────────────────────────────────────────────────────────

  const handleOsc133 = useCallback((sequence: string, param: string | undefined, term: Terminal) => {
    if (!enabled) return

    const absoluteRow = getAbsoluteRow(term)

    if (sequence === 'A') {
      // Prompt start
      osc133ActiveRef.current = true
      setOsc133Active(true)
      startNewBlock(absoluteRow, term, 'osc133')
    } else if (sequence === 'B') {
      // Command start (user input begins) — extract command text
      if (currentBlockRef.current) {
        // The prompt line now has the command text
        const lineText = getLineText(term, currentBlockRef.current.promptLine)
        // Try to strip common prompt prefixes
        const stripped = lineText
          .replace(/^(?:\S+@\S+[:\s]\S*\s*|PS\s+\S+>\s*|\$\s*|%\s*|>\s*)/, '')
          .trim()
        currentBlockRef.current.command = stripped || lineText.trim()
      }
    } else if (sequence === 'C') {
      // Command output starts
      if (currentBlockRef.current) {
        currentBlockRef.current.outputStartLine = absoluteRow
      }
    } else if (sequence === 'D') {
      // Command finished
      const exitCode = param !== undefined ? parseInt(param, 10) : 0
      if (currentBlockRef.current) {
        currentBlockRef.current.exitCode = exitCode
        finalizeCurrentBlock(absoluteRow)
        commitBlocks([...blocksRef.current])
      }
    }
  }, [enabled, startNewBlock, finalizeCurrentBlock, commitBlocks])

  // ── Heuristic prompt detection ──────────────────────────────────────────────

  const checkPromptHeuristic = useCallback((row: number, term: Terminal) => {
    if (!enabled) return
    // Skip if OSC 133 is active — no need for heuristics
    if (osc133ActiveRef.current === true) return

    const text = getLineText(term, row)
    if (!text) return

    let isPrompt = false

    // Check custom pattern first
    if (customPatternRef.current) {
      isPrompt = customPatternRef.current.test(text)
    }

    // Check default patterns
    if (!isPrompt) {
      for (const pattern of DEFAULT_PROMPT_PATTERNS) {
        if (pattern.test(text)) {
          isPrompt = true
          break
        }
      }
    }

    if (isPrompt) {
      startNewBlock(row, term, 'heuristic')
    }
  }, [enabled, startNewBlock])

  const handleData = useCallback((data: string, term: Terminal) => {
    if (!enabled) return
    // If OSC 133 is active, skip heuristic detection
    if (osc133ActiveRef.current === true) return

    // Update end line of current block as output streams in
    if (currentBlockRef.current) {
      const absoluteRow = getAbsoluteRow(term)
      const blockLines = absoluteRow - currentBlockRef.current.startLine
      if (blockLines <= MAX_BLOCK_LINES) {
        currentBlockRef.current.endLine = absoluteRow
      }
    }

    // Debounce prompt detection — wait for output to settle
    // A new prompt typically appears after a brief pause
    if (heuristicTimerRef.current) {
      clearTimeout(heuristicTimerRef.current)
    }

    // Check if the data contains a newline (potential prompt line)
    if (data.includes('\n') || data.includes('\r')) {
      const absoluteRow = getAbsoluteRow(term)
      pendingLineRef.current = { row: absoluteRow, text: '' }

      heuristicTimerRef.current = setTimeout(() => {
        heuristicTimerRef.current = null
        const pending = pendingLineRef.current
        if (pending) {
          pendingLineRef.current = null
          checkPromptHeuristic(pending.row, term)
        }
      }, 200) // 200ms debounce — prompt appears after output settles
    }
  }, [enabled, checkPromptHeuristic])

  // ── Navigation ────────────────────────────────────────────────────────────

  const navigateTo = useCallback((index: number, term: Terminal) => {
    const block = blocksRef.current[index]
    if (!block) return
    setActiveBlockIndex(index)
    // Scroll xterm to the block's start line
    term.scrollToLine(block.startLine)
  }, [])

  const navigateNext = useCallback((term: Terminal) => {
    const next = Math.min(activeBlockIndex + 1, blocksRef.current.length - 1)
    navigateTo(next, term)
  }, [activeBlockIndex, navigateTo])

  const navigatePrev = useCallback((term: Terminal) => {
    const prev = Math.max(activeBlockIndex - 1, 0)
    navigateTo(prev, term)
  }, [activeBlockIndex, navigateTo])

  const toggleCollapse = useCallback((blockId: string) => {
    const idx = blocksRef.current.findIndex(b => b.id === blockId)
    if (idx < 0) return
    blocksRef.current[idx].collapsed = !blocksRef.current[idx].collapsed
    commitBlocks([...blocksRef.current])
  }, [commitBlocks])

  const getBlockOutput = useCallback((block: CommandBlock, term: Terminal): string => {
    const lines: string[] = []
    for (let row = block.outputStartLine; row <= block.endLine; row++) {
      lines.push(getLineText(term, row))
    }
    return lines.join('\n')
  }, [])

  const reset = useCallback(() => {
    blocksRef.current = []
    currentBlockRef.current = null
    setBlocks([])
    setActiveBlockIndex(-1)
    if (heuristicTimerRef.current) {
      clearTimeout(heuristicTimerRef.current)
      heuristicTimerRef.current = null
    }
    pendingLineRef.current = null
  }, [])

  return {
    blocks,
    activeBlockIndex,
    handleOsc133,
    handleData,
    navigateTo,
    navigateNext,
    navigatePrev,
    toggleCollapse,
    getBlockOutput,
    reset,
    osc133Active,
  }
}
