/* @refresh reset */
import type {
  AgentChatLinkedDetailsResult,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
} from '../../types/electron';
import {
  useAutoOpenOnFailureSetting,
  useLinkedDetailsActions,
  useLinkedDetailsLifecycle,
  useLinkedDetailsStateContainer,
  useLoadDetailsAction,
  usePreferredLinkedDetails,
} from './useAgentChatLinkedDetailsSupport';

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

function buildLinkedDetailsReturn(
  state: ReturnType<typeof useLinkedDetailsStateContainer>,
  actions: ReturnType<typeof useLinkedDetailsActions>,
): AgentChatLinkedDetailsState {
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

export function useAgentChatLinkedDetails({
  activeThread,
}: UseAgentChatLinkedDetailsArgs): AgentChatLinkedDetailsState {
  // Read just the one boolean we need instead of the full useConfig() hook.
  // useConfig() adds 4 hooks (useState x3 + useCallback) to every component
  // that uses it, and during HMR the extra hook state can corrupt React's fiber.
  const autoOpenOnFailure = useAutoOpenOnFailureSetting();
  const state = useLinkedDetailsStateContainer();
  const { preferredLink, preferredLinkKey } = usePreferredLinkedDetails(activeThread);
  const loadDetails = useLoadDetailsAction({
    requestIdRef: state.requestIdRef,
    setters: state.setters,
  });

  useLinkedDetailsLifecycle({
    activeThread,
    autoOpenedRef: state.autoOpenedRef,
    enabled: autoOpenOnFailure,
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

  return buildLinkedDetailsReturn(state, actions);
}
