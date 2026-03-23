import React from 'react';

import type { ProjectContext } from '../../types/electron';
import {
  ActionButton,
  actionRowStyle,
  contextEditorStyle,
  Section,
} from './ContextBuilderPrimitives';
import type { ContextBuilderModel } from './useContextBuilderModel';

interface GeneratedContextSectionProps {
  context: ProjectContext;
  editedContent: string;
  handleCopyToClipboard: ContextBuilderModel['handleCopyToClipboard'];
  handleCreateClaudeMd: ContextBuilderModel['handleCreateClaudeMd'];
  handleEditedContentChange: ContextBuilderModel['handleEditedContentChange'];
  handleResetEdits: ContextBuilderModel['handleResetEdits'];
  handleSetSystemPrompt: ContextBuilderModel['handleSetSystemPrompt'];
  handleUpdateClaudeMd: ContextBuilderModel['handleUpdateClaudeMd'];
  runScan: ContextBuilderModel['runScan'];
  scanning: boolean;
}

export function GeneratedContextSection({
  context,
  editedContent,
  handleCopyToClipboard,
  handleCreateClaudeMd,
  handleEditedContentChange,
  handleResetEdits,
  handleSetSystemPrompt,
  handleUpdateClaudeMd,
  runScan,
  scanning,
}: GeneratedContextSectionProps): React.ReactElement {
  return (
    <Section title="Generated Context (editable)">
      <textarea
        value={editedContent}
        onChange={(event) => handleEditedContentChange(event.target.value)}
        style={contextEditorStyle}
      />
      <GeneratedContextActions
        context={context}
        handleCopyToClipboard={handleCopyToClipboard}
        handleCreateClaudeMd={handleCreateClaudeMd}
        handleResetEdits={handleResetEdits}
        handleSetSystemPrompt={handleSetSystemPrompt}
        handleUpdateClaudeMd={handleUpdateClaudeMd}
        runScan={runScan}
        scanning={scanning}
      />
    </Section>
  );
}

function GeneratedContextActions({
  context,
  handleCopyToClipboard,
  handleCreateClaudeMd,
  handleResetEdits,
  handleSetSystemPrompt,
  handleUpdateClaudeMd,
  runScan,
  scanning,
}: Pick<
GeneratedContextSectionProps,
  | 'context'
  | 'handleCopyToClipboard'
  | 'handleCreateClaudeMd'
  | 'handleResetEdits'
  | 'handleSetSystemPrompt'
  | 'handleUpdateClaudeMd'
  | 'runScan'
  | 'scanning'
>): React.ReactElement {
  return (
    <div style={actionRowStyle}>
      <ActionButton label="Copy to Clipboard" onClick={() => void handleCopyToClipboard()} />
      <ActionButton label="Set as System Prompt" onClick={() => void handleSetSystemPrompt()} />
      <ClaudeMdAction
        context={context}
        handleCreateClaudeMd={handleCreateClaudeMd}
        handleUpdateClaudeMd={handleUpdateClaudeMd}
      />
      <ActionButton label="Reset Edits" onClick={handleResetEdits} />
      <ActionButton
        disabled={scanning}
        label={scanning ? 'Scanning...' : 'Rescan'}
        onClick={() => void runScan()}
      />
    </div>
  );
}

function ClaudeMdAction({
  context,
  handleCreateClaudeMd,
  handleUpdateClaudeMd,
}: Pick<
GeneratedContextSectionProps,
  'context' | 'handleCreateClaudeMd' | 'handleUpdateClaudeMd'
>): React.ReactElement {
  if (!context.hasClaudeMd) {
    return (
      <ActionButton
        label="Create CLAUDE.md"
        onClick={() => void handleCreateClaudeMd()}
        primary
      />
    );
  }

  return (
    <ActionButton
      label="Update CLAUDE.md"
      onClick={() => void handleUpdateClaudeMd()}
      primary
    />
  );
}
