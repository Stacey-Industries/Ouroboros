/**
 * SlashCommandPlugin.tsx — Lexical plugin that detects cursor-position /
 * patterns and drives the existing SlashCommandMenu UI unchanged.
 *
 * Slash tokens remain plain text — NOT routed through BeautifulMentionsPlugin
 * (Decision 2 in wave-81-decisions.md: @ only for mention plugin; / is action
 * semantics, not label semantics).
 *
 * ## Absolute-offset computation (Risk 9.5)
 *
 * selection.anchor.offset is relative to the current TextNode, not the full
 * root text.  In a multi-paragraph editor (Shift+Enter inserts new paragraph
 * nodes), using anchor.offset directly gives the wrong cursor position.
 *
 * Strategy: walk the root's paragraph children in order.  For each paragraph,
 * walk its text-node children in order.  Accumulate text lengths until reaching
 * the node that matches selection.anchor.getNode(), then add anchor.offset.
 *
 * Separator rule (verified against Lexical source — ElementNode.getTextContent,
 * line ~9559 in Lexical.dev.mjs): between non-inline block children, Lexical
 * inserts DOUBLE_LINE_BREAK ('\n\n', 2 chars), NOT a single '\n'.  The separator
 * is added BETWEEN paragraphs (not after the last one).  This matches what
 * $getRoot().getTextContent() produces so extractSlashQuery gets the same string
 * and the same offset.
 */
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type LexicalNode,
  type PointType,
  type RangeSelection,
} from 'lexical';
import { type MutableRefObject, useEffect } from 'react';

import { extractSlashQuery } from '../AgentChatComposerParts';
import type { MentionItem } from '../MentionAutocomplete';
import type { SlashCommand, SlashCommandContext } from '../SlashCommandMenu';
import { executeSlashSelection } from './SlashCommandHandlers';

/* ---------- useSlashSelectHandler (Phase D) ---------- */

export type SlashSelectHandlerArgs = {
  draft: string;
  onChange: (v: string) => void;
  onAddMention?: (mention: MentionItem) => void;
  slashCommandContext?: SlashCommandContext;
  onSlashStateChange?: (state: SlashState) => void;
};

/**
 * Populates handlerRef.current with a callback that executes the chosen
 * slash command via executeSlashSelectionFromPlugin.  The ref pattern lets
 * the parent call ref.current(cmd) from SlashCommandMenu.onSelect without
 * needing a direct reference to the Lexical editor instance.
 */
export function useSlashSelectHandler(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  handlerRef: MutableRefObject<((cmd: SlashCommand) => void) | null> | undefined,
  args: SlashSelectHandlerArgs,
): void {
  const { draft, onChange, onAddMention, slashCommandContext, onSlashStateChange } = args;
  useEffect(() => {
    if (!handlerRef) return;
    handlerRef.current = (cmd: SlashCommand) => {
      executeSlashSelectionFromPlugin(editor, cmd, {
        draft,
        onChange,
        onAddMention,
        slashCommandContext,
        onCloseSlashMenu: () => onSlashStateChange?.({ isOpen: false, query: null }),
      });
    };
    return () => {
      handlerRef.current = null;
    };
  }, [editor, handlerRef, draft, onChange, onAddMention, slashCommandContext, onSlashStateChange]);
}

/* ---------- types ---------- */

export type SlashState = {
  isOpen: boolean;
  query: string | null;
};

export type SlashCommandPluginProps = {
  onSlashStateChange: (state: SlashState) => void;
};

/* ---------- absolute-offset helper ---------- */

function computeAbsoluteOffset(anchor: PointType): number | null {
  const anchorNode = anchor.getNode();
  const root = $getRoot();
  const paragraphs = root.getChildren();
  let offset = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const isLastPara = i === paragraphs.length - 1;

    for (const child of (para as { getChildren?: () => LexicalNode[] }).getChildren?.() ?? []) {
      if (!$isTextNode(child)) continue;
      if (child.is(anchorNode)) return offset + anchor.offset;
      offset += child.getTextContent().length;
    }

    // DOUBLE_LINE_BREAK ('\n\n') inserted between non-last block paragraphs —
    // matches Lexical's ElementNode.getTextContent() source.
    if (!isLastPara) offset += 2;
  }
  return null;
}

/* ---------- state-read helper ---------- */

function readSlashState(selection: RangeSelection): SlashState {
  if (!selection.isCollapsed()) return { isOpen: false, query: null };

  const anchor = selection.anchor;
  if (!$isTextNode(anchor.getNode())) return { isOpen: false, query: null };

  const fullText = $getRoot().getTextContent();
  const absOffset = computeAbsoluteOffset(anchor);
  if (absOffset === null) return { isOpen: false, query: null };

  const query = extractSlashQuery(fullText, absOffset);
  if (query === null) return { isOpen: false, query: null };
  return { isOpen: true, query };
}

/* ---------- plugin ---------- */

export function SlashCommandPlugin({ onSlashStateChange }: SlashCommandPluginProps): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          onSlashStateChange({ isOpen: false, query: null });
          return;
        }
        onSlashStateChange(readSlashState(selection));
      });
    });
  }, [editor, onSlashStateChange]);

  return null;
}

/* ---------- executeSlashSelectionFromPlugin ---------- */

/**
 * Called by the parent (InnerComposer) when the user confirms a slash command
 * from SlashCommandMenu.  The parent has the editor via useLexicalComposerContext
 * and all the action-context props; this helper bridges to executeSlashSelection.
 */
export function executeSlashSelectionFromPlugin(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  cmd: SlashCommand,
  args: {
    draft: string;
    onChange: (v: string) => void;
    onAddMention?: (mention: MentionItem) => void;
    slashCommandContext?: SlashCommandContext;
    onCloseSlashMenu: () => void;
  },
): void {
  executeSlashSelection(
    {
      editor,
      draft: args.draft,
      onChange: args.onChange,
      onAddMention: args.onAddMention,
      slashCommandContext: args.slashCommandContext,
      onCloseSlashMenu: args.onCloseSlashMenu,
    },
    cmd,
  );
}
