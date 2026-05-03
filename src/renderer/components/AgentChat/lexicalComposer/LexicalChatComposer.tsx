/**
 * LexicalChatComposer.tsx — Lexical-based plain-text chat composer.
 *
 * Phase B: shell behind VITE_LEXICAL_COMPOSER flag. Provides full keyboard
 * parity with the rich-textarea path. No mention plugin yet (Phase C).
 * BeautifulMentionNode is registered now to prevent Phase C runtime crashes.
 */
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type EditorState,
} from 'lexical';
import { BeautifulMentionNode } from 'lexical-beautiful-mentions';
import React, { useCallback, useEffect, useRef } from 'react';

import type { AgentChatMessageRecord, CodexModelOption } from '../../../types/electron';
import { findLastUserMessageContent } from '../AgentChatComposerParts';
import type { ChatOverrides } from '../ChatControlsBar';
import { cyclePermissionMode, resolveChatControlProvider } from '../ChatControlsBar';
import { ChatKeyboardPlugin } from './ChatKeyboardPlugin';

/* ---------- prop types ---------- */

export type LexicalChatComposerProps = {
  draft: string;
  onChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  disabled?: boolean;
  hasAttachmentButton?: boolean;
  placeholder?: string;
  messages?: AgentChatMessageRecord[];
  chatOverrides?: ChatOverrides;
  onChatOverridesChange?: (overrides: ChatOverrides) => void;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  codexModels?: CodexModelOption[];
  codexAppServerTransport?: boolean;
};

/* ---------- initial config (stable reference, created once) ---------- */

const INITIAL_CONFIG = {
  namespace: 'ChatComposer',
  theme: {},
  nodes: [BeautifulMentionNode],
  onError: (error: Error) => {
    console.error('[LexicalChatComposer]', error);
  },
};

/* ---------- DisabledPlugin ---------- */

function DisabledPlugin({ disabled }: { disabled: boolean }): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);
  return null;
}

/* ---------- DraftSyncPlugin ---------- */

/**
 * Populates the editor from `draft` when the value changes externally (e.g.
 * thread switch). Skips the update when the editor already matches to avoid
 * a cursor-jump on every keystroke.
 */
function DraftSyncPlugin({ draft }: { draft: string }): null {
  const [editor] = useLexicalComposerContext();
  const lastAppliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastAppliedRef.current === draft) return;
    let currentText = '';
    editor.getEditorState().read(() => {
      currentText = $getRoot().getTextContent();
    });
    if (currentText === draft) {
      lastAppliedRef.current = draft;
      return;
    }
    lastAppliedRef.current = draft;
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      const p = $createParagraphNode();
      if (draft) p.append($createTextNode(draft));
      root.append(p);
    });
  }, [editor, draft]);

  return null;
}

/* ---------- keyboard callback hooks ---------- */

function useSendCallback(onSubmit: () => Promise<void>): () => void {
  return useCallback(() => void onSubmit(), [onSubmit]);
}

function useEscapeCallback(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  onChange: (v: string) => void,
): () => void {
  return useCallback(() => {
    onChange('');
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      root.append($createParagraphNode());
    });
  }, [editor, onChange]);
}

function useRestoreCallback(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  messages: AgentChatMessageRecord[] | undefined,
  onChange: (v: string) => void,
): () => void {
  return useCallback(() => {
    const lastContent = findLastUserMessageContent(messages);
    if (!lastContent) return;
    onChange(lastContent);
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      const p = $createParagraphNode();
      p.append($createTextNode(lastContent));
      root.append(p);
    });
  }, [editor, messages, onChange]);
}

type CycleArgs = {
  chatOverrides?: ChatOverrides;
  onChatOverridesChange?: (o: ChatOverrides) => void;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  codexModels?: CodexModelOption[];
  codexAppServerTransport?: boolean;
};

function useCyclePermissionCallback(args: CycleArgs): () => void {
  const { chatOverrides, onChatOverridesChange, defaultProvider, codexModels } = args;
  const { codexAppServerTransport } = args;
  return useCallback(() => {
    if (!chatOverrides || !onChatOverridesChange) return;
    const provider = resolveChatControlProvider(
      chatOverrides.model,
      defaultProvider ?? 'claude-code',
      codexModels,
    );
    onChatOverridesChange({
      ...chatOverrides,
      permissionMode: cyclePermissionMode(chatOverrides.permissionMode, provider, {
        codexAppServerTransport,
      }),
    });
  }, [chatOverrides, onChatOverridesChange, defaultProvider, codexModels, codexAppServerTransport]);
}

/* ---------- editable surface ---------- */

type EditableProps = { placeholderText: string; disabled: boolean };

function ComposerEditable({ placeholderText, disabled }: EditableProps): React.ReactElement {
  return (
    <PlainTextPlugin
      contentEditable={
        <div className="lexical-composer-scroll">
          <ContentEditable
            aria-label={placeholderText}
            aria-multiline="true"
            role="textbox"
            aria-disabled={disabled}
            className="block w-full outline-none text-sm text-text-semantic-primary caret-text-semantic-primary"
          />
        </div>
      }
      placeholder={
        <div
          className="pointer-events-none absolute top-0 left-0 select-none text-sm text-text-semantic-muted"
          aria-hidden="true"
        >
          {placeholderText}
        </div>
      }
      ErrorBoundary={LexicalErrorBoundary}
    />
  );
}

/* ---------- inner composer (needs LexicalComposer context) ---------- */

function InnerComposer(props: LexicalChatComposerProps): React.ReactElement {
  const [editor] = useLexicalComposerContext();
  const { onChange, onSubmit, disabled = false, placeholder, draft } = props;
  const placeholderText = placeholder ?? 'Ask the agent... (/ for commands, @ to mention files)';

  const onSend = useSendCallback(onSubmit);
  const onEscape = useEscapeCallback(editor, onChange);
  const onRestoreLastMessage = useRestoreCallback(editor, props.messages, onChange);
  const onCyclePermissionMode = useCyclePermissionCallback(props);

  const handleChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => onChange($getRoot().getTextContent()));
    },
    [onChange],
  );

  return (
    <>
      <ComposerEditable placeholderText={placeholderText} disabled={disabled} />
      <HistoryPlugin />
      <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
      <DraftSyncPlugin draft={draft} />
      <DisabledPlugin disabled={disabled} />
      <ChatKeyboardPlugin
        onSend={onSend}
        onEscape={onEscape}
        onRestoreLastMessage={onRestoreLastMessage}
        onCyclePermissionMode={onCyclePermissionMode}
      />
    </>
  );
}

/* ---------- exported component ---------- */

export function LexicalChatComposer(props: LexicalChatComposerProps): React.ReactElement {
  return (
    <div className="relative w-full">
      <LexicalComposer initialConfig={INITIAL_CONFIG}>
        <InnerComposer {...props} />
      </LexicalComposer>
    </div>
  );
}
