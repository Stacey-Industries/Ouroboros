/**
 * AgentChatComposerInput.tsx — ComposerTextarea + ComposerInput components.
 *
 * Extracted from AgentChatComposerParts.tsx to stay under the 300-line limit.
 */

import React from 'react';

import { getTextareaStyle } from './AgentChatComposerSupport';

/* ---------- SendButton ---------- */

function QueueIcon(): React.ReactElement<any> {
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
}): React.ReactElement<any> {
  const label = props.willQueue ? 'Queue message' : 'Send message';
  return (
    <button
      onClick={props.onClick}
      disabled={!props.canSend}
      title={label}
      aria-busy={props.isSending}
      className="absolute right-2 flex items-center justify-center rounded-md text-xs font-medium transition-all duration-100 hover:bg-[rgba(255,255,255,0.08)] disabled:cursor-not-allowed disabled:opacity-30"
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

/**
 * Match @mention paths that may contain spaces (e.g. `@C:\Web App\file.ts`).
 * A mention starts with `@` and ends at: a file extension + space/EOL, or a
 * trailing space before another `@`, or EOL.  This handles both Unix and
 * Windows paths with spaces.
 */
const MENTION_SPLIT_RE = /(@[^\n@]*\.\w+(?=\s|$)|@[^\n@]+(?=\s@|$))/g;

const HIGHLIGHT_STYLE_ID = 'composer-mention-highlight';
function ensureHighlightStyles(): void {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
    .mention-blue { color: #58a6ff !important; -webkit-text-fill-color: #58a6ff !important; }
    .mention-normal { color: var(--text-semantic-primary) !important; -webkit-text-fill-color: var(--text-semantic-primary) !important; }
  `;
  document.head.appendChild(style);
}

function ComposerHighlightOverlay({ text, style }: { text: string; style: React.CSSProperties }): React.ReactElement<any> {
  React.useEffect(ensureHighlightStyles, []);
  const parts = text.split(MENTION_SPLIT_RE);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden whitespace-pre-wrap break-words text-sm"
      style={{ ...style, borderColor: 'transparent', background: 'transparent' }}
    >
      {parts.map((part, i) =>
        <span key={i} className={part.startsWith('@') ? 'mention-blue' : 'mention-normal'}>{part}</span>,
      )}
    </div>
  );
}

function ComposerTextarea(props: ComposerInputProps): React.ReactElement<any> {
  const overlayText = props.textareaRef.current?.value ?? props.draft;
  const baseStyle = getTextareaStyle(Boolean(props.onPickImage));
  return (
    <div className="relative">
      <ComposerHighlightOverlay text={overlayText} style={baseStyle} />
      <textarea
        ref={props.textareaRef}
        defaultValue={props.draft}
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
        className="relative z-20 w-full resize-none border bg-surface-base text-sm placeholder:text-text-semantic-muted focus:placeholder:text-transparent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          ...baseStyle,
          WebkitTextFillColor: 'transparent',
          caretColor: 'var(--text-semantic-primary)',
        }}
        onFocus={(event) => {
          event.currentTarget.style.borderColor = 'var(--interactive-accent)';
          event.currentTarget.style.boxShadow =
            '0 0 0 2px var(--interactive-muted, rgba(88, 166, 255, 0.2))';
        }}
        onBlurCapture={(event) => {
          event.currentTarget.style.borderColor = 'var(--border-subtle, var(--border-default))';
          event.currentTarget.style.boxShadow = 'none';
        }}
      />
    </div>
  );
}

export function ComposerInput(props: ComposerInputProps): React.ReactElement<any> {
  return (
    <div className="relative">
      <ComposerTextarea {...props} />
      {props.onPickImage && (
        <button
          type="button"
          title="Attach image"
          onClick={() => void props.onPickImage?.()}
          className="absolute right-10 flex h-[28px] w-[28px] items-center justify-center rounded-md text-text-semantic-muted transition-colors duration-100 hover:bg-[rgba(255,255,255,0.08)] hover:text-text-semantic-primary"
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
