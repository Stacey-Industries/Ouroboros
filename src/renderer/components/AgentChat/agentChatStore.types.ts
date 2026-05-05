/**
 * Zustand store types for AgentChat state distribution.
 *
 * Slices mirror the builder-function boundaries in AgentChatWorkspace.tsx:
 * thread, details, context-files, model, queue, handlers.
 * Actions are separated because zustand action references are stable —
 * selecting only actions never triggers re-renders.
 */

import type * as React from 'react';

import type {
  AgentChatLinkedDetailsResult,
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
  CodexModelOption,
  ImageAttachment,
  ModelProvider,
} from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import type { ChatOverrides } from './ChatControlsBar';
import type { MentionItem } from './MentionAutocomplete';
import type { SlashCommandContext } from './SlashCommandMenu';
import type { PinnedFile } from './useAgentChatContext';
import type { QueuedMessage } from './useAgentChatWorkspace';

/* ── Thread state ─────────────────────────────────── */

export interface AgentChatThreadState {
  activeThread: AgentChatThreadRecord | null;
  /** All threads for the current workspace — used for branch indicators. */
  threads: AgentChatThreadRecord[];
  canSend: boolean;
  draft: string;
  error: string | null;
  hasProject: boolean;
  isLoading: boolean;
  isSending: boolean;
  pendingUserMessage: string | null;
  /**
   * Wave 82.1 — the active project root for this workspace. Mirrors the
   * `projectRoot` prop passed to AgentChatWorkspace. ComposerContextPreview
   * reads from here instead of ProjectContext, because in chat-only workbench
   * mode the workbench's active project (LayoutState.activeProject) is
   * decoupled from ProjectContext.projectRoot (which is projectRoots[0] of
   * the multi-root list and never updates on rail switch).
   */
  projectRoot: string | null;
}

/**
 * Slim variant of AgentChatThreadState that excludes draft/canSend. Components
 * that render message lists (AgentChatConversation, ConversationBody) must use
 * this selector to avoid re-rendering on every keystroke — draft churn would
 * otherwise force the entire conversation tree to reconcile per character.
 */
export interface AgentChatThreadViewState {
  activeThread: AgentChatThreadRecord | null;
  threads: AgentChatThreadRecord[];
  error: string | null;
  hasProject: boolean;
  isLoading: boolean;
  isSending: boolean;
  pendingUserMessage: string | null;
}

/* ── Details drawer state ─────────────────────────── */

export interface AgentChatDetailsState {
  isDetailsOpen: boolean;
  details: AgentChatLinkedDetailsResult | null;
  detailsError: string | null;
  detailsIsLoading: boolean;
}

/* ── Context files / mentions / autocomplete ──────── */

export interface AgentChatContextFilesState {
  pinnedFiles: PinnedFile[];
  contextSummary: string | null;
  autocompleteResults: FileEntry[];
  isAutocompleteOpen: boolean;
  mentions: MentionItem[];
  allFiles: FileEntry[];
  attachments: ImageAttachment[];
  /** Wave 71 — popover-local toggles (file:<path>, mention:<i>:<label>) */
  disabledLocalIds: ReadonlySet<string>;
}

/* ── Model / provider settings ────────────────────── */

export interface AgentChatModelState {
  chatOverrides: ChatOverrides;
  settingsModel: string;
  codexSettingsModel: string;
  defaultProvider: 'claude-code' | 'codex' | 'anthropic-api';
  modelProviders: ModelProvider[];
  codexModels: CodexModelOption[];
  codexAppServerTransport: boolean;
}

/* ── Message queue ────────────────────────────────── */

export interface AgentChatQueueState {
  queuedMessages: QueuedMessage[];
}

/* ── Slash command context (read-only) ────────────── */

export interface AgentChatSlashState {
  slashCommandContext: SlashCommandContext | null;
  /** Wave 25 Phase C — active session ID for research pin; null when no session is active. */
  activeSessionId: string | null;
}

/* ── Actions (stable references — never cause re-renders) */

export interface AgentChatActions {
  onDraftChange: (value: string) => void;
  onEdit: (message: AgentChatMessageRecord) => void;
  onRetry: (message: AgentChatMessageRecord) => void;
  onBranch: (message: AgentChatMessageRecord) => void;
  onRevert: (message: AgentChatMessageRecord) => void;
  /** Wave 22 Phase F — called when a re-run branch succeeds; navigates to the new thread. */
  onRerunSuccess: (newThreadId: string) => void;
  onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  onOpenLinkedTask: () => void;
  reloadThreads: () => Promise<void>;
  onSend: () => Promise<void>;
  onStop: () => Promise<void>;
  closeDetails: () => void;
  onRemoveFile: (path: string) => void;
  onAutocompleteQuery: (query: string) => void;
  onSelectFile: (file: FileEntry) => void;
  onCloseAutocomplete: () => void;
  onOpenAutocomplete: () => void;
  onAddMention: (mention: MentionItem) => void;
  onRemoveMention: (key: string) => void;
  onAttachmentsChange: (attachments: ImageAttachment[]) => void;
  onChatOverridesChange: (overrides: ChatOverrides) => void;
  onSelectThread: (threadId: string | null) => void;
  onEditQueuedMessage: (id: string) => void;
  onDeleteQueuedMessage: (id: string) => void;
  onSendQueuedMessageNow: (id: string) => Promise<void>;
  /** Wave 71 — controlled setter for the popover-local disabled set. */
  setDisabledLocalIds: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  /**
   * Wave 82.1 — optional surface so consumers can route deletes through the
   * workspace's canonical action when wired (avoids row-flash). Undefined when
   * the store mount is legacy (chat-only sidebar in IDE shell); fall through
   * to `window.electronAPI.agentChat.deleteThread`.
   */
  deleteThread?: (threadId: string) => Promise<void>;
}

/* ── Full store ───────────────────────────────────── */

export type AgentChatStore = AgentChatActions &
  AgentChatContextFilesState &
  AgentChatDetailsState &
  AgentChatModelState &
  AgentChatQueueState &
  AgentChatSlashState &
  AgentChatThreadState;
