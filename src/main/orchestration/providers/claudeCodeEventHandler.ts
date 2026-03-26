/**
 * claudeCodeEventHandler.ts — Stream-JSON event handler for ClaudeCodeAdapter.
 *
 * Claude Code emits full message snapshots (not per-block deltas), so this
 * handler diffs each event against prior state to compute per-block deltas
 * with stable global block indices across multi-turn conversations.
 */
import { extractToolDisplayFields } from './claudeCodeContextBuilder'
import type { createProviderSessionReference, ProviderProgressSink } from './providerAdapter'
import type { StreamJsonContentBlock, StreamJsonEvent, StreamJsonToolUseBlock } from './streamJsonTypes'

type SessionRef = ReturnType<typeof createProviderSessionReference>

interface EventHandlerState {
  nextGlobalBlockIndex: number
  localToGlobal: number[]
  emittedContentLengths: Map<number, number>
  toolIdToGlobal: Map<string, { name: string; globalIndex: number }>
  prevBlockTypes: string[]
  lastTurnInputTokens: number
  cumulativeOutputTokens: number
}

interface EmitCtx {
  now: number
  sink: ProviderProgressSink
  sessionRef: SessionRef
}

function detectNewTurn(blocks: StreamJsonContentBlock[], prevBlockTypes: string[]): boolean {
  if (prevBlockTypes.length === 0) return false
  if (blocks.length < prevBlockTypes.length) return true
  for (let i = 0; i < Math.min(blocks.length, prevBlockTypes.length); i++) {
    // eslint-disable-next-line security/detect-object-injection -- safe: i is loop index bounded by array length
    if (blocks[i].type !== prevBlockTypes[i]) return true
  }
  return false
}

function completeOpenTools(state: EventHandlerState, ctx: EmitCtx): void {
  const usage = { inputTokens: state.lastTurnInputTokens, outputTokens: state.cumulativeOutputTokens }
  for (const [, info] of state.toolIdToGlobal) {
    ctx.sink.emit({
      provider: 'claude-code',
      status: 'streaming',
      message: '',
      timestamp: ctx.now,
      session: ctx.sessionRef,
      contentBlock: { blockIndex: info.globalIndex, blockType: 'tool_use', toolActivity: { name: info.name, status: 'complete' } },
      tokenUsage: usage,
    })
  }
  state.toolIdToGlobal.clear()
  state.localToGlobal = []
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
}

function processBlock(state: EventHandlerState, block: StreamJsonContentBlock, globalIdx: number, ctx: EmitCtx): void {
  if (block.type === 'text') {
    emitTextDelta(state, globalIdx, block.text, ctx)
  } else if (block.type === 'thinking' && block.thinking) {
    emitThinkingDelta(state, globalIdx, block.thinking, ctx)
  } else if (block.type === 'tool_use') {
    emitToolUse(state, block, globalIdx, ctx)
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
  if (detectNewTurn(blocks, state.prevBlockTypes)) completeOpenTools(state, ctx)
  for (let i = state.localToGlobal.length; i < blocks.length; i++) state.localToGlobal.push(state.nextGlobalBlockIndex++)
  for (let i = 0; i < blocks.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- safe: i is loop index bounded by array length
    processBlock(state, blocks[i], state.localToGlobal[i], ctx)
  }
  state.prevBlockTypes = blocks.map((b) => b.type)
  applyAssistantUsage(state, event)
}

export function buildEventHandler(
  sink: ProviderProgressSink,
  sessionRef: SessionRef,
): {
  handler: (event: StreamJsonEvent) => void
  getNextGlobalBlockIndex: () => number
  getCumulativeUsage: () => { inputTokens: number; outputTokens: number }
} {
  const state: EventHandlerState = {
    nextGlobalBlockIndex: 0,
    localToGlobal: [],
    emittedContentLengths: new Map(),
    toolIdToGlobal: new Map(),
    prevBlockTypes: [],
    lastTurnInputTokens: 0,
    cumulativeOutputTokens: 0,
  }

  const handler = (event: StreamJsonEvent): void => {
    // Capture session ID BEFORE processing so that sink.emit() inside
    // handleAssistantEvent carries the ID to syncProviderSessionId.
    if (!sessionRef.sessionId && event.session_id) sessionRef.sessionId = event.session_id
    if (event.type === 'assistant') {
      handleAssistantEvent(state, event as StreamJsonEvent & { type: 'assistant' }, { now: Date.now(), sink, sessionRef })
    }
  }

  return {
    handler,
    getNextGlobalBlockIndex: () => state.nextGlobalBlockIndex,
    getCumulativeUsage: () => ({ inputTokens: state.lastTurnInputTokens, outputTokens: state.cumulativeOutputTokens }),
  }
}
