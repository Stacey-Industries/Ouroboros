/**
 * claudeCodeEventHandler.ts — Stream-JSON event handler for ClaudeCodeAdapter.
 *
 * Claude Code emits full message snapshots (not per-block deltas), so this
 * handler diffs each event against prior state to compute per-block deltas
 * with stable global block indices across multi-turn conversations.
 *
 * Key invariants:
 * - `user` events mark turn boundaries (tool result returned → next assistant
 *   event starts a new turn). This is more reliable than comparing block type
 *   arrays, which miss same-shape turns (e.g. [tool_use] → [tool_use]).
 * - Assistant events with `parent_tool_use_id` are subagent responses — their
 *   tool_use blocks are emitted as `subToolActivity` on the parent Agent/Task block.
 */
import { extractToolDisplayFields } from './claudeCodeContextBuilder'
import type { SubagentState } from './claudeCodeSubagentHandler'
import { handleSubagentEvent, isSubagentEvent } from './claudeCodeSubagentHandler'
import type { createProviderSessionReference, ProviderProgressSink } from './providerAdapter'
import type { StreamJsonContentBlock, StreamJsonEvent, StreamJsonToolUseBlock } from './streamJsonTypes'

type SessionRef = ReturnType<typeof createProviderSessionReference>

interface EventHandlerState extends SubagentState {
  nextGlobalBlockIndex: number
  localToGlobal: number[]
  emittedContentLengths: Map<number, number>
  toolIdToGlobal: Map<string, { name: string; globalIndex: number }>
  toolResultContents: Map<string, string>
  prevBlockTypes: string[]
  lastTurnInputTokens: number
  cumulativeOutputTokens: number
  turnBoundaryPending: boolean
  pendingCompletions: Map<string, { name: string; globalIndex: number }>
}

interface EmitCtx {
  now: number
  sink: ProviderProgressSink
  sessionRef: SessionRef
}

function hasNewToolUseId(state: EventHandlerState, blocks: StreamJsonContentBlock[]): boolean {
  // If blocks aren't growing (same count), check for tool_use ID replacement.
  // Parallel tools arrive as separate messages with the same block count but
  // different tool_use IDs — this detects them.
  if (blocks.length > state.localToGlobal.length) return false
  for (const block of blocks) {
    if (block.type === 'tool_use' && !state.toolIdToGlobal.has((block as StreamJsonToolUseBlock).id)) {
      return true
    }
  }
  return false
}

function detectNewTurn(state: EventHandlerState, blocks: StreamJsonContentBlock[]): boolean {
  if (state.turnBoundaryPending) return true
  const prev = state.prevBlockTypes
  if (prev.length === 0) return false
  if (blocks.length < prev.length) return true
  for (let i = 0; i < Math.min(blocks.length, prev.length); i++) {
    // eslint-disable-next-line security/detect-object-injection -- safe: i is loop index bounded by array length
    if (blocks[i].type !== prev[i]) return true
  }
  return hasNewToolUseId(state, blocks)
}

function cleanupSubToolIds(state: EventHandlerState): void {
  const activeParents = new Set(state.parentToolUseToGlobal.keys())
  for (const [toolUseId, mapping] of state.subToolIdByToolUseId) {
    if (!activeParents.has(mapping.parentId)) state.subToolIdByToolUseId.delete(toolUseId)
  }
}

function emitToolCompletion(info: { name: string; globalIndex: number }, output: string | undefined, ctx: EmitCtx): void {
  ctx.sink.emit({
    provider: 'claude-code',
    status: 'streaming',
    message: '',
    timestamp: ctx.now,
    session: ctx.sessionRef,
    contentBlock: { blockIndex: info.globalIndex, blockType: 'tool_use', toolActivity: { name: info.name, status: 'complete', output } },
  })
}

function completeOpenTools(state: EventHandlerState, ctx: EmitCtx): void {
  for (const [toolId, info] of state.toolIdToGlobal) {
    const output = state.toolResultContents.get(toolId)
    if (output !== undefined) {
      emitToolCompletion(info, output, ctx)
      state.parentToolUseToGlobal.delete(toolId)
      state.subToolCounters.delete(toolId)
    } else {
      state.pendingCompletions.set(toolId, info)
    }
  }
  cleanupSubToolIds(state)
  state.toolIdToGlobal.clear()
  state.toolResultContents.clear()
  state.localToGlobal = []
}

function flushPendingCompletions(state: EventHandlerState, ctx: EmitCtx): void {
  const flushed: string[] = []
  for (const [toolId, info] of state.pendingCompletions) {
    const output = state.toolResultContents.get(toolId)
    if (output === undefined) continue
    emitToolCompletion(info, output, ctx)
    state.parentToolUseToGlobal.delete(toolId)
    state.subToolCounters.delete(toolId)
    flushed.push(toolId)
  }
  for (const id of flushed) state.pendingCompletions.delete(id)
  if (flushed.length > 0) cleanupSubToolIds(state)
}

function emitTextDelta(state: EventHandlerState, globalIdx: number, text: string, ctx: EmitCtx): void {
  const prevLen = state.emittedContentLengths.get(globalIdx) ?? 0
  const delta = text.slice(prevLen)
  if (delta.length === 0) return
  const usage = { inputTokens: state.lastTurnInputTokens, outputTokens: state.cumulativeOutputTokens }
  ctx.sink.emit({
    provider: 'claude-code',
    status: 'streaming',
    message: delta,
    timestamp: ctx.now,
    session: ctx.sessionRef,
    contentBlock: { blockIndex: globalIdx, blockType: 'text', textDelta: delta },
    tokenUsage: usage,
  })
  state.emittedContentLengths.set(globalIdx, text.length)
}

function emitThinkingDelta(state: EventHandlerState, globalIdx: number, thinking: string, ctx: EmitCtx): void {
  const prevLen = state.emittedContentLengths.get(globalIdx) ?? 0
  const delta = thinking.slice(prevLen)
  if (delta.length === 0) return
  const usage = { inputTokens: state.lastTurnInputTokens, outputTokens: state.cumulativeOutputTokens }
  ctx.sink.emit({
    provider: 'claude-code',
    status: 'streaming',
    message: '',
    timestamp: ctx.now,
    session: ctx.sessionRef,
    contentBlock: { blockIndex: globalIdx, blockType: 'thinking', textDelta: delta },
    tokenUsage: usage,
  })
  state.emittedContentLengths.set(globalIdx, thinking.length)
}

function emitToolUse(state: EventHandlerState, block: StreamJsonToolUseBlock, globalIdx: number, ctx: EmitCtx): void {
  if (state.emittedContentLengths.has(globalIdx)) return
  const display = extractToolDisplayFields(block)
  const usage = { inputTokens: state.lastTurnInputTokens, outputTokens: state.cumulativeOutputTokens }
  ctx.sink.emit({
    provider: 'claude-code',
    status: 'streaming',
    message: '',
    timestamp: ctx.now,
    session: ctx.sessionRef,
    contentBlock: {
      blockIndex: globalIdx,
      blockType: 'tool_use',
      toolActivity: {
        name: block.name,
        status: 'running',
        toolUseId: block.id,
        filePath: display.filePath,
        inputSummary: display.inputSummary,
        editSummary: display.editSummary,
      },
    },
    tokenUsage: usage,
  })
  state.emittedContentLengths.set(globalIdx, 1)
  state.toolIdToGlobal.set(block.id, { name: block.name, globalIndex: globalIdx })
  if (block.name.toLowerCase() === 'agent' || block.name.toLowerCase() === 'task') {
    state.parentToolUseToGlobal.set(block.id, { name: block.name, globalIndex: globalIdx })
  }
}

function captureToolResult(state: EventHandlerState, toolUseId: string, content: unknown): void {
  if (state.toolResultContents.has(toolUseId)) return
  const raw = typeof content === 'string' ? content : JSON.stringify(content)
  if (raw) state.toolResultContents.set(toolUseId, raw)
}

function captureUserToolResults(state: EventHandlerState, event: StreamJsonEvent): void {
  const msg = (event as unknown as Record<string, unknown>).message
  if (!msg || typeof msg !== 'object') return
  const content = (msg as Record<string, unknown>).content
  if (!Array.isArray(content)) return
  for (const block of content) {
    if (typeof block !== 'object' || !block) continue
    const b = block as Record<string, unknown>
    if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
      captureToolResult(state, b.tool_use_id, b.content)
    }
  }
}

function processBlock(state: EventHandlerState, block: StreamJsonContentBlock, globalIdx: number, ctx: EmitCtx): void {
  if (block.type === 'text') {
    emitTextDelta(state, globalIdx, block.text, ctx)
  } else if (block.type === 'thinking' && block.thinking) {
    emitThinkingDelta(state, globalIdx, block.thinking, ctx)
  } else if (block.type === 'tool_use') {
    emitToolUse(state, block, globalIdx, ctx)
  } else if (block.type === 'tool_result') {
    captureToolResult(state, block.tool_use_id, block.content)
  }
}

function applyAssistantUsage(state: EventHandlerState, event: StreamJsonEvent & { type: 'assistant' }): void {
  const usage = event.message.usage
  if (!usage) return
  const turnInput = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
  if (turnInput > 0) state.lastTurnInputTokens = turnInput
  state.cumulativeOutputTokens += usage.output_tokens ?? 0
}

function handleAssistantEvent(state: EventHandlerState, event: StreamJsonEvent & { type: 'assistant' }, ctx: EmitCtx): void {
  const blocks = event.message.content
  if (isSubagentEvent(event)) {
    handleSubagentEvent(state, event, ctx)
    return
  }

  const isNew = detectNewTurn(state, blocks)
  if (isNew) {
    completeOpenTools(state, ctx)
    state.turnBoundaryPending = false
  }
  for (let i = state.localToGlobal.length; i < blocks.length; i++) state.localToGlobal.push(state.nextGlobalBlockIndex++)
  for (let i = 0; i < blocks.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- safe: i is loop index bounded by array length
    processBlock(state, blocks[i], state.localToGlobal[i], ctx)
  }
  state.prevBlockTypes = blocks.map((b) => b.type)
  applyAssistantUsage(state, event)
}

function createInitialState(): EventHandlerState {
  return {
    nextGlobalBlockIndex: 0, localToGlobal: [], emittedContentLengths: new Map(),
    toolIdToGlobal: new Map(), toolResultContents: new Map(), prevBlockTypes: [],
    lastTurnInputTokens: 0, cumulativeOutputTokens: 0, turnBoundaryPending: false,
    parentToolUseToGlobal: new Map(), subToolCounters: new Map(),
    subToolIdByToolUseId: new Map(), pendingCompletions: new Map(),
  }
}

function handleEvent(state: EventHandlerState, event: StreamJsonEvent, ctx: EmitCtx): void {
  if (event.type === 'assistant') {
    handleAssistantEvent(state, event as StreamJsonEvent & { type: 'assistant' }, ctx)
  } else if (event.type === 'user') {
    state.turnBoundaryPending = true
    captureUserToolResults(state, event)
    if (state.pendingCompletions.size > 0) flushPendingCompletions(state, ctx)
  } else if (event.type === 'result') {
    for (const [, info] of state.pendingCompletions) emitToolCompletion(info, undefined, ctx)
    state.pendingCompletions.clear()
  }
}

export function buildEventHandler(
  sink: ProviderProgressSink, sessionRef: SessionRef,
): {
  handler: (event: StreamJsonEvent) => void
  getNextGlobalBlockIndex: () => number
  getCumulativeUsage: () => { inputTokens: number; outputTokens: number }
} {
  const state = createInitialState()
  return {
    handler: (event: StreamJsonEvent) => {
      if (!sessionRef.sessionId && event.session_id) sessionRef.sessionId = event.session_id
      handleEvent(state, event, { now: Date.now(), sink, sessionRef })
    },
    getNextGlobalBlockIndex: () => state.nextGlobalBlockIndex,
    getCumulativeUsage: () => ({ inputTokens: state.lastTurnInputTokens, outputTokens: state.cumulativeOutputTokens }),
  }
}
