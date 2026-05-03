/**
 * lexicalComposerPlugins.tsx — extracted plugin components for LexicalChatComposer.
 *
 * DisabledPlugin, DraftSyncPlugin, ComposerEditable, and ComposerPlugins live
 * here to keep LexicalChatComposer.tsx under the 300-line cap. Each is a thin
 * Lexical-context-aware piece; cross-references stay through props only.
 */
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { $createParagraphNode, $createTextNode, $getRoot, type EditorState } from 'lexical';
import { type BeautifulMentionsItem, BeautifulMentionsPlugin } from 'lexical-beautiful-mentions';
import React, { useEffect, useRef } from 'react';

import type { MentionItem } from '../MentionAutocomplete';
import type { SlashCommand, SlashCommandContext } from '../SlashCommandMenu';
import { ChatKeyboardPlugin } from './ChatKeyboardPlugin';
import { LexicalDropPlugin } from './LexicalDropPlugin';
import { LexicalImagePastePlugin } from './LexicalImagePastePlugin';
import { LexicalMentionBridge } from './LexicalMentionBridge';
import { LexicalMentionMenu } from './LexicalMentionMenu';
import { LexicalMentionMenuItem } from './LexicalMentionMenuItem';
import { LexicalQuoteListener } from './LexicalQuoteListener';
import { SlashCommandPlugin, type SlashState } from './SlashCommandPlugin';

export function DisabledPlugin({ disabled }: { disabled: boolean }): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);
  return null;
}

/**
 * Populates the editor from `draft` when the value changes externally (e.g.
 * thread switch). Skips the update when the editor already matches to avoid
 * a cursor-jump on every keystroke.
 */
export function DraftSyncPlugin({ draft }: { draft: string }): null {
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

export type EditableProps = { placeholderText: string; disabled: boolean };

export function ComposerEditable({ placeholderText, disabled }: EditableProps): React.ReactElement {
  return (
    <PlainTextPlugin
      contentEditable={
        // min-h-[40px]: matches legacy RichTextarea's minHeight:40 so
        // MidTurnInjectButton absolute positioning (top:6px right:38px on the
        // parent .relative div) stays in the same pixel zone — Phase E §4b.
        <div className="lexical-composer-scroll min-h-[40px]">
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

export type PluginsProps = {
  draft: string;
  onChange: (v: string) => void;
  disabled: boolean;
  handleChange: (editorState: EditorState) => void;
  onSend: () => void;
  onEscape: () => void;
  onRestoreLastMessage: () => void;
  onCyclePermissionMode: () => void;
  onSearch: (trigger: string, query?: string | null) => Promise<BeautifulMentionsItem[]>;
  addMention?: (mention: MentionItem) => void;
  removeMention?: (key: string) => void;
  onSlashStateChange?: (state: SlashState) => void;
  slashCommands: SlashCommand[];
  /** Wave 81 smoke fix: needed by SlashCommandPlugin's keyboard-Enter path. */
  slashCommandContext?: SlashCommandContext;
  onImagePaste?: (files: File[]) => void;
};

export function ComposerPlugins(p: PluginsProps): React.ReactElement {
  return (
    <>
      <HistoryPlugin />
      <OnChangePlugin onChange={p.handleChange} ignoreSelectionChange />
      <DraftSyncPlugin draft={p.draft} />
      <DisabledPlugin disabled={p.disabled} />
      <ChatKeyboardPlugin
        onSend={p.onSend}
        onEscape={p.onEscape}
        onRestoreLastMessage={p.onRestoreLastMessage}
        onCyclePermissionMode={p.onCyclePermissionMode}
      />
      <BeautifulMentionsPlugin
        triggers={['@']}
        onSearch={p.onSearch}
        menuComponent={LexicalMentionMenu}
        menuItemComponent={LexicalMentionMenuItem}
        menuItemLimit={25}
        // Wave 81 smoke fix: deterministic deletion path. With this on,
        // backspacing into a chip replaces the BeautifulMentionNode with a
        // text node containing the trigger char (`@`), which reliably fires
        // 'destroyed' on the original node so LexicalMentionBridge's mutation
        // listener can sync the removal to the mentions[] store. The user
        // gets to backspace once more to remove the trigger — that's a small
        // UX cost and gives a chance to undo the removal by typing again.
        showMentionsOnDelete={true}
      />
      {p.addMention && p.removeMention && (
        <LexicalMentionBridge addMention={p.addMention} removeMention={p.removeMention} />
      )}
      {p.onSlashStateChange && (
        <SlashCommandPlugin
          onSlashStateChange={p.onSlashStateChange}
          slashCommands={p.slashCommands}
          draft={p.draft}
          onChange={p.onChange}
          slashCommandContext={p.slashCommandContext}
          onAddMention={p.addMention}
        />
      )}
      {p.onImagePaste && <LexicalImagePastePlugin onImagePaste={p.onImagePaste} />}
      <LexicalDropPlugin />
      <LexicalQuoteListener />
    </>
  );
}
