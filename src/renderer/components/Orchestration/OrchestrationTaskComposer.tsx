import React from 'react';

import { ContextSelectionSection } from '../ContextBuilder/ContextSelectionSection';
import { TaskComposerCard } from './OrchestrationTaskComposer.parts';
import { useOrchestrationTaskComposerModel } from './useOrchestrationTaskComposerModel';

export interface OrchestrationTaskComposerProps {
  projectRoot: string;
  onTaskReady: (sessionId: string) => Promise<void> | void;
}

export function OrchestrationTaskComposer({ projectRoot, onTaskReady }: OrchestrationTaskComposerProps): React.ReactElement<any> {
  const model = useOrchestrationTaskComposerModel({ onTaskReady, projectRoot });

  return (
    <div className="space-y-4">
      <TaskComposerCard model={model} />
      <ContextSelectionSection contextSelection={model.contextSelection} projectRoot={projectRoot} />
    </div>
  );
}
