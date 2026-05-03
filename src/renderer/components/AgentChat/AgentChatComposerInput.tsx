/**
 * AgentChatComposerInput.tsx — ComposerTextarea + ComposerInput components.
 *
 * Wave 81 Phase F: Lexical is the only composer engine. The rich-textarea
 * dependency, LegacyRichTextarea component, AgentChatComposerHighlights, and
 * the `tokenizeComposerHighlights` / `renderHighlights` overlay path are
 * gone — recovery procedure (per wave plan risks) is `git revert` of the
 * Phase F merge if Lexical surfaces a regression in production.
 */

import React from 'react';

import { hapticImpact } from '../../../web/capacitor';
import { type ComposerInputProps } from './AgentChatComposerTypes';
import { LexicalChatComposer } from './lexicalComposer/LexicalChatComposer';

export type { ComposerInputProps };

/* ---------- SendButton ---------- */

function QueueIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

export function SendButton(props: {
  canSend: boolean;
  isSending: boolean;
  willQueue: boolean;
  onClick: () => void;
}): React.ReactElement {
  const label = props.willQueue ? 'Queue message' : 'Send message';
  function handleClick(): void {
    void hapticImpact('light');
    props.onClick();
  }
  return (
    <button
      onClick={handleClick}
      disabled={!props.canSend}
      title={label}
      aria-busy={props.isSending}
      className="absolute right-2 flex items-center justify-center rounded-md text-xs font-medium transition-all duration-100 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-30"
      style={{
        top: '6px',
        width: '28px',
        height: '28px',
        color: props.canSend ? 'var(--text-semantic-primary)' : 'var(--text-semantic-muted)',
      }}
    >
      {props.willQueue ? <QueueIcon /> : '↑'}
    </button>
  );
}

/* ---------- StopButton ---------- */

function StopButton(props: { onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title="Stop the agent"
      aria-label="Stop the agent"
      className="absolute right-2 flex items-center justify-center rounded-md text-xs font-medium transition-all duration-100 hover:bg-surface-hover"
      style={{
        top: '6px',
        width: '28px',
        height: '28px',
        color: 'var(--status-error, var(--text-semantic-primary))',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="5" y="5" width="14" height="14" rx="2" />
      </svg>
    </button>
  );
}

/* ---------- MidTurnInjectButton ---------- */

function LightningIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2L4.09 12.97A1 1 0 0 0 5 14.5h6v7.5l8.91-10.97A1 1 0 0 0 19 9.5h-6V2z" />
    </svg>
  );
}

function MidTurnInjectButton(props: {
  taskId: string;
  draft: string;
  onChange: (value: string) => void;
  onInject: (taskId: string, content: string) => Promise<void>;
}): React.ReactElement {
  const disabled = props.draft.trim() === '';
  function handleClick(): void {
    const content = props.draft.trim();
    if (!content) return;
    props.onChange('');
    void props.onInject(props.taskId, content);
  }
  return (
    <button
      type="button"
      aria-label="Inject mid-turn message"
      title="Inject mid-turn message"
      disabled={disabled}
      onClick={handleClick}
      className="absolute flex items-center justify-center rounded-md transition-all duration-100 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-30"
      style={{
        top: '6px',
        right: '38px',
        width: '28px',
        height: '28px',
        color: 'var(--status-warning)',
      }}
    >
      <LightningIcon />
    </button>
  );
}

function ComposerTextarea(props: ComposerInputProps): React.ReactElement {
  return (
    <LexicalChatComposer
      draft={props.draft}
      onChange={props.handleChange}
      onSubmit={props.onSubmit}
      disabled={props.disabled}
      hasAttachmentButton={Boolean(props.onPickImage)}
      messages={props.messages}
      chatOverrides={props.chatOverrides}
      onChatOverridesChange={props.onChatOverridesChange}
      defaultProvider={props.defaultProvider}
      codexModels={props.codexModels}
      codexAppServerTransport={props.codexAppServerTransport}
      allFiles={props.allFiles}
      mentions={props.mentions}
      symbolResults={props.symbolResults}
      addMention={props.addMention}
      removeMention={props.removeMention}
      onSlashStateChange={props.onSlashStateChange}
      slashCommands={props.slashCommands}
      slashCommandContext={props.slashCommandContext}
      slashSelectHandlerRef={props.slashSelectHandlerRef}
      onImagePaste={props.onImagePaste}
    />
  );
}

function PickImageButton({
  onPickImage,
  rightClass,
}: {
  onPickImage: () => Promise<void>;
  rightClass: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      title="Attach image"
      onClick={() => void onPickImage()}
      className={`absolute ${rightClass} flex h-[28px] w-[28px] items-center justify-center rounded-md text-text-semantic-muted transition-colors duration-100 hover:bg-surface-hover hover:text-text-semantic-primary`}
      style={{ top: 6 }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
      </svg>
    </button>
  );
}

function ComposerActionButton(
  props: ComposerInputProps & { showQueue: boolean; showStop: boolean },
): React.ReactElement {
  if (props.showStop) return <StopButton onClick={() => void props.onStop?.()} />;
  return (
    <SendButton
      canSend={props.canSend}
      isSending={props.isSending}
      willQueue={props.showQueue}
      onClick={() => void props.onSubmit()}
    />
  );
}

export function ComposerInput(props: ComposerInputProps): React.ReactElement {
  const showQueue = props.threadIsBusy && props.canSend;
  const showStop = Boolean(props.threadIsBusy && !showQueue && props.onStop);
  const showMidTurn = Boolean(props.activeMidTurnTaskId && props.onInjectMidTurn);
  const imageRightClass = showMidTurn ? 'right-20' : 'right-10';
  return (
    <div className="relative">
      <ComposerTextarea {...props} />
      {props.onPickImage && (
        <PickImageButton onPickImage={props.onPickImage} rightClass={imageRightClass} />
      )}
      {showMidTurn && props.activeMidTurnTaskId && props.onInjectMidTurn && (
        <MidTurnInjectButton
          taskId={props.activeMidTurnTaskId}
          draft={props.draft}
          onChange={props.handleChange}
          onInject={props.onInjectMidTurn}
        />
      )}
      <ComposerActionButton {...props} showQueue={showQueue} showStop={showStop} />
    </div>
  );
}
