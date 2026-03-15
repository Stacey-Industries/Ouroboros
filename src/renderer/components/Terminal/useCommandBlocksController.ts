import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { CommandBlock, UseCommandBlocksOptions, UseCommandBlocksResult } from './useCommandBlocks'
import type { ShellIntegrationAddon, ShellIntegrationEvent } from './shellIntegrationAddon'

interface CommandBlockRefs {
  blocks: CommandBlock[]
  currentBlock: CommandBlock | null
  heuristicTimer: ReturnType<typeof setTimeout> | null
  osc133Active: boolean | null
  pendingPromptRow: number | null
}

interface CommandBlockState {
  blocks: CommandBlock[]
  activeBlockIndex: number
  osc133Active: boolean | null
  refs: MutableRefObject<CommandBlockRefs>
  setActiveBlockIndex: Dispatch<SetStateAction<number>>
  setBlocks: Dispatch<SetStateAction<CommandBlock[]>>
  setOsc133Active: Dispatch<SetStateAction<boolean | null>>
}

const DEFAULT_PROMPT_PATTERNS = [
  /^(?:\S+@\S+[:\s][^$]*|)\$\s$/,
  /^\$\s/,
  /^(?:\S+@\S+\s[^%]*|)%\s$/,
  /^%\s/,
  /^PS\s+[A-Z]:\\[^>]*>\s*$/,
  /^>\s$/,
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

function createBlock(promptLine: number, source: CommandBlock['source']): CommandBlock {
  return { id: generateBlockId(), command: '', startLine: promptLine, endLine: promptLine, promptLine, outputStartLine: promptLine + 1, timestamp: Date.now(), collapsed: false, complete: false, source }
}

function compilePromptPattern(promptPattern?: string): RegExp | null {
  if (!promptPattern) return null
  try {
    return new RegExp(promptPattern)
  } catch {
    return null
  }
}

function matchesPattern(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0
  return pattern.test(text)
}

function isPromptLine(text: string, customPattern: RegExp | null): boolean {
  if (customPattern && matchesPattern(customPattern, text)) return true
  return DEFAULT_PROMPT_PATTERNS.some((pattern) => matchesPattern(pattern, text))
}

function stripPromptPrefix(lineText: string): string {
  const stripped = lineText.replace(/^(?:\S+@\S+[:\s]\S*\s*|PS\s+\S+>\s*|\$\s*|%\s*|>\s*)/, '').trim()
  return stripped || lineText.trim()
}

function useCommandBlockState(): CommandBlockState {
  const [blocks, setBlocks] = useState<CommandBlock[]>([])
  const [activeBlockIndex, setActiveBlockIndex] = useState(-1)
  const [osc133Active, setOsc133Active] = useState<boolean | null>(null)
  const refs = useRef<CommandBlockRefs>({ blocks: [], currentBlock: null, heuristicTimer: null, osc133Active: null, pendingPromptRow: null })
  return { blocks, activeBlockIndex, osc133Active, refs, setActiveBlockIndex, setBlocks, setOsc133Active }
}

function commitBlocks(state: CommandBlockState, nextBlocks: CommandBlock[]): void {
  state.refs.current.blocks = nextBlocks
  state.setBlocks([...nextBlocks])
}

function setOsc133State(state: CommandBlockState, active: boolean): void {
  state.refs.current.osc133Active = active
  state.setOsc133Active(active)
}

function finalizeCurrentBlock(state: CommandBlockState, endLine: number): void {
  const currentBlock = state.refs.current.currentBlock
  if (!currentBlock) return
  currentBlock.complete = true
  currentBlock.endLine = endLine
  currentBlock.duration = Date.now() - currentBlock.timestamp
  state.refs.current.currentBlock = null
}

function startNewBlock(state: CommandBlockState, promptLine: number, source: CommandBlock['source']): void {
  const currentBlock = state.refs.current.currentBlock
  if (currentBlock) finalizeCurrentBlock(state, Math.max(promptLine - 1, currentBlock.startLine))
  const nextBlock = createBlock(promptLine, source)
  state.refs.current.currentBlock = nextBlock
  commitBlocks(state, [...state.refs.current.blocks, nextBlock].slice(-MAX_BLOCKS))
}

function updateCommandFromPrompt(state: CommandBlockState, term: Terminal): void {
  const currentBlock = state.refs.current.currentBlock
  if (!currentBlock) return
  currentBlock.command = stripPromptPrefix(getLineText(term, currentBlock.promptLine))
}

function updateOutputStartLine(state: CommandBlockState, row: number): void {
  if (state.refs.current.currentBlock) state.refs.current.currentBlock.outputStartLine = row
}

function finishCurrentBlock(state: CommandBlockState, row: number, param: string | undefined): void {
  const currentBlock = state.refs.current.currentBlock
  if (!currentBlock) return
  currentBlock.exitCode = param !== undefined ? parseInt(param, 10) : 0
  finalizeCurrentBlock(state, row)
  commitBlocks(state, [...state.refs.current.blocks])
}

function handleOscSequence(state: CommandBlockState, sequence: string, param: string | undefined, term: Terminal): void {
  const row = getAbsoluteRow(term)
  if (sequence === 'A') {
    setOsc133State(state, true)
    startNewBlock(state, row, 'osc133')
    return
  }
  if (sequence === 'B') return void updateCommandFromPrompt(state, term)
  if (sequence === 'C') return void updateOutputStartLine(state, row)
  if (sequence === 'D') finishCurrentBlock(state, row, param)
}

function updateCurrentEndLine(state: CommandBlockState, term: Terminal): void {
  const currentBlock = state.refs.current.currentBlock
  if (!currentBlock) return
  const row = getAbsoluteRow(term)
  if (row - currentBlock.startLine <= MAX_BLOCK_LINES) currentBlock.endLine = row
}

function clearHeuristicTimer(state: CommandBlockState): void {
  const { heuristicTimer } = state.refs.current
  if (!heuristicTimer) return
  clearTimeout(heuristicTimer)
  state.refs.current.heuristicTimer = null
}

function checkPromptHeuristic(state: CommandBlockState, row: number, term: Terminal, customPattern: RegExp | null): void {
  const text = getLineText(term, row)
  if (text && isPromptLine(text, customPattern)) startNewBlock(state, row, 'heuristic')
}

function flushPendingPrompt(state: CommandBlockState, term: Terminal, customPattern: RegExp | null): void {
  const pendingRow = state.refs.current.pendingPromptRow
  if (pendingRow == null) return
  state.refs.current.pendingPromptRow = null
  checkPromptHeuristic(state, pendingRow, term, customPattern)
}

function scheduleHeuristicCheck(state: CommandBlockState, row: number, term: Terminal, customPattern: RegExp | null): void {
  state.refs.current.pendingPromptRow = row
  state.refs.current.heuristicTimer = setTimeout(() => {
    state.refs.current.heuristicTimer = null
    flushPendingPrompt(state, term, customPattern)
  }, 200)
}

function handleHeuristicData(state: CommandBlockState, data: string, term: Terminal, customPattern: RegExp | null): void {
  updateCurrentEndLine(state, term)
  clearHeuristicTimer(state)
  if (!data.includes('\n') && !data.includes('\r')) return
  scheduleHeuristicCheck(state, getAbsoluteRow(term), term, customPattern)
}

function useOsc133Handler(enabled: boolean, state: CommandBlockState): UseCommandBlocksResult['handleOsc133'] {
  return useCallback((sequence, param, term) => {
    if (enabled) handleOscSequence(state, sequence, param, term)
  }, [enabled, state])
}

function useDataHandler(enabled: boolean, state: CommandBlockState, customPattern: RegExp | null): UseCommandBlocksResult['handleData'] {
  return useCallback((data, term) => {
    if (!enabled || state.refs.current.osc133Active === true) return
    handleHeuristicData(state, data, term, customPattern)
  }, [customPattern, enabled, state])
}

function useNavigateTo(state: CommandBlockState): UseCommandBlocksResult['navigateTo'] {
  return useCallback((index, term) => {
    const block = state.refs.current.blocks[index]
    if (!block) return
    state.setActiveBlockIndex(index)
    term.scrollToLine(block.startLine)
  }, [state])
}

function useNavigateNext(activeBlockIndex: number, refs: MutableRefObject<CommandBlockRefs>, navigateTo: UseCommandBlocksResult['navigateTo']): UseCommandBlocksResult['navigateNext'] {
  return useCallback((term) => {
    navigateTo(Math.min(activeBlockIndex + 1, refs.current.blocks.length - 1), term)
  }, [activeBlockIndex, navigateTo, refs])
}

function useNavigatePrev(activeBlockIndex: number, navigateTo: UseCommandBlocksResult['navigateTo']): UseCommandBlocksResult['navigatePrev'] {
  return useCallback((term) => {
    navigateTo(Math.max(activeBlockIndex - 1, 0), term)
  }, [activeBlockIndex, navigateTo])
}

function useToggleCollapse(state: CommandBlockState): UseCommandBlocksResult['toggleCollapse'] {
  return useCallback((blockId) => {
    const index = state.refs.current.blocks.findIndex((block) => block.id === blockId)
    if (index < 0) return
    state.refs.current.blocks[index].collapsed = !state.refs.current.blocks[index].collapsed
    commitBlocks(state, [...state.refs.current.blocks])
  }, [state])
}

function useBlockOutput(): UseCommandBlocksResult['getBlockOutput'] {
  return useCallback((block, term) => {
    const lines: string[] = []
    for (let row = block.outputStartLine; row <= block.endLine; row++) lines.push(getLineText(term, row))
    return lines.join('\n')
  }, [])
}

function useResetBlocks(state: CommandBlockState): UseCommandBlocksResult['reset'] {
  return useCallback(() => {
    state.refs.current.blocks = []
    state.refs.current.currentBlock = null
    clearHeuristicTimer(state)
    state.refs.current.pendingPromptRow = null
    state.setBlocks([])
    state.setActiveBlockIndex(-1)
  }, [state])
}

// ── OSC 633 (ShellIntegrationAddon) bridge ──────────────────────────────────

/**
 * Handle an OSC 633 event from the ShellIntegrationAddon.
 * When the addon is active, it becomes the preferred source of truth for
 * command blocks, superseding the manual OSC 133 parsing.
 */
function handleOsc633Event(
  event: ShellIntegrationEvent,
  state: CommandBlockState,
): void {
  switch (event.type) {
    case 'promptStart':
      // Mark OSC 633 as active (superset of OSC 133)
      setOsc133State(state, true)
      startNewBlock(state, event.row, 'osc133')
      break
    case 'commandStart':
      if (state.refs.current.currentBlock) {
        // Update command text from the commandLine event that preceded this
      }
      break
    case 'commandExecuted':
      updateOutputStartLine(state, event.row)
      break
    case 'commandFinished':
      finishCurrentBlock(state, event.row, String(event.exitCode))
      break
    case 'commandLine':
      if (state.refs.current.currentBlock) {
        state.refs.current.currentBlock.command = event.text
      }
      break
    // cwd events are informational; no block action needed
  }
}

/**
 * Hook that subscribes to the ShellIntegrationAddon's events when available.
 * When OSC 633 events are detected, they take priority over manual OSC 133 parsing.
 */
function useOsc633Subscription(
  enabled: boolean,
  state: CommandBlockState,
  addonRef?: { current: ShellIntegrationAddon | null },
): void {
  useEffect(() => {
    if (!enabled || !addonRef?.current) return

    const addon = addonRef.current
    const unsubscribe = addon.onEvent((event) => {
      handleOsc633Event(event, state)
    })

    return unsubscribe
  }, [enabled, addonRef, state])
}

export function useCommandBlocksController(options: UseCommandBlocksOptions): UseCommandBlocksResult {
  const state = useCommandBlockState()
  const customPattern = compilePromptPattern(options.promptPattern)
  const handleOsc133 = useOsc133Handler(options.enabled, state)
  const handleData = useDataHandler(options.enabled, state, customPattern)
  const navigateTo = useNavigateTo(state)
  const navigateNext = useNavigateNext(state.activeBlockIndex, state.refs, navigateTo)
  const navigatePrev = useNavigatePrev(state.activeBlockIndex, navigateTo)
  const toggleCollapse = useToggleCollapse(state)
  const getBlockOutput = useBlockOutput()
  const reset = useResetBlocks(state)

  // Subscribe to OSC 633 events when ShellIntegrationAddon is available
  useOsc633Subscription(options.enabled, state, options.shellIntegrationAddonRef)

  return { blocks: state.blocks, activeBlockIndex: state.activeBlockIndex, handleOsc133, handleData, navigateTo, navigateNext, navigatePrev, toggleCollapse, getBlockOutput, reset, osc133Active: state.osc133Active }
}
