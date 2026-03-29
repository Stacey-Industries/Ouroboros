import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  OrchestrationPanelEmpty,
  OrchestrationPanelLoaded,
} from './OrchestrationPanelContent.parts';
import { type OrchestrationTab } from './OrchestrationPanelSections';
import { useOrchestrationModel } from './useOrchestrationModel';

export interface OrchestrationPanelContentProps {
  projectRoot: string | null;
  initialSessionId?: string | null;
  onClose: () => void;
}

function useInitialSessionSelection(initialSessionId: string | null | undefined, selectSession: (sessionId: string) => Promise<void>): void {
  useEffect(() => {
    if (!initialSessionId) {
      return;
    }

    void selectSession(initialSessionId);
  }, [initialSessionId, selectSession]);
}

function deriveCurrentStep(model: ReturnType<typeof useOrchestrationModel>): string {
  return model.providerEvent?.message
    ?? model.state?.message
    ?? model.latestResult?.message
    ?? model.state?.status
    ?? 'idle';
}

export function OrchestrationPanelContent({ projectRoot, initialSessionId = null, onClose }: OrchestrationPanelContentProps): React.ReactElement<any> {
  const [activeTab, setActiveTab] = useState<OrchestrationTab>('overview');
  const model = useOrchestrationModel(projectRoot);
  useInitialSessionSelection(initialSessionId, model.selectSession);
  const handleTaskReady = useCallback(async (sessionId: string): Promise<void> => {
    await model.selectSession(sessionId);
    setActiveTab('overview');
  }, [model, setActiveTab]);

  const currentStep = useMemo(() => deriveCurrentStep(model), [model]);

  if (!projectRoot) {
    return <OrchestrationPanelEmpty onClose={onClose} />;
  }

  return (
    <OrchestrationPanelLoaded
      activeTab={activeTab}
      currentStep={currentStep}
      model={model}
      onClose={onClose}
      onTaskReady={handleTaskReady}
      onSelectTab={setActiveTab}
      projectRoot={projectRoot}
    />
  );
}
