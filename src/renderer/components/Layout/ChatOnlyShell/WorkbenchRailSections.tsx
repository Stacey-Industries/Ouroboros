import React from 'react';

import type { WorkbenchRecentChatItem } from './useWorkbenchRecentChats';
import type { WorkbenchSessionItem } from './useWorkbenchSessions';
import { WorkbenchSessionRow } from './WorkbenchSessionRow';

interface RailSectionProps {
  title: string;
  itemCount: number;
  testId: string;
  children: React.ReactNode;
}

function RailSection({ title, itemCount, testId, children }: RailSectionProps): React.ReactElement {
  return (
    <section
      className="border-b border-stroke-default/70 py-1 last:border-b-0"
      data-testid={testId}
    >
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-semantic-tertiary">
        {title}
        <span className="ml-2 text-[10px] tracking-[0.12em] text-text-semantic-faint">
          {itemCount}
        </span>
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

export interface WorkbenchRailSectionsProps {
  activeSessions: WorkbenchSessionItem[];
  backgroundSessions: WorkbenchSessionItem[];
  recentChats: WorkbenchRecentChatItem[];
  onSelectSession?: (sessionId: string) => void;
  onSelectRecentChat?: (threadId: string) => void;
  onCompareSession?: (sessionId: string) => void;
  canCompareSession?: (item: WorkbenchSessionItem) => boolean;
  compareSessionId?: string | null;
}

interface SessionSectionsProps {
  activeSessions: WorkbenchSessionItem[];
  backgroundSessions: WorkbenchSessionItem[];
  onSelectSession?: (sessionId: string) => void;
  onCompareSession?: (sessionId: string) => void;
  canCompareSession?: (item: WorkbenchSessionItem) => boolean;
  compareSessionId?: string | null;
}

interface BackgroundRowsProps {
  items: WorkbenchSessionItem[];
  onSelectSession?: (id: string) => void;
  onCompareSession?: (id: string) => void;
  canCompareSession?: (item: WorkbenchSessionItem) => boolean;
  compareSessionId?: string | null;
}

function BackgroundSessionRows({ items, onSelectSession, onCompareSession, canCompareSession, compareSessionId }: BackgroundRowsProps): React.ReactElement {
  return (
    <RailSection title="Background Sessions" itemCount={items.length} testId="workbench-section-background-sessions">
      {items.map((item) => (
        <WorkbenchSessionRow key={item.id} item={item} onSelect={onSelectSession}
          onCompare={onCompareSession} showCompareAction={canCompareSession?.(item) ?? false}
          compareActive={compareSessionId === item.id}
        />
      ))}
    </RailSection>
  );
}

function SessionSections({ activeSessions, backgroundSessions, onSelectSession, onCompareSession, canCompareSession, compareSessionId }: SessionSectionsProps): React.ReactElement {
  return (
    <>
      {activeSessions.length > 0 && (
        <RailSection title="Active Sessions" itemCount={activeSessions.length} testId="workbench-section-active-sessions">
          {activeSessions.map((item) => <WorkbenchSessionRow key={item.id} item={item} onSelect={onSelectSession} />)}
        </RailSection>
      )}
      {backgroundSessions.length > 0 && (
        <BackgroundSessionRows items={backgroundSessions} onSelectSession={onSelectSession}
          onCompareSession={onCompareSession} canCompareSession={canCompareSession} compareSessionId={compareSessionId}
        />
      )}
    </>
  );
}

export function WorkbenchRailSections({
  activeSessions,
  backgroundSessions,
  recentChats,
  onSelectSession,
  onSelectRecentChat,
  onCompareSession,
  canCompareSession,
  compareSessionId,
}: WorkbenchRailSectionsProps): React.ReactElement {
  return (
    <>
      <SessionSections
        activeSessions={activeSessions}
        backgroundSessions={backgroundSessions}
        onSelectSession={onSelectSession}
        onCompareSession={onCompareSession}
        canCompareSession={canCompareSession}
        compareSessionId={compareSessionId}
      />
      {recentChats.length > 0 && (
        <RailSection
          title="Recent Chats"
          itemCount={recentChats.length}
          testId="workbench-section-recent-chats"
        >
          {recentChats.map((item) => (
            <WorkbenchSessionRow key={item.id} item={item} onSelect={onSelectRecentChat} />
          ))}
        </RailSection>
      )}
    </>
  );
}
