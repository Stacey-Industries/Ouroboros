/**
 * AgentChatComposerSection.tsx — ComposerSection sub-component.
 * Extracted from AgentChatConversationBody.tsx to keep that file under 300 lines.
 *
 * Wave 25 Phase C: intercepts /research, /spec-with-research, /implement-with-research
 * before the normal send path when researchEnabled is true.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import type {
  AgentChatThreadRecord,
  CodexModelOption,
  ImageAttachment,
  ModelProvider,
  Profile,
  SessionRecord,
} from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import { AgentChatComposer } from './AgentChatComposer';
import type { ModelContextUsage } from './AgentChatConversation';
import type { ChatOverrides } from './ChatControlsBar';
import { ComposerProfile } from './ComposerProfile';
import { McpChatToggles } from './McpChatToggles';
import type { MentionItem } from './MentionAutocomplete';
import {
  buildFollowupPrompt,
  parseResearchCommand,
  runResearchAndPin,
} from './researchCommands';
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

// ─── Session data hook ────────────────────────────────────────────────────────

interface SessionData {
  profileId: string | null;
  toolOverrides: string[] | undefined;
  mcpServerOverrides: string[] | undefined;
  setProfileId: (id: string) => void;
}

function useSessionData(sessionId: string | null | undefined): SessionData {
  const [session, setSession] = useState<SessionRecord | null>(null);

  useEffect(() => {
    if (!sessionId) { setSession(null); return; }
    void window.electronAPI.sessionCrud.list()
      .then((res) => {
        if (!res.success || !res.sessions) return;
        setSession(res.sessions.find((x) => x.id === sessionId) ?? null);
      }).catch(() => undefined);
    return window.electronAPI.sessionCrud.onChanged((sessions) => {
      setSession(sessions.find((x) => x.id === sessionId) ?? null);
    });
  }, [sessionId]);

  const setProfileId = useCallback((id: string) => {
    setSession((prev) => prev ? { ...prev, profileId: id } : prev);
    if (sessionId) void window.electronAPI.sessionCrud.setProfile(sessionId, id);
  }, [sessionId]);

  return {
    profileId: session?.profileId ?? null,
    toolOverrides: session?.toolOverrides,
    mcpServerOverrides: session?.mcpServerOverrides,
    setProfileId,
  };
}

function useActiveProfile(profileId: string | null): Profile | null {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!profileId) { setProfile(null); return; }
    window.electronAPI.profileCrud.list()
      .then((res) => {
        if (!res.success || !res.profiles) return;
        setProfile(res.profiles.find((p) => p.id === profileId) ?? null);
      })
      .catch(() => undefined);
  }, [profileId]);

  return profile;
}

// ─── Toggle button style ──────────────────────────────────────────────────────

const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
  fontSize: '11px',
  padding: '2px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border-semantic)',
  background: active ? 'var(--interactive-accent-subtle)' : 'transparent',
  cursor: 'pointer',
  marginLeft: '4px',
});

const togglePanelStyle: React.CSSProperties = {
  border: '1px solid var(--border-subtle)',
  borderRadius: '6px',
  margin: '2px 8px',
  background: 'var(--surface-inset)',
};

// ─── Toggle state + sync hook ─────────────────────────────────────────────────

interface ToggleState {
  showTools: boolean; showMcp: boolean;
  setShowTools: React.Dispatch<React.SetStateAction<boolean>>;
  setShowMcp: React.Dispatch<React.SetStateAction<boolean>>;
}

function useComposerToggleState(
  toolOverrides: string[] | undefined,
  chatOverrides: ChatOverrides | undefined,
  onChatOverridesChange: ((o: ChatOverrides) => void) | undefined,
): ToggleState {
  const [showTools, setShowTools] = useState(false);
  const [showMcp, setShowMcp] = useState(false);
  useEffect(() => {
    if (!onChatOverridesChange || !chatOverrides) return;
    if (chatOverrides.toolOverrides === toolOverrides) return;
    onChatOverridesChange({ ...chatOverrides, toolOverrides });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolOverrides]);
  return { showTools, setShowTools, showMcp, setShowMcp };
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

function ComposerTogglePanels(p: TogglePanelsProps): React.ReactElement {
  const { toggle } = p;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', padding: '2px 8px 0', gap: '6px' }}>
        <ComposerProfile activeProfileId={p.profileId} onSwitch={p.setProfileId} />
        {p.sessionId && (
          <>
            <button type="button" style={toggleBtnStyle(toggle.showTools)} className="text-text-semantic-muted"
              onClick={() => { toggle.setShowTools((v) => !v); toggle.setShowMcp(false); }}>Tools</button>
            <button type="button" style={toggleBtnStyle(toggle.showMcp)} className="text-text-semantic-muted"
              onClick={() => { toggle.setShowMcp((v) => !v); toggle.setShowTools(false); }}>MCP</button>
          </>
        )}
        <ResearchModeToggle sessionId={p.sessionId || null} />
      </div>
      {toggle.showTools && p.sessionId && (
        <div style={togglePanelStyle}>
          <ToolToggles sessionId={p.sessionId} profile={p.profile} toolOverrides={p.toolOverrides}
            onChange={(enabled) => { if (p.onChatOverridesChange && p.chatOverrides) p.onChatOverridesChange({ ...p.chatOverrides, toolOverrides: enabled }); }} />
        </div>
      )}
      {toggle.showMcp && p.sessionId && (
        <div style={togglePanelStyle}>
          <McpChatToggles sessionId={p.sessionId} profile={p.profile} mcpServerOverrides={p.mcpServerOverrides} onChange={() => undefined} />
        </div>
      )}
    </>
  );
}

// ─── ComposerSection ──────────────────────────────────────────────────────────

export function ComposerSection(props: ComposerSectionProps): React.ReactElement {
  useResearchModeShortcut({ sessionId: props.activeSessionId, toast: useToastContext().toast });
  const researchEnabled = props.slashCommandContext?.researchEnabled !== false;
  const { isResearching, researchTopic, wrappedOnSend, handleCancel } = useResearchIntercept({
    draft: props.draft, activeSessionId: props.activeSessionId,
    researchEnabled, onDraftChange: props.onDraftChange, onSend: props.onSend,
  });
  const { profileId, toolOverrides, mcpServerOverrides, setProfileId } =
    useSessionData(props.activeSessionId);
  const profile = useActiveProfile(profileId);
  const toggle = useComposerToggleState(toolOverrides, props.chatOverrides, props.onChatOverridesChange);
  const sessionId = props.activeSessionId ?? '';
  return (
    <>
      {isResearching && <ResearchIndicator topic={researchTopic} onCancel={handleCancel} />}
      <ComposerTogglePanels sessionId={sessionId} profile={profile} toolOverrides={toolOverrides}
        mcpServerOverrides={mcpServerOverrides} profileId={profileId} setProfileId={setProfileId}
        toggle={toggle} chatOverrides={props.chatOverrides} onChatOverridesChange={props.onChatOverridesChange} />
      <ComposerInner {...props} wrappedOnSend={wrappedOnSend} isResearching={isResearching} handleCancel={handleCancel} />
    </>
  );
}
