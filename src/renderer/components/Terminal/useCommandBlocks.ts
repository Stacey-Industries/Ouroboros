/**
 * useCommandBlocks - tracks command boundaries in terminal output.
 */

import type { Terminal } from '@xterm/xterm'
import { useCommandBlocksController } from './useCommandBlocksController'

export interface CommandBlock {
  id: string
  command: string
  startLine: number
  endLine: number
  promptLine: number
  outputStartLine: number
  timestamp: number
  exitCode?: number
  collapsed: boolean
  duration?: number
  complete: boolean
  source: 'osc133' | 'heuristic'
}

export interface UseCommandBlocksOptions {
  enabled: boolean
  promptPattern?: string
  /** Optional ref to ShellIntegrationAddon for OSC 633 support */
  shellIntegrationAddonRef?: { current: import('./shellIntegrationAddon').ShellIntegrationAddon | null }
}

export interface UseCommandBlocksResult {
  blocks: CommandBlock[]
  activeBlockIndex: number
  handleOsc133: (sequence: string, param: string | undefined, term: Terminal) => void
  handleData: (data: string, term: Terminal) => void
  navigateTo: (index: number, term: Terminal) => void
  navigateNext: (term: Terminal) => void
  navigatePrev: (term: Terminal) => void
  toggleCollapse: (blockId: string) => void
  getBlockOutput: (block: CommandBlock, term: Terminal) => string
  reset: () => void
  osc133Active: boolean | null
}

export function useCommandBlocks(options: UseCommandBlocksOptions): UseCommandBlocksResult {
  return useCommandBlocksController(options)
}
