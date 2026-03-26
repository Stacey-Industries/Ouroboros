import { useEffect } from 'react';

import {
  deriveStateFromSession,
  hasElectronAPI,
  mergeSession,
  type OrchestrationStateStore,
  sessionMatchesProjectRoot,
  updateSessionsWithResult,
  updateSessionsWithVerification,
} from '../useOrchestrationModel.helpers';

export function useOrchestrationEvents(projectRoot: string | null, setters: OrchestrationStateStore): void {
  useEffect(() => {
    if (!hasElectronAPI()) {
      return;
    }

    return window.electronAPI.orchestration.onEvent((event) => {
      switch (event.type) {
        case 'state_changed':
          setters.setState(event.state);
          return;
        case 'provider_progress':
          setters.setProviderEvent(event.progress);
          setters.setActionMessage(event.progress.message);
          return;
        case 'verification_updated':
          setters.setLatestVerificationSummary(event.summary);
          setters.setSessions((previous) => updateSessionsWithVerification(previous, event.sessionId, event.summary));
          return;
        case 'session_updated':
          if (!sessionMatchesProjectRoot(event.session, projectRoot)) {
            return;
          }

          setters.setSessions((previous) => mergeSession(previous, event.session));
          setters.setSelectedSessionId((previous) => previous ?? event.session.id);
          setters.setState(deriveStateFromSession(event.session));
          return;
        default:
          setters.setLatestResult(event.result);
          setters.setSessions((previous) => updateSessionsWithResult(previous, event.result));
      }
    });
  }, [projectRoot, setters]);
}
