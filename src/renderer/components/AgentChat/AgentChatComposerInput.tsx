/**
 * AgentChatComposerInput.tsx — ComposerTextarea + ComposerInput components.
 *
 * Extracted from AgentChatComposerParts.tsx to stay under the 300-line limit.
 */

import React from 'react';
import { RichTextarea } from 'rich-textarea';

import { getTextareaStyle } from './AgentChatComposerSupport';

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
  return (
    <button
      onClick={props.onClick}
      disabled={!props.canSend}
      title={label}
      aria-busy={props.isSending}
      className="absolute right-2 flex items-center justify-center rounded-md text-xs font-medium transition-all duration-100 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-30"
      style={{
        top: '6px',
        width: '28px',
        height: '28px',
        color: props.canSend ? 'var(--text-primary)' : 'var(--text-muted)',
      }}
    >
      {props.willQueue ? <QueueIcon /> : '\u2191'}
    </button>
  );
}

/* ---------- ComposerInput ---------- */

export type ComposerInputProps = {
  canSend: boolean;
  disabled: boolean;
  draft: string;
  handleChange: (value: string) => void;
  handleDragLeave: () => void;
  handleDragOver: (event: React.DragEvent) => void;
  handleDrop: (event: React.DragEvent) => void;
  handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handlePaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  isSending: boolean;
  onPickImage?: () => Promise<void>;
  onSubmit: () => Promise<void>;
  threadIsBusy: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  useMentionSystem: boolean;
  onCloseAutocomplete?: () => void;
  onCloseMentionAutocomplete?: () => void;
};

/** Matches @mentions and /commands (preceded by whitespace or at start). */
const TOKEN_RE = /(@[^\n@]*\.\w+(?=\s|$)|@[^\n@]+(?=\s@|$)|(?<=^|\s)\/\S+)/g;
const ACCENT = { color: '#58a6ff' };

export function isComposerMentionHighlight(part: string): boolean {
  return part.startsWith('@') && !/^@\s/.test(part);
}

function isHighlightedToken(part: string): boolean {
  return isComposerMentionHighlight(part) || /^\/\S/.test(part);
}

function renderHighlights(value: string): React.ReactNode {
  const parts = value.split(TOKEN_RE);
  return parts.map((part, i) => (
    <span key={i} style={isHighlightedToken(part) ? ACCENT : undefined}>
      {part}
    </span>
  ));
}

function ComposerTextarea(props: ComposerInputProps): React.ReactElement {
  const baseStyle = getTextareaStyle(Boolean(props.onPickImage));
  return (
    <div className="w-full">
      <RichTextarea
        ref={props.textareaRef}
        value={props.draft}
        onChange={(event) => props.handleChange(event.target.value)}
        onKeyDown={props.handleKeyDown}
        onPaste={props.handlePaste}
        onBlur={() => {
          setTimeout(() => {
            if (props.useMentionSystem) props.onCloseMentionAutocomplete?.();
            else props.onCloseAutocomplete?.();
          }, 200);
        }}
        placeholder="Ask the agent... (/ for commands, @ to mention files)"
        disabled={props.disabled}
        rows={1}
        autoHeight
        className="w-full resize-none border bg-surface-base text-sm text-text-semantic-primary placeholder:text-text-semantic-muted focus:placeholder:text-transparent focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-60"
        style={{ ...baseStyle, width: '100%', maxHeight: 120 }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--interactive-accent)';
          e.currentTarget.style.boxShadow = '0 0 0 2px var(--interactive-muted)';
        }}
        onBlurCapture={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-subtle, var(--border-default))';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {renderHighlights}
      </RichTextarea>
    </div>
  );
}

export function ComposerInput(props: ComposerInputProps): React.ReactElement {
  return (
    <div className="relative">
      <ComposerTextarea {...props} />
      {props.onPickImage && (
        <button
          type="button"
          title="Attach image"
          onClick={() => void props.onPickImage?.()}
          className="absolute right-10 flex h-[28px] w-[28px] items-center justify-center rounded-md text-text-semantic-muted transition-colors duration-100 hover:bg-surface-hover hover:text-text-semantic-primary"
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
      )}
      <SendButton
        canSend={props.canSend}
        isSending={props.isSending}
        willQueue={props.threadIsBusy}
        onClick={() => void props.onSubmit()}
      />
    </div>
  );
}
