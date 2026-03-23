/**
 * claudeCodeContextBuilder.ts — XML context block builders for ClaudeCodeAdapter.
 * Converts ContextPacket data into structured XML sections for the prompt.
 */
import path from 'path'

import { getModelBudgets } from '../contextPacketBuilderSupport'
import type { ContextPacket } from '../types'
import type { ProviderLaunchContext, ProviderResumeContext } from './providerAdapter'
import type { StreamJsonToolUseBlock } from './streamJsonTypes'

export function buildCurrentFocusSection(packet: ContextPacket): string {
  const ide = packet.liveIdeState
  const lines: string[] = ['<current_focus>']
  if (ide.activeFile) {
    const dirty = ide.dirtyFiles.includes(ide.activeFile) ? ' (unsaved changes)' : ''
    lines.push(`Active file: ${path.basename(ide.activeFile)}${dirty}`)
  }
  if (ide.selection) {
    lines.push(`Cursor/selection: lines ${ide.selection.startLine}-${ide.selection.endLine}`)
  }
  const openCount = ide.openFiles.length
  if (openCount > 0) {
    const dirtySet = new Set(ide.dirtyFiles.map((f) => f.toLowerCase()))
    const fileList = ide.openFiles.slice(0, 12).map((f) => {
      const isDirty = dirtySet.has(f.toLowerCase())
      return isDirty ? `${path.basename(f)} (dirty)` : path.basename(f)
    })
    lines.push(`Open tabs (${openCount}): ${fileList.join(', ')}`)
  }
  lines.push('</current_focus>')
  return lines.join('\n')
}

export function buildWorkspaceStateSection(packet: ContextPacket): string {
  const diff = packet.repoFacts.gitDiff
  const diag = packet.repoFacts.diagnostics
  const attrs: string[] = []
  if (diff.currentBranch) attrs.push(`branch="${diff.currentBranch}"`)
  attrs.push(`changed_files="${diff.changedFileCount}"`)
  if (diag.totalErrors > 0) attrs.push(`errors="${diag.totalErrors}"`)
  if (diag.totalWarnings > 0) attrs.push(`warnings="${diag.totalWarnings}"`)
  const lines: string[] = [`<workspace_state ${attrs.join(' ')}>`]
  const commits = packet.repoFacts.recentCommits
  if (commits && commits.length > 0) {
    lines.push('Recent commits:')
    for (const c of commits.slice(0, 5)) lines.push(`- ${c.hash} ${c.message}`)
  }
  const recentEdits = packet.repoFacts.recentEdits.files.slice(0, 8)
  if (recentEdits.length > 0) lines.push(`Recently edited: ${recentEdits.map((f) => path.basename(f)).join(', ')}`)
  const dirtyCount = packet.liveIdeState.dirtyFiles.length
  if (dirtyCount > 0) lines.push(`Unsaved buffers (${dirtyCount}): ${packet.liveIdeState.dirtyFiles.map((f) => path.basename(f)).join(', ')}`)
  lines.push('</workspace_state>')
  return lines.join('\n')
}

export function buildRelevantCodeSection(packet: ContextPacket, model: string): string {
  const budgets = getModelBudgets(model)
  const maxSnippetChars = model.includes('opus') ? 4000 : 2000
  const lines: string[] = ['<relevant_code>']
  for (const file of packet.files.slice(0, budgets.maxFiles)) {
    const reasons = file.reasons.map((r) => r.detail).slice(0, 3).join('; ')
    lines.push(`<file path="${file.filePath}" score="${file.score}" confidence="${file.confidence}" reasons="${reasons}">`)
    for (const snippet of file.snippets) {
      const content = snippet.content?.slice(0, maxSnippetChars) ?? ''
      if (!content) continue
      lines.push('```')
      lines.push(`// ${snippet.label} — lines ${snippet.range.startLine}-${snippet.range.endLine}`)
      lines.push(content)
      lines.push('```')
    }
    lines.push('</file>')
  }
  lines.push('</relevant_code>')
  return lines.join('\n')
}

function buildModuleSummariesSection(packet: ContextPacket): string[] {
  if (!packet.moduleSummaries || packet.moduleSummaries.length === 0) return []
  const lines: string[] = ['', 'Relevant modules:']
  for (const mod of packet.moduleSummaries) {
    const deps = mod.dependencies?.length ? ` Depends on: ${mod.dependencies.join(', ')}.` : ''
    lines.push(`- ${mod.moduleId} (${mod.label}) — ${mod.description}${deps}`)
    if (mod.keyResponsibilities.length > 0) lines.push(`  Responsibilities: ${mod.keyResponsibilities.join('; ')}`)
    if (mod.gotchas.length > 0) lines.push(`  Gotchas: ${mod.gotchas.join('; ')}`)
  }
  return lines
}

export function buildProjectStructureSection(packet: ContextPacket): string {
  const moduleCount = packet.repoMap?.moduleCount ?? 0
  const lines: string[] = [`<project_structure modules="${moduleCount}">`]
  if (packet.repoMap) {
    const rm = packet.repoMap
    lines.push(`Project: ${rm.projectName}`)
    lines.push(`Languages: ${rm.languages.join(', ')}`)
    if (rm.frameworks.length > 0) lines.push(`Frameworks: ${rm.frameworks.join(', ')}`)
  }
  lines.push(...buildModuleSummariesSection(packet))
  lines.push('</project_structure>')
  return lines.join('\n')
}

export function buildDiagnosticsSection(packet: ContextPacket): string {
  const diag = packet.repoFacts.diagnostics
  if (diag.totalErrors === 0 && diag.totalWarnings === 0) return ''
  const lines: string[] = [`<diagnostics errors="${diag.totalErrors}" warnings="${diag.totalWarnings}">`]
  for (const file of diag.files) {
    if (!file.messages || file.messages.length === 0) continue
    for (const msg of file.messages) lines.push(`${path.basename(file.filePath)}:${msg.line} — ${msg.severity}: ${msg.message}`)
  }
  lines.push('</diagnostics>')
  return lines.join('\n')
}

export function buildTerminalSection(packet: ContextPacket): string {
  const snapshots = packet.liveIdeState.terminalSnapshots
  if (!snapshots || snapshots.length === 0) return ''
  const lines: string[] = [`<terminal_output sessions="${snapshots.length}">`]
  const selected = snapshots.slice(0, 5)
  for (let i = 0; i < selected.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- safe: i is loop index bounded by array length
    const snap = selected[i]
    const lineLimit = i === selected.length - 1 ? 120 : 80
    const sessionLines = snap.lines.slice(-lineLimit)
    if (sessionLines.length === 0) continue
    lines.push(`Session ${snap.sessionId}:`)
    lines.push(sessionLines.join('\n'))
  }
  lines.push('</terminal_output>')
  return lines.join('\n')
}

export function buildXmlContextBlock(context: ProviderLaunchContext | ProviderResumeContext, model: string): string {
  const packet = context.contextPacket
  if (!packet) return ''
  const sections: string[] = []
  sections.push('<ide_context>')
  sections.push(buildCurrentFocusSection(packet))
  sections.push(buildWorkspaceStateSection(packet))
  sections.push(buildRelevantCodeSection(packet, model))
  sections.push(buildProjectStructureSection(packet))
  sections.push(buildDiagnosticsSection(packet))
  sections.push(buildTerminalSection(packet))
  sections.push('</ide_context>')
  let output = sections.filter(Boolean).join('\n\n')
  if (packet.graphSummary) output += '\n\n' + packet.graphSummary
  if (packet.sessionMemories) output += '\n\n' + packet.sessionMemories
  return output
}

export function buildInitialPrompt(context: ProviderLaunchContext | ProviderResumeContext, goalSuffix = '', isResume = false, model = ''): string {
  const lines: string[] = []
  if (!isResume) {
    const history = context.request.conversationHistory
    if (history && history.length > 0) {
      lines.push('<conversation_history>')
      for (const msg of history) {
        const tag = msg.role === 'user' ? 'user_message' : 'assistant_message'
        lines.push(`<${tag}>${msg.content}</${tag}>`)
      }
      lines.push('</conversation_history>')
      lines.push('')
    }
  }
  lines.push(context.request.goal + goalSuffix)
  lines.push('')
  lines.push(buildXmlContextBlock(context, model))
  return lines.join('\n')
}

function resolveToolInputSummary(inp: Record<string, unknown>): string | undefined {
  if (typeof inp.command === 'string') return inp.command.length > 200 ? inp.command.slice(0, 197) + '...' : inp.command
  if (typeof inp.pattern === 'string') return `/${inp.pattern}/` + (typeof inp.glob === 'string' ? ` in ${inp.glob}` : '')
  if (typeof inp.description === 'string') return inp.description.length > 150 ? inp.description.slice(0, 147) + '...' : inp.description
  return undefined
}

export function extractToolDisplayFields(block: StreamJsonToolUseBlock): {
  filePath?: string
  inputSummary?: string
  editSummary?: { oldLines: number; newLines: number }
} {
  const inp = block.input as Record<string, unknown> | undefined
  if (!inp) return {}
  const result: { filePath?: string; inputSummary?: string; editSummary?: { oldLines: number; newLines: number } } = {}
  const fp = inp.file_path ?? inp.filePath ?? inp.path
  if (typeof fp === 'string') result.filePath = fp
  result.inputSummary = resolveToolInputSummary(inp)
  if (typeof inp.old_string === 'string' && typeof inp.new_string === 'string') {
    result.editSummary = { oldLines: inp.old_string.split('\n').length, newLines: inp.new_string.split('\n').length }
  }
  return result
}
