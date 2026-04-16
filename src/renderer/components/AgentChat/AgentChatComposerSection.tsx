/**
 * AgentChatComposerSection.tsx — ComposerSection sub-component.
 * Extracted from AgentChatConversationBody.tsx to keep that file under 300 lines.
 *
 * Wave 25 Phase C: intercepts /research, /spec-with-research, /implement-with-research
 * before the normal send path when researchEnabled is true.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

import type {
  AgentChatThreadRecord,
  CodexModelOption,
  ImageAttachment,
  ModelProvider,
} from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import { AgentChatComposer } from './AgentChatComposer';
import type { ModelContextUsage } from './AgentChatConversation';
import type { ChatOverrides } from './ChatControlsBar';
import type { MentionItem } from './MentionAutocomplete';
import {
  buildFollowupPrompt,
  parseResearchCommand,
  runResearchAndPin,
} from './researchCommands';
import { ResearchIndicator } from './ResearchIndicator';
import type { SlashCommandContext } from './SlashCommandMenu';
import type { PinnedFile } from './useAgentChatContext';
import type { AgentChatStreamingState } from './useAgentChatStreaming';

export interface ComposerSectionProps {
  activeThread: AgentChatThreadRecord | null;
  canSend: boolean;
  hasProject: boolean;
  draft: string;
  isSending: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => Promise<void>;
  pinnedFiles?: PinnedFile[];
  onRemoveFile?: (path: string) => void;
  contextSummary?: string | null;
  autocompleteResults?: FileEntry[];
  isAutocompleteOpen?: boolean;
  onAutocompleteQuery?: (query: string) => void;
  onSelectFile?: (file: FileEntry) => void;
  onCloseAutocomplete?: () => void;
  onOpenAutocomplete?: () => void;
  mentions?: MentionItem[];
  onAddMention?: (mention: MentionItem) => void;
  onRemoveMention?: (key: string) => void;
  allFiles?: FileEntry[];
  chatOverrides?: ChatOverrides;
  onChatOverridesChange?: (overrides: ChatOverrides) => void;
  settingsModel?: string;
  codexSettingsModel?: string;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  modelProviders?: ModelProvider[];
  codexModels?: CodexModelOption[];
  threadModelUsage: ModelContextUsage[] | undefined;
  streamingTokenUsage: AgentChatStreamingState['streamingTokenUsage'];
  isStreaming?: boolean;
  routedBy?: string;
  slashCommandContext?: SlashCommandContext;
  attachments?: ImageAttachment[];
  onAttachmentsChange?: (attachments: ImageAttachment[]) => void;
  /** Wave 25 Phase C — session ID for pinning research artifacts. */
  activeSessionId?: string | null;
}

function isThreadBusy(status: string | undefined): boolean {
  return status === 'submitting' || status === 'running';
}

// ─── Research intercept hook ──────────────────────────────────────────────────

interface ResearchInterceptOpts {
  draft: string;
  activeSessionId: string | null | undefined;
  researchEnabled: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => Promise<void>;
}

interface ResearchInterceptResult {
  isResearching: boolean;
  researchTopic: string;
  wrappedOnSend: () => Promise<void>;
  handleCancel: () => void;
}

function useResearchIntercept(opts: ResearchInterceptOpts): ResearchInterceptResult {
  const { draft, activeSessionId, researchEnabled, onDraftChange, onSend } = opts;
  const [isResearching, setIsResearching] = useState(false);
  const [researchTopic, setResearchTopic] = useState('');
  const cancelledRef = useRef(false);

  // Listen for DOM cancel event (fired by ResearchIndicator cancel button).
  useEffect(() => {
    function onCancelEvent(): void { cancelledRef.current = true; setIsResearching(false); }
    window.addEventListener('agent-ide:cancel-research', onCancelEvent);
    return () => window.removeEventListener('agent-ide:cancel-research', onCancelEvent);
  }, []);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setIsResearching(false);
    setResearchTopic('');
  }, []);

  const wrappedOnSend = useCallback(async () => {
    const parsed = researchEnabled ? parseResearchCommand(draft) : null;
    if (!parsed || !activeSessionId) { return onSend(); }
    cancelledRef.current = false;
    setIsResearching(true);
    setResearchTopic(parsed.topic);
    onDraftChange('');
    await runResearchAndPin({ sessionId: activeSessionId, topic: parsed.topic });
    if (cancelledRef.current) { setResearchTopic(''); return; }
    setIsResearching(false);
    setResearchTopic('');
    const followup = buildFollowupPrompt(parsed.cmd, parsed.topic);
    if (followup) { onDraftChange(followup); await onSend(); }
  }, [draft, activeSessionId, researchEnabled, onDraftChange, onSend]);

  return { isResearching, researchTopic, wrappedOnSend, handleCancel };
}

// ─── Composer render helper ───────────────────────────────────────────────────

type ComposerInnerProps = ComposerSectionProps & {
  wrappedOnSend: () => Promise<void>;
  isResearching: boolean;
  handleCancel: () => void;
};

function buildComposerProps(props: ComposerInnerProps): React.ComponentProps<typeof AgentChatComposer> {
  return {
    canSend: props.canSend && !props.isResearching,
    disabled: !props.hasProject,
    draft: props.draft,
    isSending: props.isSending || props.isResearching,
    threadIsBusy: isThreadBusy(props.activeThread?.status),
    messages: props.activeThread?.messages,
    onChange: props.onDraftChange,
    onSubmit: props.wrappedOnSend,
    pinnedFiles: props.pinnedFiles,
    onRemoveFile: props.onRemoveFile,
    contextSummary: props.contextSummary,
    autocompleteResults: props.autocompleteResults,
    isAutocompleteOpen: props.isAutocompleteOpen,
    onAutocompleteQuery: props.onAutocompleteQuery,
    onSelectFile: props.onSelectFile,
    onCloseAutocomplete: props.onCloseAutocomplete,
    onOpenAutocomplete: props.onOpenAutocomplete,
    mentions: props.mentions,
    onAddMention: props.onAddMention,
    onRemoveMention: props.onRemoveMention,
    allFiles: props.allFiles,
    chatOverrides: props.chatOverrides,
    onChatOverridesChange: props.onChatOverridesChange,
    settingsModel: props.settingsModel,
    codexSettingsModel: props.codexSettingsModel,
    defaultProvider: props.defaultProvider,
    modelProviders: props.modelProviders,
    codexModels: props.codexModels,
    threadModelUsage: props.threadModelUsage,
    streamingTokenUsage: props.streamingTokenUsage,
    isStreaming: props.isStreaming,
    routedBy: props.routedBy,
    slashCommandContext: props.slashCommandContext,
    attachments: props.attachments,
    onAttachmentsChange: props.onAttachmentsChange,
  };
}

function ComposerInner(props: ComposerInnerProps): React.ReactElement {
  return <AgentChatComposer {...buildComposerProps(props)} />;
}

// ─── ComposerSection ──────────────────────────────────────────────────────────

export function ComposerSection(props: ComposerSectionProps): React.ReactElement {
  const researchEnabled = props.slashCommandContext?.researchEnabled !== false;
  const { isResearching, researchTopic, wrappedOnSend, handleCancel } = useResearchIntercept({
    draft: props.draft,
    activeSessionId: props.activeSessionId,
    researchEnabled,
    onDraftChange: props.onDraftChange,
    onSend: props.onSend,
  });
  return (
    <>
      {isResearching && (
        <ResearchIndicator topic={researchTopic} onCancel={handleCancel} />
      )}
      <ComposerInner
        {...props}
        wrappedOnSend={wrappedOnSend}
        isResearching={isResearching}
        handleCancel={handleCancel}
      />
    </>
  );
}
