import React, { useEffect, useRef } from 'react';
import { AgentChatConversation } from './AgentChatConversation';
import { useAgentChatWorkspace } from './useAgentChatWorkspace';
import { useAgentChatContext } from './useAgentChatContext';
import type { AgentChatWorkspaceModel } from './useAgentChatWorkspace';

export interface AgentChatWorkspaceProps {
  projectRoot: string | null;
  onModelReady?: (model: AgentChatWorkspaceModel) => void;
}

export function AgentChatWorkspace({ projectRoot, onModelReady }: AgentChatWorkspaceProps): React.ReactElement {
  const model = useAgentChatWorkspace(projectRoot);
  const context = useAgentChatContext(projectRoot, model.activeThreadId);

  useEffect(() => {
    model.setContextFilePaths(context.filePaths);
  }, [context.filePaths, model.setContextFilePaths]);

  const onModelReadyRef = useRef(onModelReady);
  onModelReadyRef.current = onModelReady;
  useEffect(() => {
    onModelReadyRef.current?.(model);
  }, [model.threads, model.activeThreadId, model.selectThread, model.startNewChat, model.deleteThread]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg-secondary)]">
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
          onRevert={model.revertMessage}
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
          chatOverrides={model.chatOverrides}
          onChatOverridesChange={model.setChatOverrides}
          settingsModel={model.settingsModel}
          queuedMessages={model.queuedMessages}
          onEditQueuedMessage={model.editQueuedMessage}
          onDeleteQueuedMessage={model.deleteQueuedMessage}
          onSendQueuedMessageNow={model.sendQueuedMessageNow}
          attachments={model.attachments}
          onAttachmentsChange={model.setAttachments}
        />
      </div>
    </div>
  );
}
