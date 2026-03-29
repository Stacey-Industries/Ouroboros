import React from 'react';

import type { TaskSessionRecord } from '../../types/electron';
import {
  SessionHistoryEmptyState,
  SessionHistoryIntro,
  SessionHistoryItem,
} from './TaskSessionHistorySections';

export interface TaskSessionHistoryContentProps {
  sessions: TaskSessionRecord[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}

export function TaskSessionHistoryContent({ sessions, selectedSessionId, onSelectSession }: TaskSessionHistoryContentProps): React.ReactElement<any> {
  return (
    <div className="space-y-3">
      <SessionHistoryIntro />
      {sessions.length ? sessions.map((session) => (
        <SessionHistoryItem
          key={session.id}
          session={session}
          selected={session.id === selectedSessionId}
          onSelect={onSelectSession}
        />
      )) : <SessionHistoryEmptyState />}
    </div>
  );
}
