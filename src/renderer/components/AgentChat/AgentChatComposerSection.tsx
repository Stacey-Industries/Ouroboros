/**
 * AgentChatComposerSection.tsx — ComposerSection sub-component.
 * Extracted from AgentChatConversationBody.tsx to keep that file under 300 lines.
 *
 * Wave 25 Phase C: intercepts /research, /spec-with-research, /implement-with-research
 * before the normal send path when researchEnabled is true.
 */
import React from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import type {
  AgentChatThreadRecord,
  CodexModelOption,
  ImageAttachment,
  ModelProvider,
  Profile,
} from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import { AgentChatComposer } from './AgentChatComposer';
import {
  type ToggleState,
  useActiveProfile,
  useComposerToggleState,
  useSessionData,
} from './AgentChatComposerSection.helpers';
import { useResearchIntercept } from './AgentChatComposerSection.research';
import type { ModelContextUsage } from './AgentChatConversation';
import type { ChatOverrides } from './ChatControlsBar';
import { ComposerProfile } from './ComposerProfile';
import { McpChatToggles } from './McpChatToggles';
import type { MentionItem } from './MentionAutocomplete';
import { ResearchIndicator } from './ResearchIndicator';
import { ResearchModeToggle } from './ResearchModeToggle';
import type { SlashCommandContext } from './SlashCommandMenu';
import { ToolToggles } from './ToolToggles';
import type { PinnedFile } from './useAgentChatContext';
import type { AgentChatStreamingState } from './useAgentChatStreaming';
import { useResearchModeShortcut } from './useResearchModeShortcut';

export interface ComposerSectionProps {
  activeThread: AgentChatThreadRecord | null;
  canSend: boolean;
  hasProject: boolean;
  draft: string;
  isSending: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => Promise<void>;
  onStop?: () => Promise<void>;
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
  codexAppServerTransport?: boolean;
  threadModelUsage: ModelContextUsage[] | undefined;
  streamingTokenUsage: AgentChatStreamingState['streamingTokenUsage'];
  isStreaming?: boolean;
  routedBy?: string;
  slashCommandContext?: SlashCommandContext;
  attachments?: ImageAttachment[];
  onAttachmentsChange?: (attachments: ImageAttachment[]) => void;
  /** Wave 25 Phase C — session ID for pinning research artifacts. */
  activeSessionId?: string | null;
  /** taskId for mid-turn injection — drives lightning-bolt inject button. */
  activeMidTurnTaskId?: string | null;
  onInjectMidTurn?: (taskId: string, content: string) => Promise<void>;
  disabledLocalIds?: ReadonlySet<string>;
  setDisabledLocalIds?: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
}

function isThreadBusy(status: string | undefined): boolean {
  return status === 'submitting' || status === 'running';
}

// Research intercept hook lives in ./AgentChatComposerSection.research.ts

// ─── Composer render helper ───────────────────────────────────────────────────

type ComposerInnerProps = ComposerSectionProps & {
  wrappedOnSend: () => Promise<void>;
  isResearching: boolean;
  handleCancel: () => void;
};

function buildComposerContextProps(props: ComposerInnerProps) {
  return {
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
    attachments: props.attachments,
    onAttachmentsChange: props.onAttachmentsChange,
    activeMidTurnTaskId: props.activeMidTurnTaskId,
    onInjectMidTurn: props.onInjectMidTurn,
    disabledLocalIds: props.disabledLocalIds,
    setDisabledLocalIds: props.setDisabledLocalIds,
  };
}

function buildComposerProps(
  props: ComposerInnerProps,
): React.ComponentProps<typeof AgentChatComposer> {
  return {
    canSend: props.canSend && !props.isResearching,
    disabled: !props.hasProject,
    draft: props.draft,
    isSending: props.isSending || props.isResearching,
    threadIsBusy: isThreadBusy(props.activeThread?.status),
    messages: props.activeThread?.messages,
    onChange: props.onDraftChange,
    onStop: props.onStop,
    onSubmit: props.wrappedOnSend,
    chatOverrides: props.chatOverrides,
    onChatOverridesChange: props.onChatOverridesChange,
    settingsModel: props.settingsModel,
    codexSettingsModel: props.codexSettingsModel,
    defaultProvider: props.defaultProvider,
    modelProviders: props.modelProviders,
    codexModels: props.codexModels,
    codexAppServerTransport: props.codexAppServerTransport,
    threadModelUsage: props.threadModelUsage,
    streamingTokenUsage: props.streamingTokenUsage,
    isStreaming: props.isStreaming,
    routedBy: props.routedBy,
    slashCommandContext: props.slashCommandContext,
    ...buildComposerContextProps(props),
  };
}

function ComposerInner(props: ComposerInnerProps): React.ReactElement {
  return <AgentChatComposer {...buildComposerProps(props)} />;
}

// ─── Toggle panels sub-component ─────────────────────────────────────────────

interface TogglePanelsProps {
  sessionId: string;
  profile: Profile | null;
  toolOverrides: string[] | undefined;
  mcpServerOverrides: string[] | undefined;
  profileId: string | null;
  setProfileId: (id: string) => void;
  toggle: ToggleState;
  chatOverrides: ChatOverrides | undefined;
  onChatOverridesChange: ((o: ChatOverrides) => void) | undefined;
}

function TogglePanelExpanded(p: TogglePanelsProps): React.ReactElement | null {
  const { toggle } = p;
  if (toggle.showTools && p.sessionId) {
    return (
      <div className="border border-border-subtle rounded-md mx-2 my-0.5 bg-surface-inset">
        <ToolToggles
          sessionId={p.sessionId}
          profile={p.profile}
          toolOverrides={p.toolOverrides}
          onChange={(enabled) => {
            if (p.onChatOverridesChange && p.chatOverrides)
              p.onChatOverridesChange({ ...p.chatOverrides, toolOverrides: enabled });
          }}
        />
      </div>
    );
  }
  if (toggle.showMcp && p.sessionId) {
    return (
      <div className="border border-border-subtle rounded-md mx-2 my-0.5 bg-surface-inset">
        <McpChatToggles
          sessionId={p.sessionId}
          profile={p.profile}
          mcpServerOverrides={p.mcpServerOverrides}
          onChange={() => undefined}
        />
      </div>
    );
  }
  return null;
}

function ComposerTogglePanels(p: TogglePanelsProps): React.ReactElement {
  const { toggle } = p;
  return (
    <>
      <div className="flex items-center px-2 pt-0.5 gap-1.5">
        <ComposerProfile activeProfileId={p.profileId} onSwitch={p.setProfileId} />
        {p.sessionId && (
          <>
            <button
              type="button"
              className={`text-xs px-2 py-0.5 rounded border border-border-semantic text-text-semantic-muted${toggle.showTools ? ' bg-interactive-accent-subtle' : ''}`}
              onClick={() => {
                toggle.setShowTools((v: boolean) => !v);
                toggle.setShowMcp(false);
              }}
            >
              Tools
            </button>
            <button
              type="button"
              className={`text-xs px-2 py-0.5 rounded border border-border-semantic text-text-semantic-muted${toggle.showMcp ? ' bg-interactive-accent-subtle' : ''}`}
              onClick={() => {
                toggle.setShowMcp((v: boolean) => !v);
                toggle.setShowTools(false);
              }}
            >
              MCP
            </button>
          </>
        )}
        <ResearchModeToggle sessionId={p.sessionId || null} />
      </div>
      <TogglePanelExpanded {...p} />
    </>
  );
}

// ─── ComposerSection ──────────────────────────────────────────────────────────

function useComposerSectionState(props: ComposerSectionProps) {
  const researchEnabled = props.slashCommandContext?.researchEnabled !== false;
  const research = useResearchIntercept({
    draft: props.draft,
    activeSessionId: props.activeSessionId,
    researchEnabled,
    onDraftChange: props.onDraftChange,
    onSend: props.onSend,
  });
  const { profileId, toolOverrides, mcpServerOverrides, setProfileId } = useSessionData(
    props.activeSessionId,
    props.chatOverrides,
    props.onChatOverridesChange,
  );
  const profile = useActiveProfile(profileId);
  const toggle = useComposerToggleState(
    toolOverrides,
    props.chatOverrides,
    props.onChatOverridesChange,
  );
  return { research, profileId, toolOverrides, mcpServerOverrides, setProfileId, profile, toggle };
}

export function ComposerSection(props: ComposerSectionProps): React.ReactElement {
  useResearchModeShortcut({ sessionId: props.activeSessionId, toast: useToastContext().toast });
  const { research, profileId, toolOverrides, mcpServerOverrides, setProfileId, profile, toggle } =
    useComposerSectionState(props);
  const { isResearching, researchTopic, wrappedOnSend, handleCancel } = research;
  const sessionId = props.activeSessionId ?? '';
  return (
    <>
      {isResearching && <ResearchIndicator topic={researchTopic} onCancel={handleCancel} />}
      <ComposerTogglePanels
        sessionId={sessionId}
        profile={profile}
        toolOverrides={toolOverrides}
        mcpServerOverrides={mcpServerOverrides}
        profileId={profileId}
        setProfileId={setProfileId}
        toggle={toggle}
        chatOverrides={props.chatOverrides}
        onChatOverridesChange={props.onChatOverridesChange}
      />
      <ComposerInner
        {...props}
        wrappedOnSend={wrappedOnSend}
        isResearching={isResearching}
        handleCancel={handleCancel}
      />
    </>
  );
}
