/**
 * claudeCodeSubagentHandler.ts — Handles subagent assistant events from stream-json.
 *
 * Extracted from claudeCodeEventHandler.ts to stay under the ESLint max-lines limit.
 * Subagent events have `parent_tool_use_id` set, linking them to a parent Agent/Task tool.
 */
import log from '../../logger'
import { extractToolDisplayFields } from './claudeCodeContextBuilder'
import type { createProviderSessionReference, ProviderProgressSink } from './providerAdapter'
import type { StreamJsonEvent, StreamJsonToolResultBlock, StreamJsonToolUseBlock } from './streamJsonTypes'

type SessionRef = ReturnType<typeof createProviderSessionReference>

export interface SubagentState {
  parentToolUseToGlobal: Map<string, { name: string; globalIndex: number }>
  subToolCounters: Map<string, number>
  subToolIdByToolUseId: Map<string, { parentId: string; subToolId: string }>
}

interface EmitCtx {
  now: number
  sink: ProviderProgressSink
  sessionRef: SessionRef
}

export function isSubagentEvent(event: StreamJsonEvent & { type: 'assistant' }): boolean {
  const parentId = (event as unknown as Record<string, unknown>).parent_tool_use_id
  return parentId !== undefined && parentId !== null
}

function nextSubToolId(state: SubagentState, parentId: string): string {
  const count = (state.subToolCounters.get(parentId) ?? 0) + 1
  state.subToolCounters.set(parentId, count)
  return `${parentId}:sub-${count}`
}

function emitSubToolEvent(parent: { name: string; globalIndex: number }, sub: {
  name: string; status: 'running' | 'complete'; subToolId: string
  filePath?: string; inputSummary?: string; output?: string
  editSummary?: { oldLines: number; newLines: number }
}, ctx: EmitCtx): void {
  ctx.sink.emit({
    provider: 'claude-code',
    status: 'streaming',
    message: '',
    timestamp: ctx.now,
    session: ctx.sessionRef,
    contentBlock: {
      blockIndex: parent.globalIndex,
      blockType: 'tool_use',
      toolActivity: {
        name: parent.name,
        status: 'running',
        subToolActivity: {
          name: sub.name, status: sub.status, filePath: sub.filePath,
          inputSummary: sub.inputSummary, editSummary: sub.editSummary,
          output: sub.output, subToolId: sub.subToolId,
        },
      },
    },
  })
}

function processToolUse(
  state: SubagentState, block: StreamJsonToolUseBlock,
  parentCtx: { parentId: string; name: string; globalIndex: number }, ctx: EmitCtx,
): void {
  const subToolId = nextSubToolId(state, parentCtx.parentId)
  const display = extractToolDisplayFields(block)
  log.info(`[trace:stream] subagent tool_use: name=${block.name} subToolId=${subToolId}`)
  emitSubToolEvent(parentCtx, { name: block.name, status: 'running', subToolId, ...display }, ctx)
  state.subToolIdByToolUseId.set(block.id, { parentId: parentCtx.parentId, subToolId })
}

function processToolResult(
  state: SubagentState, block: StreamJsonToolResultBlock,
  parent: { name: string; globalIndex: number }, ctx: EmitCtx,
): void {
  const mapping = state.subToolIdByToolUseId.get(block.tool_use_id)
  if (!mapping) return
  const raw = typeof block.content === 'string' ? block.content : JSON.stringify(block.content)
  emitSubToolEvent(parent, { name: '', status: 'complete', subToolId: mapping.subToolId, output: raw || undefined }, ctx)
}

export function handleSubagentEvent(state: SubagentState, event: StreamJsonEvent & { type: 'assistant' }, ctx: EmitCtx): void {
  const parentId = (event as unknown as Record<string, unknown>).parent_tool_use_id as string
  const parent = state.parentToolUseToGlobal.get(parentId)
  if (!parent) {
    log.info(`[trace:stream] subagent: no parent mapping for ${parentId}`)
    return
  }
  const parentCtx = { parentId, ...parent }
  for (const block of event.message.content) {
    if (block.type === 'tool_use') processToolUse(state, block as StreamJsonToolUseBlock, parentCtx, ctx)
    else if (block.type === 'tool_result') processToolResult(state, block as StreamJsonToolResultBlock, parent, ctx)
  }
}
