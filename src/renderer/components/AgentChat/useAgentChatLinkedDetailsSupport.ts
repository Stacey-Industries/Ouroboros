/**
 * useAgentChatLinkedDetailsSupport.ts — Helper functions and sub-hooks for useAgentChatLinkedDetails.
 * Extracted to keep useAgentChatLinkedDetails.ts under the 300-line limit.
 */
/* @refresh reset */
import log from 'electron-log/renderer';
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  AgentChatLinkedDetailsResult,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
} from '../../types/electron';

/* ---------- Types ---------- */

export interface LinkedDetailsStateSetters {
  setActiveLink: Dispatch<SetStateAction<AgentChatOrchestrationLink | undefined>>;
  setDetails: Dispatch<SetStateAction<AgentChatLinkedDetailsResult | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
}

export interface LinkedDetailsStateContainer {
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

/* ---------- Pure helpers ---------- */

export function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getLinkKey(link?: AgentChatOrchestrationLink): string | null {
  if (!link) return null;
  const parts = [link.sessionId, link.taskId, link.attemptId].filter(Boolean);
  return parts.length > 0 ? parts.join(':') : null;
}

export function getLatestThreadLink(
  thread: AgentChatThreadRecord | null,
): AgentChatOrchestrationLink | undefined {
  if (!thread) return undefined;
  if (thread.latestOrchestration) return thread.latestOrchestration;
  return [...thread.messages].reverse().find((message) => message.orchestration)?.orchestration;
}

export function shouldAutoOpen(status: AgentChatThreadRecord['status'] | undefined): boolean {
  return status === 'failed' || status === 'needs_review';
}

export function resetLinkedDetailsState(
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

export function createAutoOpenKey(
  activeThread: AgentChatThreadRecord | null,
  preferredLinkKey: string | null,
): string | null {
  if (!activeThread || !preferredLinkKey) return null;
  return [activeThread.id, preferredLinkKey, activeThread.status, activeThread.updatedAt].join(':');
}

/* ---------- Sub-hooks ---------- */

export function useLinkedDetailsStateContainer(): LinkedDetailsStateContainer {
  const [details, setDetails] = useState<AgentChatLinkedDetailsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeLink, setActiveLink] = useState<AgentChatOrchestrationLink | undefined>();
  const requestIdRef = useRef(0);
  const autoOpenedRef = useRef<string | null>(null);
  const setters = useMemo<LinkedDetailsStateSetters>(
    () => ({ setActiveLink, setDetails, setError, setIsLoading, setIsOpen }),
    [setActiveLink, setDetails, setError, setIsLoading, setIsOpen],
  );
  return {
    activeLink,
    autoOpenedRef,
    details,
    error,
    isLoading,
    isOpen,
    requestIdRef,
    setError,
    setIsOpen,
    setters,
  };
}

export function usePreferredLinkedDetails(activeThread: AgentChatThreadRecord | null): {
  preferredLink: AgentChatOrchestrationLink | undefined;
  preferredLinkKey: string | null;
} {
  const preferredLink = useMemo(() => getLatestThreadLink(activeThread), [activeThread]);
  const preferredLinkKey = useMemo(() => getLinkKey(preferredLink), [preferredLink]);
  return { preferredLink, preferredLinkKey };
}

export function useLoadDetailsAction(args: {
  requestIdRef: MutableRefObject<number>;
  setters: LinkedDetailsStateSetters;
}): (link: AgentChatOrchestrationLink, reveal: boolean) => Promise<void> {
  const { requestIdRef, setters } = args;
  return useCallback(
    async (link: AgentChatOrchestrationLink, reveal: boolean): Promise<void> => {
      if (!hasElectronAPI()) return;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setters.setActiveLink(link);
      setters.setError(null);
      setters.setIsLoading(true);
      if (reveal) setters.setIsOpen(true);
      try {
        const result = await window.electronAPI.agentChat.getLinkedDetails(link);
        if (requestId !== requestIdRef.current) return;
        if (!result.success) throw new Error(result.error ?? 'Unable to load linked task details.');
        setters.setDetails(result);
      } catch (loadError) {
        if (requestId !== requestIdRef.current) return;
        setters.setDetails(null);
        setters.setError(getErrorMessage(loadError));
      } finally {
        if (requestId === requestIdRef.current) setters.setIsLoading(false);
      }
    },
    [requestIdRef, setters],
  );
}

function useRefreshLinkedDetails(args: {
  activeThread: AgentChatThreadRecord | null;
  autoOpenedRef: MutableRefObject<string | null>;
  loadDetails: (link: AgentChatOrchestrationLink, reveal: boolean) => Promise<void>;
  preferredLink: AgentChatOrchestrationLink | undefined;
  preferredLinkKey: string | null;
  setters: LinkedDetailsStateSetters;
}): void {
  const { activeThread, autoOpenedRef, loadDetails, preferredLink, preferredLinkKey, setters } =
    args;
  useEffect(() => {
    if (!preferredLink) {
      resetLinkedDetailsState(setters, autoOpenedRef);
      return;
    }
    void loadDetails(preferredLink, false);
  }, [
    activeThread?.updatedAt,
    autoOpenedRef,
    loadDetails,
    preferredLink,
    preferredLinkKey,
    setters,
  ]);
}

function useAutoOpenLinkedDetails(args: {
  activeThread: AgentChatThreadRecord | null;
  autoOpenedRef: MutableRefObject<string | null>;
  enabled: boolean;
  loadDetails: (link: AgentChatOrchestrationLink, reveal: boolean) => Promise<void>;
  preferredLink: AgentChatOrchestrationLink | undefined;
  preferredLinkKey: string | null;
}): void {
  const { activeThread, autoOpenedRef, enabled, loadDetails, preferredLink, preferredLinkKey } =
    args;
  useEffect(() => {
    const autoOpenKey = createAutoOpenKey(activeThread, preferredLinkKey);
    if (!enabled || !shouldAutoOpen(activeThread?.status) || !preferredLink || !autoOpenKey) return;
    if (autoOpenedRef.current === autoOpenKey) return;
    autoOpenedRef.current = autoOpenKey;
    void loadDetails(preferredLink, true);
  }, [activeThread, autoOpenedRef, enabled, loadDetails, preferredLink, preferredLinkKey]);
}

export function useLinkedDetailsLifecycle(args: {
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
    log.info('linked orchestration session:', sessionId);
  }, [activeLink?.sessionId, details?.result?.sessionId, details?.session?.id, setError]);
}

export function useLinkedDetailsActions(args: {
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
  const { preferredLink, setError, loadDetails, setIsOpen, activeLink, details } = args;
  const openDetails = useCallback(
    async (link?: AgentChatOrchestrationLink): Promise<void> => {
      const nextLink = link ?? preferredLink;
      if (!nextLink) {
        setError('Linked task details are not available for this thread yet.');
        return;
      }
      await loadDetails(nextLink, true);
    },
    [preferredLink, setError, loadDetails],
  );
  const closeDetails = useCallback((): void => {
    setIsOpen(false);
  }, [setIsOpen]);
  const openOrchestration = useOpenOrchestrationAction({ activeLink, details, setError });
  return { closeDetails, openDetails, openOrchestration };
}

export function useAutoOpenOnFailureSetting(): boolean {
  const [autoOpenOnFailure, setAutoOpenOnFailure] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && 'electronAPI' in window) {
      window.electronAPI.config
        .getAll()
        .then((cfg) => setAutoOpenOnFailure(Boolean(cfg?.agentChatSettings?.openDetailsOnFailure)))
        .catch(() => {
          /* default false */
        });
    }
  }, []);
  return autoOpenOnFailure;
}
