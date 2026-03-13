import type { ChildProcess } from 'child_process'
import type { MessageConnection } from 'vscode-jsonrpc/node'

export interface CompletionItem {
  label: string
  kind: string
  detail?: string
  insertText?: string
  documentation?: string
}

export interface LspLocation {
  filePath: string
  line: number
  character: number
}

export interface LspDiagnostic {
  message: string
  severity: 'error' | 'warning' | 'info' | 'hint'
  range: {
    startLine: number
    startChar: number
    endLine: number
    endChar: number
  }
}

export type ServerStatus = 'starting' | 'running' | 'error' | 'stopped'

export interface LspServerInstance {
  process: ChildProcess
  connection: MessageConnection
  root: string
  language: string
  status: ServerStatus
  documentVersions: Map<string, number>
  diagnosticsCache: Map<string, LspDiagnostic[]>
  restartCount: number
  lastRestartTime: number
}

export interface LspServerStatus {
  root: string
  language: string
  status: ServerStatus
}

export interface LspActionResult {
  success: boolean
  error?: string
}
