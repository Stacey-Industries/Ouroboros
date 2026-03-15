import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { useConfig } from '../../hooks/useConfig';
import { emitOrchestrationOpen } from '../../hooks/orchestrationUiHelpers';
import type {
  AgentChatLinkedDetailsResult,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
} from '../../types/electron';

export interface AgentChatLinkedDetailsState {
  activeLink: AgentChatOrchestrationLink | undefined;
  closeDetails: () => void;
  details: AgentChatLinkedDetailsResult | null;
  error: string | null;
  isLoading: boolean;
  isOpen: boolean;
  openDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  openOrchestration: () => void;
}

interface UseAgentChatLinkedDetailsArgs {
  activeThread: AgentChatThreadRecord | null;
}

interface LinkedDetailsStateSetters {
  setActiveLink: Dispatch<SetStateAction<AgentChatOrchestrationLink | undefined>>;
  setDetails: Dispatch<SetStateAction<AgentChatLinkedDetailsResult | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
}

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getLinkKey(link?: AgentChatOrchestrationLink): string | null {
  if (!link) {
    return null;
  }

  const parts = [link.sessionId, link.taskId, link.attemptId].filter(Boolean);
  return parts.length > 0 ? parts.join(':') : null;
}

function getLatestThreadLink(thread: AgentChatThreadRecord | null): AgentChatOrchestrationLink | undefined {
  if (!thread) {
    return undefined;
  }

  if (thread.latestOrchestration) {
    return thread.latestOrchestration;
  }

  return [...thread.messages].reverse().find((message) => message.orchestration)?.orchestration;
}

function shouldAutoOpen(status: AgentChatThreadRecord['status'] | undefined): boolean {
  return status === 'failed' || status === 'needs_review';
}

function resetLinkedDetailsState(
  setters: LinkedDetailsStateSetters,
  autoOpenedRef: MutableRefObject<string | null>,
): void {
  setters.setDetails(null);
  setters.setError(null);
  setters.setIsLoading(false);
  setters.setIsOpen(false);
  setters.setActiveLink(undefined);
  autoOpenedRef.current = null;
}

function createAutoOpenKey(
  activeThread: AgentChatThreadRecord | null,
  preferredLinkKey: string | null,
): string | null {
  if (!activeThread || !preferredLinkKey) {
    return null;
  }

  return [activeThread.id, preferredLinkKey, activeThread.status, activeThread.updatedAt].join(':');
}

function useRefreshLinkedDetails(args: {
  activeThread: AgentChatThreadRecord | null;
  autoOpenedRef: MutableRefObject<string | null>;
  loadDetails: (link: AgentChatOrchestrationLink, reveal: boolean) => Promise<void>;
  preferredLink: AgentChatOrchestrationLink | undefined;
  preferredLinkKey: string | null;
  setters: LinkedDetailsStateSetters;
}): void {
  const { activeThread, autoOpenedRef, loadDetails, preferredLink, preferredLinkKey, setters } = args;

  useEffect(() => {
    if (!preferredLink) {
      resetLinkedDetailsState(setters, autoOpenedRef);
      return;
    }

    void loadDetails(preferredLink, false);
  }, [activeThread?.updatedAt, autoOpenedRef, loadDetails, preferredLink, preferredLinkKey, setters]);
}

function useAutoOpenLinkedDetails(args: {
  activeThread: AgentChatThreadRecord | null;
  autoOpenedRef: MutableRefObject<string | null>;
  enabled: boolean;
  loadDetails: (link: AgentChatOrchestrationLink, reveal: boolean) => Promise<void>;
  preferredLink: AgentChatOrchestrationLink | undefined;
  preferredLinkKey: string | null;
}): void {
  const { activeThread, autoOpenedRef, enabled, loadDetails, preferredLink, preferredLinkKey } = args;

  useEffect(() => {
    const autoOpenKey = createAutoOpenKey(activeThread, preferredLinkKey);
    if (!enabled || !shouldAutoOpen(activeThread?.status) || !preferredLink || !autoOpenKey) {
      return;
    }

    if (autoOpenedRef.current === autoOpenKey) {
      return;
    }

    autoOpenedRef.current = autoOpenKey;
    void loadDetails(preferredLink, true);
  }, [activeThread, autoOpenedRef, enabled, loadDetails, preferredLink, preferredLinkKey]);
}

function useOpenOrchestrationAction(args: {
  activeLink: AgentChatOrchestrationLink | undefined;
  details: AgentChatLinkedDetailsResult | null;
  setError: Dispatch<SetStateAction<string | null>>;
}): () => void {
  const { activeLink, details, setError } = args;

  return useCallback((): void => {
    const sessionId = details?.session?.id ?? details?.result?.sessionId ?? activeLink?.sessionId;
    if (!sessionId) {
      setError('The linked orchestration session is unavailable.');
      return;
    }

    emitOrchestrationOpen(sessionId);
  }, [activeLink?.sessionId, details?.result?.sessionId, details?.session?.id, setError]);
}

interface LinkedDetailsStateContainer {
  activeLink: AgentChatOrchestrationLink | undefined;
  autoOpenedRef: MutableRefObject<string | null>;
  details: AgentChatLinkedDetailsResult | null;
  error: string | null;
  isLoading: boolean;
  isOpen: boolean;
  requestIdRef: MutableRefObject<number>;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  setters: LinkedDetailsStateSetters;
}

function useLinkedDetailsStateContainer(): LinkedDetailsStateContainer {
  const [details, setDetails] = useState<AgentChatLinkedDetailsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeLink, setActiveLink] = useState<AgentChatOrchestrationLink | undefined>();
  const requestIdRef = useRef(0);
  const autoOpenedRef = useRef<string | null>(null);
  const setters = useMemo<LinkedDetailsStateSetters>(() => ({
    setActiveLink,
    setDetails,
    setError,
    setIsLoading,
    setIsOpen,
  }), [setActiveLink, setDetails, setError, setIsLoading, setIsOpen]);

  return { activeLink, autoOpenedRef, details, error, isLoading, isOpen, requestIdRef, setError, setIsOpen, setters };
}

function usePreferredLinkedDetails(activeThread: AgentChatThreadRecord | null): {
  preferredLink: AgentChatOrchestrationLink | undefined;
  preferredLinkKey: string | null;
} {
  const preferredLink = useMemo(() => getLatestThreadLink(activeThread), [activeThread]);
  const preferredLinkKey = useMemo(() => getLinkKey(preferredLink), [preferredLink]);
  return { preferredLink, preferredLinkKey };
}

function useLoadDetailsAction(args: {
  requestIdRef: MutableRefObject<number>;
  setters: LinkedDetailsStateSetters;
}): (link: AgentChatOrchestrationLink, reveal: boolean) => Promise<void> {
  const { requestIdRef, setters } = args;

  return useCallback(async (link: AgentChatOrchestrationLink, reveal: boolean): Promise<void> => {
    if (!hasElectronAPI()) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setters.setActiveLink(link);
    setters.setError(null);
    setters.setIsLoading(true);
    if (reveal) {
      setters.setIsOpen(true);
    }

    try {
      const result = await window.electronAPI.agentChat.getLinkedDetails(link);
      if (requestId !== requestIdRef.current) {
        return;
      }
      if (!result.success) {
        throw new Error(result.error ?? 'Unable to load linked task details.');
      }
      setters.setDetails(result);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setters.setDetails(null);
      setters.setError(getErrorMessage(loadError));
    } finally {
      if (requestId === requestIdRef.current) {
        setters.setIsLoading(false);
      }
    }
  }, [requestIdRef, setters]);
}

function useLinkedDetailsLifecycle(args: {
  activeThread: AgentChatThreadRecord | null;
  autoOpenedRef: MutableRefObject<string | null>;
  enabled: boolean;
  loadDetails: (link: AgentChatOrchestrationLink, reveal: boolean) => Promise<void>;
  preferredLink: AgentChatOrchestrationLink | undefined;
  preferredLinkKey: string | null;
  setters: LinkedDetailsStateSetters;
}): void {
  useRefreshLinkedDetails(args);
  useAutoOpenLinkedDetails(args);
}

function useLinkedDetailsActions(args: {
  activeLink: AgentChatOrchestrationLink | undefined;
  details: AgentChatLinkedDetailsResult | null;
  loadDetails: (link: AgentChatOrchestrationLink, reveal: boolean) => Promise<void>;
  preferredLink: AgentChatOrchestrationLink | undefined;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
}): {
  closeDetails: () => void;
  openDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  openOrchestration: () => void;
} {
  const openDetails = useCallback(async (link?: AgentChatOrchestrationLink): Promise<void> => {
    const nextLink = link ?? args.preferredLink;
    if (!nextLink) {
      args.setError('Linked task details are not available for this thread yet.');
      return;
    }

    await args.loadDetails(nextLink, true);
  }, [args]);

  const closeDetails = useCallback((): void => {
    args.setIsOpen(false);
  }, [args]);

  const openOrchestration = useOpenOrchestrationAction({
    activeLink: args.activeLink,
    details: args.details,
    setError: args.setError,
  });

  return { closeDetails, openDetails, openOrchestration };
}

export function useAgentChatLinkedDetails({
  activeThread,
}: UseAgentChatLinkedDetailsArgs): AgentChatLinkedDetailsState {
  const { config } = useConfig();
  const state = useLinkedDetailsStateContainer();
  const { preferredLink, preferredLinkKey } = usePreferredLinkedDetails(activeThread);
  const loadDetails = useLoadDetailsAction({ requestIdRef: state.requestIdRef, setters: state.setters });

  useLinkedDetailsLifecycle({
    activeThread,
    autoOpenedRef: state.autoOpenedRef,
    enabled: Boolean(config?.agentChatSettings.openDetailsOnFailure),
    loadDetails,
    preferredLink,
    preferredLinkKey,
    setters: state.setters,
  });

  const actions = useLinkedDetailsActions({
    activeLink: state.activeLink,
    details: state.details,
    loadDetails,
    preferredLink,
    setError: state.setError,
    setIsOpen: state.setIsOpen,
  });

  return {
    activeLink: state.activeLink,
    closeDetails: actions.closeDetails,
    details: state.details,
    error: state.error,
    isLoading: state.isLoading,
    isOpen: state.isOpen,
    openDetails: actions.openDetails,
    openOrchestration: actions.openOrchestration,
  };
}
