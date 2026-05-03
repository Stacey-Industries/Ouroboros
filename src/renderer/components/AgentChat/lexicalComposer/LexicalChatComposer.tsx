/**
 * LexicalChatComposer.tsx — Lexical-based plain-text chat composer.
 *
 * Phase B: shell behind VITE_LEXICAL_COMPOSER flag. Provides full keyboard
 * parity with the rich-textarea path.
 *
 * Phase C: BeautifulMentionsPlugin wired for @ trigger only. LexicalMentionBridge
 * syncs chip additions/removals to the mentions[] zustand store via props
 * (bridging option a — explicit prop threading, no context coupling).
 *
 * Phase D: SlashCommandPlugin detects cursor-position / patterns and reports
 * open/query state via onSlashStateChange. The parent (AgentChatComposer) owns
 * the SlashCommandMenu UI; the plugin also populates slashSelectHandlerRef so
 * the parent can imperatively invoke the selection action without needing its
 * own reference to the Lexical editor instance.
 *
 * Phase E: image paste, FileTree drop, quote listener, slash kbd nav.
 *
 * Hooks and plugin components are extracted to lexicalComposerHooks.ts and
 * lexicalComposerPlugins.tsx for max-lines compliance — see those files for
 * the implementations.
 */
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, type EditorState } from 'lexical';
import { BeautifulMentionNode } from 'lexical-beautiful-mentions';
import React, { useCallback } from 'react';

import type { AgentChatMessageRecord, CodexModelOption } from '../../../types/electron';
import type { FileEntry } from '../../FileTree/FileListItem';
import type { ChatOverrides } from '../ChatControlsBar';
import type { MentionItem, SymbolGraphNode } from '../MentionAutocomplete';
import type { SlashCommand, SlashCommandContext } from '../SlashCommandMenu';
import {
  useCyclePermissionCallback,
  useEscapeCallback,
  useMentionSearch,
  useRestoreCallback,
  useSendCallback,
} from './lexicalComposerHooks';
import { ComposerEditable, ComposerPlugins } from './lexicalComposerPlugins';
import { type SlashState, useSlashSelectHandler } from './SlashCommandPlugin';

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
  /** All indexed files for mention search (Phase C). */
  allFiles?: FileEntry[];
  /** Currently selected mentions — excluded from search results (Phase C). */
  mentions?: MentionItem[];
  /** Symbol graph results for symbol-type mention search (Phase C). */
  symbolResults?: SymbolGraphNode[];
  /** Called when a mention chip is inserted into the editor (Phase C). */
  addMention?: (mention: MentionItem) => void;
  /** Called when a mention chip is removed from the editor (Phase C). */
  removeMention?: (key: string) => void;
  // --- Phase D: slash command integration ---
  /**
   * Called whenever the slash-command menu open/query state changes.
   * The parent uses this to drive SlashCommandMenu isOpen + query props.
   */
  onSlashStateChange?: (state: SlashState) => void;
  /**
   * Slash command list — built from slashCommandContext by the parent.
   * Passed to SlashCommandPlugin for keyboard-nav Enter-to-select (Phase E).
   */
  slashCommands?: SlashCommand[];
  /** Slash command context — provides onClearChat, onRemember, etc. */
  slashCommandContext?: SlashCommandContext;
  /**
   * Imperative handle: the parent passes a ref; InnerComposer sets
   * ref.current to a function that executes the chosen slash command.
   * The parent calls this ref from SlashCommandMenu.onSelect so the
   * editor.update() mutation happens inside the Lexical tree.
   */
  slashSelectHandlerRef?: React.MutableRefObject<((cmd: SlashCommand) => void) | null>;
  // --- Phase E: auxiliary parity ---
  /** Called when image files are pasted into the composer (Phase E). */
  onImagePaste?: (files: File[]) => void;
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

/* ---------- inner composer hooks ---------- */

function useInnerComposerHandlers(
  props: LexicalChatComposerProps,
  editor: ReturnType<typeof useLexicalComposerContext>[0],
) {
  const { onChange, onSubmit, draft } = props;
  const onSend = useSendCallback(onSubmit);
  const onEscape = useEscapeCallback(editor, onChange);
  const onRestoreLastMessage = useRestoreCallback(editor, props.messages, onChange);
  const onCyclePermissionMode = useCyclePermissionCallback(props);
  const onSearch = useMentionSearch(props.allFiles, props.mentions, props.symbolResults);
  useSlashSelectHandler(editor, props.slashSelectHandlerRef, {
    draft,
    onChange,
    onAddMention: props.addMention,
    slashCommandContext: props.slashCommandContext,
    onSlashStateChange: props.onSlashStateChange,
  });
  const handleChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => onChange($getRoot().getTextContent()));
    },
    [onChange],
  );
  return { onSend, onEscape, onRestoreLastMessage, onCyclePermissionMode, onSearch, handleChange };
}

/* ---------- inner composer (needs LexicalComposer context) ---------- */

function InnerComposer(props: LexicalChatComposerProps): React.ReactElement {
  const [editor] = useLexicalComposerContext();
  const { onChange, disabled = false, placeholder, draft } = props;
  const placeholderText = placeholder ?? 'Ask the agent... (/ for commands, @ to mention files)';
  const h = useInnerComposerHandlers(props, editor);
  return (
    <>
      <ComposerEditable placeholderText={placeholderText} disabled={disabled} />
      <ComposerPlugins
        draft={draft}
        onChange={onChange}
        disabled={disabled}
        handleChange={h.handleChange}
        onSend={h.onSend}
        onEscape={h.onEscape}
        onRestoreLastMessage={h.onRestoreLastMessage}
        onCyclePermissionMode={h.onCyclePermissionMode}
        onSearch={h.onSearch}
        addMention={props.addMention}
        removeMention={props.removeMention}
        onSlashStateChange={props.onSlashStateChange}
        slashCommands={props.slashCommands ?? []}
        onImagePaste={props.onImagePaste}
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
