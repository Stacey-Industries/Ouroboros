import log from 'electron-log/renderer';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import { SWITCH_SIDEBAR_VIEW_EVENT, TOGGLE_SIDE_CHAT_EVENT } from '../../hooks/appEventNames';
import { useConfig } from '../../hooks/useConfig';
import { useStreamCompletionNotifications } from '../../hooks/useStreamCompletionNotifications';
import type { ToastType } from '../../hooks/useToast';
import { AgentChatConversation } from './AgentChatConversation';
import { AgentChatStoreContext, createAgentChatStore } from './agentChatStore';
import { IdePanels, useBranchCompare } from './AgentChatWorkspace.compare';
import { useWorkspaceStoreSync } from './AgentChatWorkspace.storeSync';
import { DensityProvider } from './DensityContext';
import { PinnedContextBar } from './PinnedContextBar';
import type { SlashCommandContext } from './SlashCommandMenu';
import { buildMentionRanges, useAgentChatContext } from './useAgentChatContext';
import type { AgentChatWorkspaceModel } from './useAgentChatWorkspace';
import { useAgentChatWorkspace } from './useAgentChatWorkspace';
import { useSideChat } from './useSideChat';
import { type WorkspaceVariant, WorkspaceVariantContext } from './WorkspaceVariantContext';

export interface AgentChatWorkspaceProps {
  projectRoot: string | null;
  /** Wave 25 — session ID for pinned context; null hides the bar. */
  activeSessionId?: string | null;
  preferredThreadId?: string | null;
  readOnly?: boolean;
  onModelReady?: (model: AgentChatWorkspaceModel) => void;
  /** Wave 43 Phase C — shell variant; defaults to 'ide'. */
  variant?: WorkspaceVariant;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function useRememberAction(
  projectRoot: string | null,
  toast: (msg: string, type?: ToastType) => void,
): (content: string) => Promise<void> {
  return useCallback(
    async (content: string) => {
      if (!content.trim()) return;
      try {
        await window.electronAPI.agentChat.createMemory(projectRoot ?? '', {
          type: 'preference',
          content: content.trim(),
          relevantFiles: [],
        });
        toast('Memory saved', 'success');
      } catch (err) {
        log.warn('failed to save memory:', err);
        toast('Failed to save memory', 'error');
      }
    },
    [projectRoot, toast],
  );
}

function useSpecAction(
  projectRoot: string | null,
  toast: (msg: string, type?: ToastType) => void,
): (featureName: string) => void {
  return useCallback(
    (featureName: string) => {
      if (!projectRoot) {
        toast('Open a project before scaffolding a spec.', 'error');
        return;
      }
      void window.electronAPI.spec
        .scaffold({ projectRoot, featureName })
        .then((result) => {
          if (!result.success) {
            if (result.collision) {
              toast(`Spec "${featureName}" already exists — not overwritten.`, 'error');
            } else {
              toast(result.error ?? 'Scaffold failed', 'error');
            }
            return;
          }
          for (const filePath of result.files ?? []) {
            window.dispatchEvent(new CustomEvent('agent-ide:open-file', { detail: filePath }));
          }
          toast(`Spec scaffolded: .ouroboros/specs/${result.slug}/`, 'success');
        })
        .catch((err: unknown) => {
          log.warn('[spec] scaffold error:', err);
          toast('Scaffold failed', 'error');
        });
    },
    [projectRoot, toast],
  );
}

/* ── Workspace helpers ───────────────────────────────────────────────────── */

function useWorkspaceNotifications(): void {
  const { config } = useConfig();
  useStreamCompletionNotifications(config);
}

function useLastMessageId(model: AgentChatWorkspaceModel): string {
  const messages = model.activeThread?.messages ?? [];
  const last = messages[messages.length - 1];
  return last?.id ?? '';
}

interface SideChatDrawerState {
  sideChat: ReturnType<typeof useSideChat>;
  isDrawerOpen: boolean;
  setIsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

function useSideChatDrawer(model: AgentChatWorkspaceModel): SideChatDrawerState {
  const sideChat = useSideChat();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const lastMessageId = useLastMessageId(model);

  const handleToggle = useCallback(() => {
    if (!isDrawerOpen) {
      setIsDrawerOpen(true);
      if (sideChat.sideChats.length === 0 && model.activeThreadId) {
        void sideChat.openSideChat(model.activeThreadId, lastMessageId, false);
      }
    } else {
      setIsDrawerOpen(false);
    }
  }, [isDrawerOpen, sideChat, model.activeThreadId, lastMessageId]);

  useEffect(() => {
    window.addEventListener(TOGGLE_SIDE_CHAT_EVENT, handleToggle);
    return () => window.removeEventListener(TOGGLE_SIDE_CHAT_EVENT, handleToggle);
  }, [handleToggle]);

  return { sideChat, isDrawerOpen, setIsDrawerOpen };
}

function useWorkspaceSlashCmd(
  model: AgentChatWorkspaceModel,
  onRemember: (content: string) => Promise<void>,
  onOpenMemories: () => void,
  onSpec: (name: string) => void,
): SlashCommandContext {
  // Wave 25 Phase C — research.explicit defaults to true.
  // Phase E will wire this to config.research?.explicit once that key is added.
  return useMemo<SlashCommandContext>(
    () => ({
      onClearChat: model.reloadThreads,
      onNewThread: model.startNewChat,
      onRemember,
      onOpenMemories,
      onSpec,
      commands: model.commands,
      researchEnabled: true,
    }),
    [model, onRemember, onOpenMemories, onSpec],
  );
}

/* ── Workspace component ─────────────────────────────────────────────────── */

interface WorkspaceWiringArgs {
  model: AgentChatWorkspaceModel;
  context: ReturnType<typeof useAgentChatContext>;
  store: ReturnType<typeof createAgentChatStore>;
  onModelReady: AgentChatWorkspaceProps['onModelReady'];
  onRemember: (c: string) => Promise<void>;
  onOpenMemories: () => void;
  onSpec: (n: string) => void;
  activeSessionId?: string | null;
  readOnly: boolean;
}

function useWorkspaceWiring(args: WorkspaceWiringArgs): void {
  const { model, context, store, onModelReady, onRemember, onOpenMemories, onSpec } = args;
  const { setContextFilePaths, setMentionRanges } = model;
  useEffect(() => {
    setContextFilePaths(context.filePaths);
  }, [context.filePaths, setContextFilePaths]);
  useEffect(() => {
    setMentionRanges(buildMentionRanges(context.mentions));
  }, [context.mentions, setMentionRanges]);
  useEffect(() => {
    onModelReady?.(model);
  }, [model, onModelReady]);
  const slashCmd = useWorkspaceSlashCmd(model, onRemember, onOpenMemories, onSpec);
  useWorkspaceStoreSync({ store, model, context, slashCmd, readOnly: args.readOnly });
  const { activeSessionId } = args;
  useEffect(() => {
    store.setState({ activeSessionId: activeSessionId ?? null });
  }, [store, activeSessionId]);
}

function useWorkspaceActions(
  projectRoot: string | null,
  sideChat: ReturnType<typeof useSideChat>,
  setIsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>,
): {
  onRemember: (c: string) => Promise<void>;
  onSpec: (n: string) => void;
  onOpenMemories: () => void;
  onCloseTab: (id: string) => void;
} {
  const { toast } = useToastContext();
  const onRemember = useRememberAction(projectRoot, toast);
  const onSpec = useSpecAction(projectRoot, toast);
  const onOpenMemories = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent(SWITCH_SIDEBAR_VIEW_EVENT, { detail: { view: 'memory' } }),
    );
  }, []);
  const onCloseTab = useCallback(
    (id: string) => {
      sideChat.closeSideChat(id);
      if (sideChat.sideChats.length <= 1) setIsDrawerOpen(false);
    },
    [sideChat, setIsDrawerOpen],
  );
  return { onRemember, onSpec, onOpenMemories, onCloseTab };
}

interface WorkspaceSetup {
  model: AgentChatWorkspaceModel;
  store: ReturnType<typeof createAgentChatStore>;
  sideChat: ReturnType<typeof useSideChat>;
  isDrawerOpen: boolean;
  setIsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  compareState: ReturnType<typeof useBranchCompare>['compareState'];
  closeCompare: ReturnType<typeof useBranchCompare>['closeCompare'];
  onCloseTab: (id: string) => void;
}

function useWorkspaceSetup(props: AgentChatWorkspaceProps): WorkspaceSetup {
  const { projectRoot, preferredThreadId = null, readOnly = false } = props;
  const model = useAgentChatWorkspace(projectRoot, preferredThreadId, readOnly);
  const context = useAgentChatContext(projectRoot, model.activeThreadId);
  // Wave 43 hotfix: reuse an ancestor-provided store (e.g. ChatOnlyShell lifts
  // the store so the title bar's ChatOnlyHeaderControls can read from it).
  // Fall back to a locally-created store when mounted standalone (IDE shell).
  const inheritedStore = useContext(AgentChatStoreContext);
  const localStore = useRef(createAgentChatStore()).current;
  const store = inheritedStore ?? localStore;
  useWorkspaceNotifications();
  const { sideChat, isDrawerOpen, setIsDrawerOpen } = useSideChatDrawer(model);
  const { compareState, closeCompare } = useBranchCompare();
  const { onRemember, onSpec, onOpenMemories, onCloseTab } = useWorkspaceActions(
    projectRoot,
    sideChat,
    setIsDrawerOpen,
  );
  useWorkspaceWiring({
    model,
    context,
    store,
    onModelReady: props.onModelReady,
    onRemember,
    onOpenMemories,
    onSpec,
    activeSessionId: props.activeSessionId,
    readOnly,
  });
  return {
    model,
    store,
    sideChat,
    isDrawerOpen,
    setIsDrawerOpen,
    compareState,
    closeCompare,
    onCloseTab,
  };
}

export function AgentChatWorkspace(props: AgentChatWorkspaceProps): React.ReactElement {
  const { activeSessionId = null, variant = 'ide' } = props;
  const { store, sideChat, isDrawerOpen, setIsDrawerOpen, compareState, closeCompare, onCloseTab } =
    useWorkspaceSetup(props);

  return (
    <WorkspaceVariantContext.Provider value={variant}>
      <AgentChatStoreContext.Provider value={store}>
        <DensityProvider>
          <div
            data-tour-anchor="chat"
            className="flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden bg-surface-panel"
            style={{ fontFamily: 'var(--font-chat, var(--font-ui, sans-serif))' }}
          >
            <PinnedContextBar activeSessionId={activeSessionId} />
            <div className="flex-1 min-h-0 overflow-hidden">
              <AgentChatConversation />
            </div>
          </div>
          {variant === 'ide' && (
            <IdePanels
              sideChat={sideChat}
              isDrawerOpen={isDrawerOpen}
              setIsDrawerOpen={setIsDrawerOpen}
              compareState={compareState}
              closeCompare={closeCompare}
              onCloseTab={onCloseTab}
            />
          )}
        </DensityProvider>
      </AgentChatStoreContext.Provider>
    </WorkspaceVariantContext.Provider>
  );
}
