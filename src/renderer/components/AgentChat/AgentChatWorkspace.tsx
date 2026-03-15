import React, { useEffect } from 'react';
import { AgentChatConversation } from './AgentChatConversation';
import { AgentChatTabBar } from './AgentChatTabBar';
import { useAgentChatWorkspace } from './useAgentChatWorkspace';
import { useAgentChatContext } from './useAgentChatContext';

export interface AgentChatWorkspaceProps {
  projectRoot: string | null;
}

export function AgentChatWorkspace({ projectRoot }: AgentChatWorkspaceProps): React.ReactElement {
  const model = useAgentChatWorkspace(projectRoot);
  const context = useAgentChatContext(projectRoot, model.activeThreadId);

  // Sync context file paths into the workspace model so they're included on send
  useEffect(() => {
    model.setContextFilePaths(context.filePaths);
  }, [context.filePaths, model.setContextFilePaths]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg-secondary)]">
      <AgentChatTabBar
        activeThreadId={model.activeThreadId}
        onDeleteThread={(threadId) => void model.deleteThread(threadId)}
        onNewChat={model.startNewChat}
        onSelectThread={model.selectThread}
        threads={model.threads}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        <AgentChatConversation
          activeThread={model.activeThread}
          canSend={model.canSend}
          pendingUserMessage={model.pendingUserMessage}
          closeDetails={model.closeDetails}
          details={model.details}
          detailsError={model.detailsError}
          detailsIsLoading={model.detailsIsLoading}
          draft={model.draft}
          error={model.error}
          hasProject={model.hasProject}
          isDetailsOpen={model.isDetailsOpen}
          isLoading={model.isLoading}
          isSending={model.isSending}
          onDraftChange={model.setDraft}
          onEdit={model.editAndResend}
          onRetry={model.retryMessage}
          onBranch={model.branchFromMessage}
          onOpenLinkedDetails={model.openLinkedDetails}
          onOpenLinkedTask={model.openDetailsInOrchestration}
          onSend={model.sendMessage}
          onStop={model.stopTask}
          pinnedFiles={context.pinnedFiles}
          onRemoveFile={context.removeFile}
          contextSummary={context.contextSummary}
          autocompleteResults={context.autocompleteResults}
          isAutocompleteOpen={context.isAutocompleteOpen}
          onAutocompleteQuery={context.setAutocompleteQuery}
          onSelectFile={context.addFile}
          onCloseAutocomplete={context.closeAutocomplete}
          onOpenAutocomplete={context.openAutocomplete}
          mentions={context.mentions}
          onAddMention={context.addMention}
          onRemoveMention={context.removeMention}
          allFiles={context.allFiles}
          onSelectThread={model.selectThread}
        />
      </div>
    </div>
  );
}
