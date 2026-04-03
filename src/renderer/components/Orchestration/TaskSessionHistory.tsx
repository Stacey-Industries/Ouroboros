import React from 'react';

import type { TaskSessionRecord } from '../../types/electron';
import { TaskSessionHistoryContent } from './TaskSessionHistoryContent';

export interface TaskSessionHistoryProps {
  sessions: TaskSessionRecord[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}

export function TaskSessionHistory({ sessions, selectedSessionId, onSelectSession }: TaskSessionHistoryProps): React.ReactElement {
  return (
    <TaskSessionHistoryContent
      sessions={sessions}
      selectedSessionId={selectedSessionId}
      onSelectSession={onSelectSession}
    />
  );
}
