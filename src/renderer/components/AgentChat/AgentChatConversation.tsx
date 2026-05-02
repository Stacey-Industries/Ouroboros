import type { SkillExecutionRecord } from '@shared/types/ruleActivity';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useAgentEventsContext } from '../../contexts/AgentEventsContext';
import type { Profile } from '../../types/electron';
import { useAgentMonitorSettings } from '../AgentMonitor/useAgentMonitorSettings';
import { AgentChatApprovalBanner } from './AgentChatApprovalBanner';
import { ComposerSection, ConversationBody } from './AgentChatConversationBody';
import { AgentChatDetailsDrawer } from './AgentChatDetailsDrawer';
import { QueuedMessageBanner } from './AgentChatMessageComponents';
import {
  useAgentChatActions,
  useAgentChatContextFiles,
  useAgentChatDetails,
  useAgentChatModel,
  useAgentChatQueue,
  useAgentChatSlash,
  useAgentChatThread,
} from './agentChatSelectors';
import { buildThreadModelUsage } from './ChatControlsBarSupport';
import type { ProfileSwitchedDetail } from './ComposerProfile';
import { PROFILE_SWITCHED_EVENT } from './ComposerProfile';
import { InlineEventCard } from './InlineEventCard';
import { buildInlineEvents } from './inlineEventsSupport';
import { ProfileDiffCard } from './ProfileDiffCard';
import { useAgentChatStreaming } from './useAgentChatStreaming';

/** Per-model context usage entry. */
export interface ModelContextUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

function useThreadModelUsage(
  thread: ReturnType<typeof useAgentChatThread>['activeThread'],
): ModelContextUsage[] | undefined {
  return useMemo(() => buildThreadModelUsage(thread?.messages), [thread?.messages]);
}

function useActiveSkillExecutions(sessionId?: string): SkillExecutionRecord[] {
  const { agents } = useAgentEventsContext();
  return useMemo(() => {
    if (!sessionId) return [];
    return agents.find((s) => s.id === sessionId)?.skillExecutions ?? [];
  }, [agents, sessionId]);
}

/* ── Conversation sub-sections (extracted for max-lines-per-function) ──── */

function ConversationDrawer(): React.ReactElement | null {
  const thread = useAgentChatThread();
  const details = useAgentChatDetails();
  const actions = useAgentChatActions();
  const sessionId =
    details.details?.link?.sessionId ?? thread.activeThread?.latestOrchestration?.sessionId;
  const skillExecutions = useActiveSkillExecutions(sessionId);

  return (
    <AgentChatDetailsDrawer
      activeLink={details.details?.link ?? thread.activeThread?.latestOrchestration}
      details={details.details}
      error={details.detailsError}
      isLoading={details.detailsIsLoading}
      isOpen={details.isDetailsOpen}
      onClose={actions.closeDetails}
      onOpenOrchestration={actions.onOpenLinkedTask}
      skillExecutions={skillExecutions}
    />
  );
}

function ConversationQueue(): React.ReactElement | null {
  const { queuedMessages } = useAgentChatQueue();
  const actions = useAgentChatActions();
  if (!queuedMessages?.length) return null;
  return (
    <QueuedMessageBanner
      messages={queuedMessages}
      onEdit={actions.onEditQueuedMessage}
      onDelete={actions.onDeleteQueuedMessage}
      onSendNow={actions.onSendQueuedMessageNow}
    />
  );
}

/* ── Composer wrapper (extracted for max-lines-per-function) ──────────────── */

function useMidTurnInject(): (tid: string, content: string) => Promise<void> {
  return useCallback(async (tid: string, content: string) => {
    const result = await window.electronAPI.agentChat.injectMidTurn(tid, content);
    if (!result.success) {
      console.error('[mid-turn] inject failed:', result.error);
    }
  }, []);
}

function useConversationComposerProps(streaming: ReturnType<typeof useAgentChatStreaming>) {
  const thread = useAgentChatThread();
  const ctx = useAgentChatContextFiles();
  const model = useAgentChatModel();
  const slash = useAgentChatSlash();
  const actions = useAgentChatActions();
  const threadModelUsage = useThreadModelUsage(thread.activeThread);
  const onInjectMidTurn = useMidTurnInject();
  const taskId = thread.activeThread?.latestOrchestration?.taskId ?? null;
  const activeMidTurnTaskId = streaming.isStreaming ? taskId : null;
  return {
    ...thread,
    ...ctx,
    ...model,
    ...actions,
    activeThread: thread.activeThread,
    threadModelUsage,
    streamingTokenUsage: streaming.streamingTokenUsage,
    isStreaming: streaming.isStreaming,
    routedBy: thread.activeThread?.latestOrchestration?.routedBy,
    slashCommandContext: slash.slashCommandContext ?? undefined,
    activeSessionId: slash.activeSessionId,
    activeMidTurnTaskId,
    onInjectMidTurn,
  };
}

function ConversationComposer({
  streaming,
}: {
  streaming: ReturnType<typeof useAgentChatStreaming>;
}): React.ReactElement {
  return <ComposerSection {...useConversationComposerProps(streaming)} />;
}

/* ── Profile diff banner (shown above composer after a mid-thread switch) ─── */

interface ProfileDiffState {
  oldProfile: Profile;
  newProfile: Profile;
}

function useProfileDiffBanner(): {
  diff: ProfileDiffState | null;
  dismiss: () => void;
} {
  const [diff, setDiff] = useState<ProfileDiffState | null>(null);

  useEffect(() => {
    async function handleSwitch(e: Event): Promise<void> {
      const { oldProfileId, newProfileId } = (e as CustomEvent<ProfileSwitchedDetail>).detail;
      if (!oldProfileId) return;
      const res = await window.electronAPI.profileCrud.list();
      if (!res.success || !res.profiles) return;
      const oldP = res.profiles.find((p) => p.id === oldProfileId);
      const newP = res.profiles.find((p) => p.id === newProfileId);
      if (oldP && newP) setDiff({ oldProfile: oldP, newProfile: newP });
    }
    window.addEventListener(PROFILE_SWITCHED_EVENT, (e) => void handleSwitch(e));
    return () => window.removeEventListener(PROFILE_SWITCHED_EVENT, (e) => void handleSwitch(e));
  }, []);

  return { diff, dismiss: () => setDiff(null) };
}

function ProfileDiffBanner(): React.ReactElement | null {
  const { diff, dismiss } = useProfileDiffBanner();
  if (!diff) return null;
  return (
    <ProfileDiffCard
      oldProfile={diff.oldProfile}
      newProfile={diff.newProfile}
      onDismiss={dismiss}
    />
  );
}

/* ── Inline event strip (shown above composer when inlineEventTypes is set) ── */

const MAX_INLINE_EVENTS = 5;

function InlineEventStrip(): React.ReactElement | null {
  const { agents } = useAgentEventsContext();
  const { inlineEventTypes } = useAgentMonitorSettings();
  const events = useMemo(
    () => buildInlineEvents(agents, inlineEventTypes).slice(-MAX_INLINE_EVENTS),
    [agents, inlineEventTypes],
  );
  if (events.length === 0) return null;
  return (
    <div
      className="flex-shrink-0 flex flex-col gap-0.5 py-1 border-t border-border-subtle"
      aria-label="Recent agent events"
    >
      {events.map((event) => (
        <InlineEventCard key={event.id} event={event} />
      ))}
    </div>
  );
}

/* ── Main conversation component ─────────────────────────────────────────── */

export function AgentChatConversation(): React.ReactElement {
  const thread = useAgentChatThread();
  const actions = useAgentChatActions();
  const streaming = useAgentChatStreaming(thread.activeThread?.id ?? null);
  const approvalSessionIds = [
    thread.activeThread?.latestOrchestration?.sessionId,
    thread.activeThread?.latestOrchestration?.claudeSessionId,
    thread.activeThread?.latestOrchestration?.codexThreadId,
  ];

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-surface-panel">
      <ConversationBody
        activeThread={thread.activeThread}
        streaming={streaming}
        error={thread.error}
        hasProject={thread.hasProject}
        isSending={thread.isSending}
        isLoading={thread.isLoading}
        onEdit={actions.onEdit}
        onRetry={actions.onRetry}
        onBranch={actions.onBranch}
        onRevert={actions.onRevert}
        onOpenLinkedDetails={actions.onOpenLinkedDetails}
        onStop={actions.onStop}
        pendingUserMessage={thread.pendingUserMessage}
        onSelectThread={actions.onSelectThread}
        onDraftChange={actions.onDraftChange}
        onRerunSuccess={actions.onRerunSuccess}
        inlineBanner={<AgentChatApprovalBanner sessionIds={approvalSessionIds} />}
      />
      <InlineEventStrip />
      <ProfileDiffBanner />
      <ConversationQueue />
      <ConversationComposer streaming={streaming} />
      <ConversationDrawer />
    </div>
  );
}
