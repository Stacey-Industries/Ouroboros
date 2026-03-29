import React from 'react';

import { OrchestrationPanelContent } from './OrchestrationPanelContent';

export interface OrchestrationPanelProps {
  projectRoot: string | null;
  initialSessionId?: string | null;
  onClose: () => void;
}

export function OrchestrationPanel({ projectRoot, initialSessionId = null, onClose }: OrchestrationPanelProps): React.ReactElement<any> {
  return (
    <OrchestrationPanelContent
      projectRoot={projectRoot}
      initialSessionId={initialSessionId}
      onClose={onClose}
    />
  );
}
