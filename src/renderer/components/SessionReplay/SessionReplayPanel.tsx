import React from 'react';

import type { AgentSession } from '../AgentMonitor/types';
import { useSessionReplayController } from './SessionReplayPanelController';
import {
  SessionReplayLayout,
} from './SessionReplayPanelSections';

interface SessionReplayPanelProps {
  session: AgentSession;
  onClose: () => void;
}

export function SessionReplayPanel({
  session,
  onClose,
}: SessionReplayPanelProps): React.ReactElement<any> {
  const replay = useSessionReplayController(session);
  return <SessionReplayLayout session={session} onClose={onClose} replay={replay} />;
}
