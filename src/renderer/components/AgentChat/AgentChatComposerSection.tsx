/**
 * AgentChatComposerSection.tsx — ComposerSection sub-component.
 * Extracted from AgentChatConversationBody.tsx to keep that file under 300 lines.
 */
import React from 'react';

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
}

function isThreadBusy(status: string | undefined): boolean {
  return status === 'submitting' || status === 'running';
}

export function ComposerSection(props: ComposerSectionProps): React.ReactElement {
  return (
    <AgentChatComposer
      canSend={props.canSend}
      disabled={!props.hasProject}
      draft={props.draft}
      isSending={props.isSending}
      threadIsBusy={isThreadBusy(props.activeThread?.status)}
      messages={props.activeThread?.messages}
      onChange={props.onDraftChange}
      onSubmit={props.onSend}
      pinnedFiles={props.pinnedFiles}
      onRemoveFile={props.onRemoveFile}
      contextSummary={props.contextSummary}
      autocompleteResults={props.autocompleteResults}
      isAutocompleteOpen={props.isAutocompleteOpen}
      onAutocompleteQuery={props.onAutocompleteQuery}
      onSelectFile={props.onSelectFile}
      onCloseAutocomplete={props.onCloseAutocomplete}
      onOpenAutocomplete={props.onOpenAutocomplete}
      mentions={props.mentions}
      onAddMention={props.onAddMention}
      onRemoveMention={props.onRemoveMention}
      allFiles={props.allFiles}
      chatOverrides={props.chatOverrides}
      onChatOverridesChange={props.onChatOverridesChange}
      settingsModel={props.settingsModel}
      codexSettingsModel={props.codexSettingsModel}
      defaultProvider={props.defaultProvider}
      modelProviders={props.modelProviders}
      codexModels={props.codexModels}
      threadModelUsage={props.threadModelUsage}
      streamingTokenUsage={props.streamingTokenUsage}
      isStreaming={props.isStreaming} routedBy={props.routedBy}
      slashCommandContext={props.slashCommandContext}
      attachments={props.attachments}
      onAttachmentsChange={props.onAttachmentsChange}
    />
  );
}
