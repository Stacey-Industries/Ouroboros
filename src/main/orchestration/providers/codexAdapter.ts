import { randomUUID } from 'crypto'
import { unlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

import type { ImageAttachment } from '../../agentChat/types'
import { type CodexCliSettings, getConfigValue } from '../../config'
import { applyCodexPermissionModeOverride, mapEffortToCodexReasoning, buildCodexCliArgs } from '../../codex'
import { getModelBudgets } from '../contextPacketBuilderSupport'
import type { ContextPacket, ProviderCapabilities } from '../types'
import {
  type ProviderAdapter,
  type ProviderLaunchContext,
  type ProviderLaunchResult,
  type ProviderProgressSink,
  type ProviderResumeContext,
  createProviderArtifact,
  createProviderSessionReference,
} from './providerAdapter'
import {
  type CodexAgentMessageItem,
  type CodexCommandExecutionItem,
  type CodexFileChange,
  type CodexFileChangeItem,
  type CodexItemCompletedEvent,
  type CodexItemStartedEvent,
  type CodexExecEvent,
  type CodexExecProcessHandle,
  type CodexThreadStartedEvent,
  type CodexTurnCompletedEvent,
  spawnCodexExecProcess,
} from './codexExecRunner'

const activeProcesses = new Map<string, CodexExecProcessHandle>()
const cancelledTasks = new Set<string>()

function createCapabilities(): ProviderCapabilities {
  return {
    provider: 'codex',
    supportsStreaming: true,
    supportsResume: true,
    supportsStructuredEdits: false,
    supportsToolUse: true,
    supportsContextCaching: false,
    maxContextHint: null,
    requiresTerminalSession: false,
    requiresHookEvents: false,
  }
}

async function materializeAttachments(
  attachments: ImageAttachment[],
): Promise<{ imagePaths: string[] }> {
  const imagePaths: string[] = []

  for (const attachment of attachments) {
    const ext = attachment.mimeType.split('/')[1] ?? 'png'
    const tempPath = `${tmpdir()}/${randomUUID()}.${ext}`
    await writeFile(tempPath, Buffer.from(attachment.base64Data, 'base64'))
    imagePaths.push(tempPath)
  }

  return { imagePaths }
}

async function cleanupTempFiles(tempPaths: string[]): Promise<void> {
  for (const tempPath of tempPaths) {
    try {
      await unlink(tempPath)
    } catch {
      // ignore temp cleanup errors
    }
  }
}

function buildCurrentFocusSection(packet: ContextPacket): string {
  const ide = packet.liveIdeState
  const lines: string[] = ['<current_focus>']

  if (ide.activeFile) {
    const dirty = ide.dirtyFiles.includes(ide.activeFile) ? ' (unsaved changes)' : ''
    lines.push(`Active file: ${path.basename(ide.activeFile)}${dirty}`)
  }

  if (ide.selection) {
    lines.push(`Cursor/selection: lines ${ide.selection.startLine}-${ide.selection.endLine}`)
  }

  if (ide.openFiles.length > 0) {
    const dirtySet = new Set(ide.dirtyFiles.map((filePath) => filePath.toLowerCase()))
    const fileList = ide.openFiles.slice(0, 12).map((filePath) => {
      const basename = path.basename(filePath)
      return dirtySet.has(filePath.toLowerCase()) ? `${basename} (dirty)` : basename
    })
    lines.push(`Open tabs (${ide.openFiles.length}): ${fileList.join(', ')}`)
  }

  lines.push('</current_focus>')
  return lines.join('\n')
}

function buildWorkspaceStateSection(packet: ContextPacket): string {
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
    for (const commit of commits.slice(0, 5)) {
      lines.push(`- ${commit.hash} ${commit.message}`)
    }
  }

  const recentEdits = packet.repoFacts.recentEdits.files.slice(0, 8)
  if (recentEdits.length > 0) {
    lines.push(`Recently edited: ${recentEdits.map((filePath) => path.basename(filePath)).join(', ')}`)
  }

  if (packet.liveIdeState.dirtyFiles.length > 0) {
    lines.push(`Unsaved buffers (${packet.liveIdeState.dirtyFiles.length}): ${packet.liveIdeState.dirtyFiles.map((filePath) => path.basename(filePath)).join(', ')}`)
  }

  lines.push('</workspace_state>')
  return lines.join('\n')
}

function buildRelevantCodeSection(packet: ContextPacket, model: string): string {
  const budgets = getModelBudgets(model)
  const maxSnippetChars = model.includes('gpt-5.4') || model.includes('codex-max') ? 4000 : 2000
  const lines: string[] = ['<relevant_code>']

  for (const file of packet.files.slice(0, budgets.maxFiles)) {
    const reasons = file.reasons.map((reason) => reason.detail).slice(0, 3).join('; ')
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

function buildProjectStructureSection(packet: ContextPacket): string {
  const lines: string[] = []
  lines.push(`<project_structure modules="${packet.repoMap?.moduleCount ?? 0}">`)

  if (packet.repoMap) {
    lines.push(`Project: ${packet.repoMap.projectName}`)
    lines.push(`Languages: ${packet.repoMap.languages.join(', ')}`)
    if (packet.repoMap.frameworks.length > 0) {
      lines.push(`Frameworks: ${packet.repoMap.frameworks.join(', ')}`)
    }
  }

  if (packet.moduleSummaries && packet.moduleSummaries.length > 0) {
    lines.push('')
    lines.push('Relevant modules:')
    for (const mod of packet.moduleSummaries) {
      const deps = mod.dependencies?.length ? ` Depends on: ${mod.dependencies.join(', ')}.` : ''
      lines.push(`- ${mod.moduleId} (${mod.label}) - ${mod.description}${deps}`)

      if (mod.keyResponsibilities.length > 0) {
        lines.push(`  Responsibilities: ${mod.keyResponsibilities.join('; ')}`)
      }
      if (mod.gotchas.length > 0) {
        lines.push(`  Gotchas: ${mod.gotchas.join('; ')}`)
      }
    }
  }

  lines.push('</project_structure>')
  return lines.join('\n')
}

function buildDiagnosticsSection(packet: ContextPacket): string {
  const diagnostics = packet.repoFacts.diagnostics
  if (diagnostics.totalErrors === 0 && diagnostics.totalWarnings === 0) return ''

  const lines: string[] = [`<diagnostics errors="${diagnostics.totalErrors}" warnings="${diagnostics.totalWarnings}">`]
  for (const file of diagnostics.files) {
    if (!file.messages || file.messages.length === 0) continue
    for (const message of file.messages) {
      lines.push(`${path.basename(file.filePath)}:${message.line} - ${message.severity}: ${message.message}`)
    }
  }
  lines.push('</diagnostics>')
  return lines.join('\n')
}

function buildTerminalSection(packet: ContextPacket): string {
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

function buildXmlContextBlock(
  context: ProviderLaunchContext | ProviderResumeContext,
  model: string,
): string {
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

  const result = sections.join('\n\n')
  return packet.graphSummary ? `${result}\n\n${packet.graphSummary}` : result
}

function buildPrompt(
  context: ProviderLaunchContext | ProviderResumeContext,
  model: string,
  isResume: boolean,
): string {
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
  if (xmlContext) {
    lines.push(xmlContext)
  }

  return lines.join('\n')
}

function summarizeCommand(command: string | undefined): string | undefined {
  if (!command) return undefined
  return command.length > 200 ? `${command.slice(0, 197)}...` : command
}

function mapFileChangeKindToTool(kind: string | undefined): 'Write' | 'Edit' {
  switch (kind) {
    case 'add':
    case 'create':
    case 'write':
      return 'Write'
    default:
      return 'Edit'
  }
}

function summarizeFileChange(change: CodexFileChange): string | undefined {
  switch (change.kind) {
    case 'add':
    case 'create':
      return 'Created file'
    case 'delete':
    case 'remove':
      return 'Deleted file'
    case 'rename':
      return 'Renamed file'
    case 'write':
      return 'Wrote file'
    case 'modify':
    case 'update':
      return 'Updated file'
    default:
      return undefined
  }
}

function buildEventHandler(
  sink: ProviderProgressSink,
  sessionRef: ReturnType<typeof createProviderSessionReference>,
): {
  getNextBlockIndex: () => number
  handler: (event: CodexExecEvent) => void
  getUsage: () => { inputTokens: number; outputTokens: number } | undefined
} {
  let nextBlockIndex = 0
  const commandBlocks = new Map<string, number>()
  let lastUsage: { inputTokens: number; outputTokens: number } | undefined

  const handler = (event: CodexExecEvent) => {
    const now = Date.now()

    if (event.type === 'thread.started') {
      const threadStarted = event as CodexThreadStartedEvent
      if (!threadStarted.thread_id) return
      sessionRef.sessionId = threadStarted.thread_id
      return
    }

    if (event.type === 'item.started') {
      const itemStarted = event as CodexItemStartedEvent
      if (itemStarted.item.type !== 'command_execution') return
      const item = itemStarted.item as CodexCommandExecutionItem
      const blockIndex = nextBlockIndex++
      commandBlocks.set(item.id, blockIndex)
      sink.emit({
        provider: 'codex',
        status: 'streaming',
        message: '',
        timestamp: now,
        session: sessionRef,
        contentBlock: {
          blockIndex,
          blockType: 'tool_use',
          toolActivity: {
            name: 'Bash',
            status: 'running',
            inputSummary: summarizeCommand(item.command),
          },
        },
      })
      return
    }

    if (event.type === 'item.completed') {
      const itemCompleted = event as CodexItemCompletedEvent
      if (itemCompleted.item.type === 'agent_message') {
        const item = itemCompleted.item as CodexAgentMessageItem
        const text = item.text ?? ''
        if (!text) return
        sink.emit({
          provider: 'codex',
          status: 'streaming',
          message: text,
          timestamp: now,
          session: sessionRef,
          contentBlock: {
            blockIndex: nextBlockIndex++,
            blockType: 'text',
            textDelta: text,
          },
        })
        return
      }

      if (itemCompleted.item.type === 'command_execution') {
        const item = itemCompleted.item as CodexCommandExecutionItem
        const blockIndex = commandBlocks.get(item.id) ?? nextBlockIndex++
        commandBlocks.delete(item.id)
        sink.emit({
          provider: 'codex',
          status: 'streaming',
          message: '',
          timestamp: now,
          session: sessionRef,
          contentBlock: {
            blockIndex,
            blockType: 'tool_use',
            toolActivity: {
              name: 'Bash',
              status: 'complete',
              inputSummary: summarizeCommand(item.command),
            },
          },
        })
        return
      }

      if (itemCompleted.item.type === 'file_change') {
        const item = itemCompleted.item as CodexFileChangeItem
        const changes = (item.changes ?? []).filter(
          (change): change is CodexFileChange & { path: string } =>
            typeof change.path === 'string' && change.path.trim().length > 0,
        )

        for (const change of changes) {
          const blockIndex = nextBlockIndex++
          const name = mapFileChangeKindToTool(change.kind)
          const inputSummary = summarizeFileChange(change)

          sink.emit({
            provider: 'codex',
            status: 'streaming',
            message: '',
            timestamp: now,
            session: sessionRef,
            contentBlock: {
              blockIndex,
              blockType: 'tool_use',
              toolActivity: {
                name,
                status: 'running',
                filePath: change.path,
                inputSummary,
              },
            },
          })

          sink.emit({
            provider: 'codex',
            status: 'streaming',
            message: '',
            timestamp: now,
            session: sessionRef,
            contentBlock: {
              blockIndex,
              blockType: 'tool_use',
              toolActivity: {
                name,
                status: 'complete',
                filePath: change.path,
                inputSummary,
              },
            },
          })
        }
        return
      }
    }

    if (event.type === 'turn.completed') {
      const usage = (event as CodexTurnCompletedEvent).usage
      if (usage) {
        lastUsage = {
          inputTokens: (usage.input_tokens ?? 0) + (usage.cached_input_tokens ?? 0),
          outputTokens: usage.output_tokens ?? 0,
        }
      }
    }
  }

  return {
    getNextBlockIndex: () => nextBlockIndex,
    handler,
    getUsage: () => lastUsage,
  }
}

function buildFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function resolveSettings(
  context: ProviderLaunchContext | ProviderResumeContext,
): { cliArgs: string[]; model: string } {
  const baseSettings = getConfigValue('codexCliSettings') as CodexCliSettings
  const permissionAdjusted = applyCodexPermissionModeOverride(baseSettings, context.request.permissionMode)
  const requestReasoning = mapEffortToCodexReasoning(context.request.effort)

  const settings: CodexCliSettings = {
    ...permissionAdjusted,
    model: context.request.model || permissionAdjusted.model || '',
    reasoningEffort: requestReasoning ?? permissionAdjusted.reasoningEffort ?? '',
  }

  return {
    cliArgs: buildCodexCliArgs(settings, 'exec'),
    model: settings.model,
  }
}

function launchCodex(
  context: ProviderLaunchContext | ProviderResumeContext,
  sink: ProviderProgressSink,
  resumeThreadId?: string,
): ProviderLaunchResult {
  const requestId = `orchestration-${context.attemptId}`
  const cwd = context.request.workspaceRoots[0]
  const { cliArgs, model } = resolveSettings(context)
  const sessionRef = createProviderSessionReference('codex', {
    requestId,
    sessionId: resumeThreadId || ('providerSession' in context ? context.providerSession?.sessionId : undefined),
    externalTaskId: context.taskId,
  })

  sink.emit({
    provider: 'codex',
    status: 'queued',
    message: 'Launching Codex session',
    timestamp: Date.now(),
    session: sessionRef,
  })

  const { handler: eventHandler, getNextBlockIndex, getUsage } = buildEventHandler(sink, sessionRef)
  const invocationTempPaths: string[] = []

  let cancelledBeforeLaunch = false
  const placeholder: CodexExecProcessHandle = {
    result: null as unknown as Promise<{ threadId: string | null }>,
    kill: () => {
      const realHandle = activeProcesses.get(context.taskId)
      if (realHandle && realHandle !== placeholder) {
        realHandle.kill()
      } else {
        cancelledBeforeLaunch = true
      }
    },
    threadId: sessionRef.sessionId ?? null,
  }
  activeProcesses.set(context.taskId, placeholder)

  const resultPromise = (async () => {
    if (context.request.goalAttachments?.length) {
      try {
        const materialized = await materializeAttachments(context.request.goalAttachments)
        invocationTempPaths.push(...materialized.imagePaths)
      } catch (error) {
        console.error('[codex] failed to materialize attachments:', error)
      }
    }

    if (cancelledBeforeLaunch) {
      activeProcesses.delete(context.taskId)
      return null
    }

    const prompt = buildPrompt(context, model, Boolean(resumeThreadId))
    const handle = spawnCodexExecProcess({
      prompt,
      cwd,
      cliArgs,
      imagePaths: invocationTempPaths,
      onEvent: eventHandler,
      resumeThreadId,
    })

    activeProcesses.set(context.taskId, handle)
    return handle.result
  })()

  const settled = resultPromise.then(
    (inner) => inner,
    (error) => { throw error },
  )

  settled.then(
    async (result) => {
      activeProcesses.delete(context.taskId)
      void cleanupTempFiles(invocationTempPaths)

      if (!result) {
        sink.emit({
          provider: 'codex',
          status: 'cancelled',
          message: 'Task cancelled by user',
          timestamp: Date.now(),
          session: sessionRef,
        })
        return
      }

      if (result.threadId) {
        sessionRef.sessionId = result.threadId
      }

      const usage = getUsage()
      sink.emit({
        provider: 'codex',
        status: 'completed',
        message: 'Response complete',
        timestamp: Date.now(),
        session: sessionRef,
        tokenUsage: usage,
      })
    },
    (error) => {
      const errorMessage = buildFailureMessage(error)
      const wasCancelled = cancelledTasks.delete(context.taskId)
      activeProcesses.delete(context.taskId)
      void cleanupTempFiles(invocationTempPaths)

      if (wasCancelled) {
        sink.emit({
          provider: 'codex',
          status: 'cancelled',
          message: 'Task cancelled by user',
          timestamp: Date.now(),
          session: sessionRef,
        })
        return
      }

      sink.emit({
        provider: 'codex',
        status: 'streaming',
        message: errorMessage,
        timestamp: Date.now(),
        session: sessionRef,
        contentBlock: {
          blockIndex: getNextBlockIndex(),
          blockType: 'text',
          textDelta: `\n\n---\n**Codex stopped** - ${errorMessage}`,
        },
      })

      sink.emit({
        provider: 'codex',
        status: 'failed',
        message: errorMessage,
        timestamp: Date.now(),
        session: sessionRef,
      })
    },
  )

  sink.emit({
    provider: 'codex',
    status: 'queued',
    message: 'Codex session started',
    timestamp: Date.now(),
    session: sessionRef,
  })

  return {
    session: sessionRef,
    artifact: createProviderArtifact({
      provider: 'codex',
      status: 'streaming',
      session: sessionRef,
      submittedAt: Date.now(),
    }),
  }
}

export class CodexAdapter implements ProviderAdapter {
  readonly provider = 'codex' as const

  getCapabilities(): ProviderCapabilities {
    return createCapabilities()
  }

  async submitTask(context: ProviderLaunchContext, sink: ProviderProgressSink): Promise<ProviderLaunchResult> {
    const resumeThreadId = context.request.resumeFromSessionId || undefined
    return launchCodex(context, sink, resumeThreadId)
  }

  async resumeTask(context: ProviderResumeContext, sink: ProviderProgressSink): Promise<ProviderLaunchResult> {
    const resumeThreadId = context.providerSession?.sessionId || context.request.resumeFromSessionId || undefined
    return launchCodex(context, sink, resumeThreadId)
  }

  async cancelTask(session: { requestId?: string; sessionId?: string; externalTaskId?: string }): Promise<void> {
    const targetId = session.externalTaskId ?? session.requestId ?? session.sessionId
    if (!targetId) return

    const handle = activeProcesses.get(targetId)
    if (handle) {
      cancelledTasks.add(targetId)
      handle.kill()
      activeProcesses.delete(targetId)
      return
    }

    for (const [taskId, proc] of activeProcesses) {
      if (proc.threadId === targetId || taskId === targetId) {
        cancelledTasks.add(taskId)
        proc.kill()
        activeProcesses.delete(taskId)
        return
      }
    }
  }
}

export function createCodexAdapter(): CodexAdapter {
  return new CodexAdapter()
}
