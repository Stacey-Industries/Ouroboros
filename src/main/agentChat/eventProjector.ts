import type { TaskSessionRecord } from '../orchestration/types'
import { type AgentChatThreadStore } from './threadStore'
import {
  buildAgentChatOrchestrationLink,
  mapOrchestrationStatusToAgentChatStatus,
} from './chatOrchestrationBridgeSupport'
import {
  buildProjectedMessages,
  linksEqual,
  messagePatchFromRecord,
  toComparableMessage,
} from './eventProjectorSupport'
import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types'

export interface AgentChatSessionProjectionResult {
  changed: boolean
  changedMessages: AgentChatMessageRecord[]
  latestMessageId?: string
  thread: AgentChatThreadRecord
}

async function upsertProjectedMessage(args: {
  message: AgentChatMessageRecord
  thread: AgentChatThreadRecord
  threadStore: AgentChatThreadStore
}): Promise<{
  changed: boolean
  message: AgentChatMessageRecord
  thread: AgentChatThreadRecord
}> {
  const existing = args.thread.messages.find((entry) => entry.id === args.message.id)
  if (existing) {
    const nextMessage = {
      ...args.message,
      createdAt: existing.createdAt,
      // The streaming bridge owns assistant message content — it accumulates
      // real response text from stream-json deltas. The projector only derives
      // content from session metadata (e.g. providerArtifact.lastMessage) which
      // is a status string, not the actual response. Preserve existing content
      // so a late projector run never overwrites what the bridge already wrote.
      content: existing.role === 'assistant' && existing.content && existing.content !== '(No response)'
        ? existing.content
        : args.message.content,
    }
    if (JSON.stringify(toComparableMessage(existing)) === JSON.stringify(toComparableMessage(nextMessage))) {
      return {
        changed: false,
        message: existing,
        thread: args.thread,
      }
    }

    const thread = await args.threadStore.updateMessage(
      args.thread.id,
      existing.id,
      messagePatchFromRecord(nextMessage),
    )
    return {
      changed: true,
      message: thread.messages.find((entry) => entry.id === existing.id) ?? nextMessage,
      thread,
    }
  }

  const thread = await args.threadStore.appendMessage(args.thread.id, args.message)
  return {
    changed: true,
    message: thread.messages.find((entry) => entry.id === args.message.id) ?? args.message,
    thread,
  }
}

async function syncThreadMetadata(args: {
  session: TaskSessionRecord
  thread: AgentChatThreadRecord
  threadStore: AgentChatThreadStore
}): Promise<{ changed: boolean; thread: AgentChatThreadRecord }> {
  const link = buildAgentChatOrchestrationLink(args.session)
  const nextStatus = mapOrchestrationStatusToAgentChatStatus(args.session.status)

  // Preserve sticky fields from the existing thread when the session
  // update doesn't carry them yet.  Early session updates (beginProviderPhase)
  // fire before the adapter has set these on providerSession.
  if (link) {
    const existing = args.thread.latestOrchestration
    if (!link.provider && existing?.provider) {
      link.provider = existing.provider
    }
    if (!link.linkedTerminalId && existing?.linkedTerminalId) {
      link.linkedTerminalId = existing.linkedTerminalId
    }
    if (!link.claudeSessionId && existing?.claudeSessionId) {
      link.claudeSessionId = existing.claudeSessionId
    }
    if (!link.codexThreadId && existing?.codexThreadId) {
      link.codexThreadId = existing.codexThreadId
    }
    if (!link.model && existing?.model) {
      link.model = existing.model
    }
  }

  if (args.thread.status === nextStatus && linksEqual(args.thread.latestOrchestration, link)) {
    return { changed: false, thread: args.thread }
  }

  return {
    changed: true,
    thread: await args.threadStore.updateThread(args.thread.id, {
      status: nextStatus,
      latestOrchestration: link,
    }),
  }
}

async function projectMessagesToThread(args: {
  messages: AgentChatMessageRecord[]
  thread: AgentChatThreadRecord
  threadStore: AgentChatThreadStore
}): Promise<{
  changed: boolean
  changedMessages: AgentChatMessageRecord[]
  thread: AgentChatThreadRecord
}> {
  let thread = args.thread
  const changedMessages: AgentChatMessageRecord[] = []

  for (const message of args.messages) {
    const result = await upsertProjectedMessage({
      message,
      thread,
      threadStore: args.threadStore,
    })
    thread = result.thread
    if (result.changed) {
      changedMessages.push(result.message)
    }
  }

  return {
    changed: changedMessages.length > 0,
    changedMessages,
    thread,
  }
}

export async function projectAgentChatSession(args: {
  session: TaskSessionRecord
  thread: AgentChatThreadRecord
  threadStore: AgentChatThreadStore
}): Promise<AgentChatSessionProjectionResult> {
  const metadata = await syncThreadMetadata(args)
  const messages = await projectMessagesToThread({
    messages: buildProjectedMessages(args.session, metadata.thread.id),
    thread: metadata.thread,
    threadStore: args.threadStore,
  })

  // Auto-title: update thread title from first assistant response
  let { thread } = messages
  const firstAssistantChanged = messages.changedMessages.find(
    (m) => m.role === 'assistant' && m.content.trim(),
  )
  if (firstAssistantChanged) {
    const updated = await args.threadStore.updateTitleFromResponse(
      thread.id,
      firstAssistantChanged.content,
    )
    if (updated) {
      thread = updated
    }
  }

  return {
    changed: metadata.changed || messages.changed,
    changedMessages: messages.changedMessages,
    latestMessageId: messages.changedMessages.at(-1)?.id ?? thread.messages.at(-1)?.id,
    thread,
  }
}
