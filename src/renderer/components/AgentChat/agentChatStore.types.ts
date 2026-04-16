/**
 * Zustand store types for AgentChat state distribution.
 *
 * Slices mirror the builder-function boundaries in AgentChatWorkspace.tsx:
 * thread, details, context-files, model, queue, handlers.
 * Actions are separated because zustand action references are stable —
 * selecting only actions never triggers re-renders.
 */

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
}

/* ── Model / provider settings ────────────────────── */

export interface AgentChatModelState {
  chatOverrides: ChatOverrides;
  settingsModel: string;
  codexSettingsModel: string;
  defaultProvider: 'claude-code' | 'codex' | 'anthropic-api';
  modelProviders: ModelProvider[];
  codexModels: CodexModelOption[];
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
  onOpenLinkedDetails: (
    link?: AgentChatOrchestrationLink,
  ) => Promise<void>;
  onOpenLinkedTask: () => void;
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
  onSelectThread: (threadId: string) => void;
  onEditQueuedMessage: (id: string) => void;
  onDeleteQueuedMessage: (id: string) => void;
  onSendQueuedMessageNow: (id: string) => Promise<void>;
}

/* ── Full store ───────────────────────────────────── */

export type AgentChatStore = AgentChatActions &
  AgentChatContextFilesState &
  AgentChatDetailsState &
  AgentChatModelState &
  AgentChatQueueState &
  AgentChatSlashState &
  AgentChatThreadState;
