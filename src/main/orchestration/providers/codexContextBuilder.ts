/**
 * codexContextBuilder.ts — XML context block builders for CodexAdapter.
 * Converts ContextPacket data into structured XML sections for the prompt.
 */
import path from 'path'

import { getModelBudgets } from '../contextPacketBuilderSupport'
import type { ContextPacket } from '../types'
import type { ProviderLaunchContext, ProviderResumeContext } from './providerAdapter'

export function buildCurrentFocusSection(packet: ContextPacket): string {
  const ide = packet.liveIdeState
  const lines: string[] = ['<current_focus>']
  if (ide.activeFile) {
    const dirty = ide.dirtyFiles.includes(ide.activeFile) ? ' (unsaved changes)' : ''
    lines.push(`Active file: ${path.basename(ide.activeFile)}${dirty}`)
  }
  if (ide.selection) lines.push(`Cursor/selection: lines ${ide.selection.startLine}-${ide.selection.endLine}`)
  if (ide.openFiles.length > 0) {
    const dirtySet = new Set(ide.dirtyFiles.map((f) => f.toLowerCase()))
    const fileList = ide.openFiles.slice(0, 12).map((f) => {
      const basename = path.basename(f)
      return dirtySet.has(f.toLowerCase()) ? `${basename} (dirty)` : basename
    })
    lines.push(`Open tabs (${ide.openFiles.length}): ${fileList.join(', ')}`)
  }
  lines.push('</current_focus>')
  return lines.join('\n')
}

export function buildWorkspaceStateSection(packet: ContextPacket): string {
  const diff = packet.repoFacts.gitDiff
  const diagnostics = packet.repoFacts.diagnostics
  const attrs: string[] = []
  if (diff.currentBranch) attrs.push(`branch="${diff.currentBranch}"`)
  attrs.push(`changed_files="${diff.changedFileCount}"`)
  if (diagnostics.totalErrors > 0) attrs.push(`errors="${diagnostics.totalErrors}"`)
  if (diagnostics.totalWarnings > 0) attrs.push(`warnings="${diagnostics.totalWarnings}"`)
  const lines: string[] = [`<workspace_state ${attrs.join(' ')}>`]
  const commits = packet.repoFacts.recentCommits
  if (commits && commits.length > 0) {
    lines.push('Recent commits:')
    for (const commit of commits.slice(0, 5)) lines.push(`- ${commit.hash} ${commit.message}`)
  }
  const recentEdits = packet.repoFacts.recentEdits.files.slice(0, 8)
  if (recentEdits.length > 0) lines.push(`Recently edited: ${recentEdits.map((f) => path.basename(f)).join(', ')}`)
  if (packet.liveIdeState.dirtyFiles.length > 0) {
    const dirtyNames = packet.liveIdeState.dirtyFiles.map((f) => path.basename(f)).join(', ')
    lines.push(`Unsaved buffers (${packet.liveIdeState.dirtyFiles.length}): ${dirtyNames}`)
  }
  lines.push('</workspace_state>')
  return lines.join('\n')
}

export function buildRelevantCodeSection(packet: ContextPacket, model: string): string {
  const budgets = getModelBudgets(model)
  const maxSnippetChars = model.includes('gpt-5.4') || model.includes('codex-max') ? 4000 : 2000
  const lines: string[] = ['<relevant_code>']
  for (const file of packet.files.slice(0, budgets.maxFiles)) {
    const reasons = file.reasons.map((r) => r.detail).slice(0, 3).join('; ')
    lines.push(`<file path="${file.filePath}" score="${file.score}" confidence="${file.confidence}" reasons="${reasons}">`)
    for (const snippet of file.snippets) {
      const content = snippet.content?.slice(0, maxSnippetChars) ?? ''
      if (!content) continue
      lines.push('```')
      lines.push(`// ${snippet.label} - lines ${snippet.range.startLine}-${snippet.range.endLine}`)
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
    lines.push(`- ${mod.moduleId} (${mod.label}) - ${mod.description}${deps}`)
    if (mod.keyResponsibilities.length > 0) lines.push(`  Responsibilities: ${mod.keyResponsibilities.join('; ')}`)
    if (mod.gotchas.length > 0) lines.push(`  Gotchas: ${mod.gotchas.join('; ')}`)
  }
  return lines
}

export function buildProjectStructureSection(packet: ContextPacket): string {
  const lines: string[] = [`<project_structure modules="${packet.repoMap?.moduleCount ?? 0}">`]
  if (packet.repoMap) {
    lines.push(`Project: ${packet.repoMap.projectName}`)
    lines.push(`Languages: ${packet.repoMap.languages.join(', ')}`)
    if (packet.repoMap.frameworks.length > 0) lines.push(`Frameworks: ${packet.repoMap.frameworks.join(', ')}`)
  }
  lines.push(...buildModuleSummariesSection(packet))
  lines.push('</project_structure>')
  return lines.join('\n')
}

export function buildDiagnosticsSection(packet: ContextPacket): string {
  const diagnostics = packet.repoFacts.diagnostics
  if (diagnostics.totalErrors === 0 && diagnostics.totalWarnings === 0) return ''
  const lines: string[] = [`<diagnostics errors="${diagnostics.totalErrors}" warnings="${diagnostics.totalWarnings}">`]
  for (const file of diagnostics.files) {
    if (!file.messages || file.messages.length === 0) continue
    for (const message of file.messages) lines.push(`${path.basename(file.filePath)}:${message.line} - ${message.severity}: ${message.message}`)
  }
  lines.push('</diagnostics>')
  return lines.join('\n')
}

export function buildTerminalSection(packet: ContextPacket): string {
  const snapshots = packet.liveIdeState.terminalSnapshots
  if (!snapshots || snapshots.length === 0) return ''
  const lines: string[] = [`<terminal_output sessions="${snapshots.length}">`]
  for (const [index, snapshot] of snapshots.slice(0, 5).entries()) {
    const lineLimit = index === snapshots.slice(0, 5).length - 1 ? 120 : 80
    const sessionLines = snapshot.lines.slice(-lineLimit)
    if (sessionLines.length === 0) continue
    lines.push(`Session ${snapshot.sessionId}:`)
    lines.push(sessionLines.join('\n'))
  }
  lines.push('</terminal_output>')
  return lines.join('\n')
}

export function buildXmlContextBlock(context: ProviderLaunchContext | ProviderResumeContext, model: string): string {
  const packet = context.contextPacket
  if (!packet) return ''
  const sections = [
    '<ide_context>',
    buildCurrentFocusSection(packet),
    buildWorkspaceStateSection(packet),
    buildRelevantCodeSection(packet, model),
    buildProjectStructureSection(packet),
    buildDiagnosticsSection(packet),
    buildTerminalSection(packet),
    '</ide_context>',
  ].filter(Boolean)
  let output = sections.join('\n\n')
  if (packet.graphSummary) output += `\n\n${packet.graphSummary}`
  if (packet.sessionMemories) output += `\n\n${packet.sessionMemories}`
  return output
}

export function buildPrompt(context: ProviderLaunchContext | ProviderResumeContext, model: string, isResume: boolean): string {
  const lines: string[] = []
  if (!isResume) {
    const history = context.request.conversationHistory
    if (history && history.length > 0) {
      lines.push('<conversation_history>')
      for (const message of history) {
        const tag = message.role === 'user' ? 'user_message' : 'assistant_message'
        lines.push(`<${tag}>${message.content}</${tag}>`)
      }
      lines.push('</conversation_history>')
      lines.push('')
    }
  }
  lines.push(context.request.goal)
  lines.push('')
  const xmlContext = buildXmlContextBlock(context, model)
  if (xmlContext) lines.push(xmlContext)
  return lines.join('\n')
}
