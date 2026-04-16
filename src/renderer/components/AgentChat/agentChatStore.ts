/**
 * agentChatStore.ts — Per-workspace zustand store for AgentChat.
 *
 * Uses createStore (NOT create) for per-workspace scoping.
 * One store instance is created per AgentChatWorkspace mount and
 * distributed via AgentChatStoreContext — never a global singleton.
 */
import { createContext, useContext } from 'react';
import type { StoreApi } from 'zustand';
import { createStore, useStore } from 'zustand';

import type {
  AgentChatActions,
  AgentChatContextFilesState,
  AgentChatDetailsState,
  AgentChatModelState,
  AgentChatQueueState,
  AgentChatSlashState,
  AgentChatStore,
  AgentChatThreadState,
} from './agentChatStore.types';

/* ── Default slices ───────────────────────────────── */

const DEFAULT_THREAD: AgentChatThreadState = {
  activeThread: null,
  threads: [],
  canSend: false,
  draft: '',
  error: null,
  hasProject: false,
  isLoading: false,
  isSending: false,
  pendingUserMessage: null,
};

const DEFAULT_DETAILS: AgentChatDetailsState = {
  isDetailsOpen: false,
  details: null,
  detailsError: null,
  detailsIsLoading: false,
};

const DEFAULT_CONTEXT_FILES: AgentChatContextFilesState = {
  pinnedFiles: [],
  contextSummary: null,
  autocompleteResults: [],
  isAutocompleteOpen: false,
  mentions: [],
  allFiles: [],
  attachments: [],
};

const DEFAULT_MODEL: AgentChatModelState = {
  chatOverrides: { model: '', effort: 'medium', permissionMode: 'default' },
  settingsModel: '',
  codexSettingsModel: '',
  defaultProvider: 'claude-code',
  modelProviders: [],
  codexModels: [],
};

const DEFAULT_QUEUE: AgentChatQueueState = { queuedMessages: [] };
const DEFAULT_SLASH: AgentChatSlashState = { slashCommandContext: null };

/* ── No-op actions ────────────────────────────────── */

const NOOP_ACTIONS: AgentChatActions = {
  onDraftChange: () => undefined,
  onEdit: async () => undefined,
  onRetry: async () => undefined,
  onBranch: async () => undefined,
  onRevert: async () => undefined,
  onRerunSuccess: () => undefined,
  onOpenLinkedDetails: async () => undefined,
  onOpenLinkedTask: () => undefined,
  onSend: async () => undefined,
  onStop: async () => undefined,
  closeDetails: () => undefined,
  onRemoveFile: () => undefined,
  onAutocompleteQuery: () => undefined,
  onSelectFile: () => undefined,
  onCloseAutocomplete: () => undefined,
  onOpenAutocomplete: () => undefined,
  onAddMention: () => undefined,
  onRemoveMention: () => undefined,
  onAttachmentsChange: () => undefined,
  onChatOverridesChange: () => undefined,
  onSelectThread: () => undefined,
  onEditQueuedMessage: () => undefined,
  onDeleteQueuedMessage: () => undefined,
  onSendQueuedMessageNow: async () => undefined,
};

/* ── Store factory ────────────────────────────────── */

export type AgentChatStoreInstance = StoreApi<AgentChatStore>;

export function createAgentChatStore(): StoreApi<AgentChatStore> {
  const initial: AgentChatStore = {
    ...DEFAULT_THREAD,
    ...DEFAULT_DETAILS,
    ...DEFAULT_CONTEXT_FILES,
    ...DEFAULT_MODEL,
    ...DEFAULT_QUEUE,
    ...DEFAULT_SLASH,
    ...NOOP_ACTIONS,
  };
  return createStore<AgentChatStore>()(() => initial);
}

/* ── React context ────────────────────────────────── */

export const AgentChatStoreContext =
  createContext<AgentChatStoreInstance | null>(null);

export function useAgentChatStoreContext<T>(
  selector: (state: AgentChatStore) => T,
): T {
  const store = useContext(AgentChatStoreContext);
  if (!store) {
    throw new Error(
      'useAgentChatStoreContext must be used within AgentChatStoreContext.Provider',
    );
  }
  return useStore(store, selector);
}
