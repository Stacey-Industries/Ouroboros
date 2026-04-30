/**
 * InnerSidebarChats — Chats tab content for the inner sidebar.
 *
 * Scoped to the active project: shows all chats whose workspaceRoot matches,
 * ordered most-recent-first. A `+ New chat` button at the top creates a new
 * chat in the active project. When no project is active, shows a CTA to pick
 * one from the outer rail.
 */

import React from 'react';

import type {
  AgentChatThreadRecord,
  ApprovalRequest,
  SessionRecord,
} from '../../../types/electron';
import { useWorkbenchAttention } from './useWorkbenchAttention';
import { useWorkbenchRailActions } from './useWorkbenchRailActions';
import {
  useWorkbenchRecentChats,
  type UseWorkbenchRecentChatsResult,
  type WorkbenchRecentChatItem,
} from './useWorkbenchRecentChats';
import {
  useRowContextMenu,
  WorkbenchRailContextMenu,
  type WorkbenchRowItem,
} from './WorkbenchRailContextMenu';
import { WorkbenchSessionRow } from './WorkbenchSessionRow';

export interface InnerSidebarChatsProps {
  activeProjectRoot: string | null;
  activeThreadId?: string | null;
  approvalRequests: ApprovalRequest[];
  onCreateChat?: () => void;
  onSelectRecentChat?: (threadId: string) => void;
  sessions: SessionRecord[];
  threads: AgentChatThreadRecord[];
}

function NewChatRow({ onCreate }: { onCreate?: () => void }): React.ReactElement | null {
  if (!onCreate) return null;
  return (
    <div className="shrink-0 border-b border-border-semantic px-3 py-2">
      <button
        type="button"
        onClick={onCreate}
        data-testid="inner-chats-new-chat"
        className="w-full rounded border border-border-semantic bg-surface-panel px-2 py-1 text-xs text-text-semantic-secondary transition-colors hover:bg-surface-hover hover:text-text-semantic-primary"
      >
        + New chat
      </button>
    </div>
  );
}

function NoProjectPrompt(): React.ReactElement {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center px-4 text-center"
      data-testid="inner-chats-no-project"
    >
      <p className="text-xs text-text-semantic-faint">Select a project to view its chats.</p>
    </div>
  );
}

function EmptyChats(): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center p-4 text-center">
      <p className="text-xs text-text-semantic-faint">No chats yet.</p>
    </div>
  );
}

function useChatsState(props: InnerSidebarChatsProps): UseWorkbenchRecentChatsResult {
  const attention = useWorkbenchAttention({
    activeSessionId: null,
    activeThreadId: props.activeThreadId ?? null,
    approvalRequests: props.approvalRequests,
    sessions: props.sessions,
    threads: props.threads,
  });
  return useWorkbenchRecentChats({
    activeProjectRoot: props.activeProjectRoot,
    activeThreadId: props.activeThreadId ?? null,
    attentionByThreadId: attention.chatAttentionById,
    sessions: props.sessions,
    threads: props.threads,
  });
}

interface ChatsListProps {
  items: WorkbenchRecentChatItem[];
  onContextMenu: (item: WorkbenchRowItem, e: React.MouseEvent) => void;
  onSelectRecentChat?: (threadId: string) => void;
}

function ChatsList({
  items,
  onContextMenu,
  onSelectRecentChat,
}: ChatsListProps): React.ReactElement {
  if (items.length === 0) return <EmptyChats />;
  return (
    <div className="flex flex-col" data-testid="inner-chats-list">
      {items.map((item) => (
        <WorkbenchSessionRow
          key={item.id}
          item={item}
          onSelect={onSelectRecentChat}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}

export function InnerSidebarChats(props: InnerSidebarChatsProps): React.ReactElement {
  const recent = useChatsState(props);
  const { actions } = useWorkbenchRailActions();
  const { menuState, openMenu, closeMenu } = useRowContextMenu();
  const hasProject = Boolean(props.activeProjectRoot);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="inner-sidebar-chats">
      {hasProject && <NewChatRow onCreate={props.onCreateChat} />}
      {!hasProject ? (
        <NoProjectPrompt />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <ChatsList
            items={recent.items}
            onContextMenu={openMenu}
            onSelectRecentChat={props.onSelectRecentChat}
          />
        </div>
      )}
      {menuState && (
        <WorkbenchRailContextMenu state={menuState} actions={actions} onClose={closeMenu} />
      )}
    </div>
  );
}
