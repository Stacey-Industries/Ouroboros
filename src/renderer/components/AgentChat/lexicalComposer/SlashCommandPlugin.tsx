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
 * root text. In a multi-paragraph editor (Shift+Enter inserts new paragraph
 * nodes), using anchor.offset directly gives the wrong cursor position.
 *
 * Strategy: walk the root's paragraph children in order. For each paragraph,
 * walk its text-node children in order. Accumulate text lengths until reaching
 * the node that matches selection.anchor.getNode(), then add anchor.offset.
 *
 * Separator rule (verified against Lexical source — ElementNode.getTextContent,
 * line ~9559 in Lexical.dev.mjs): between non-inline block children, Lexical
 * inserts DOUBLE_LINE_BREAK ('\n\n', 2 chars), NOT a single '\n'. The separator
 * is added BETWEEN paragraphs (not after the last one). This matches what
 * $getRoot().getTextContent() produces so extractSlashQuery gets the same string
 * and the same offset.
 *
 * ## Keyboard navigation (Phase E)
 *
 * Keyboard hooks live in slashKeyboardNav.ts (extracted for max-lines
 * compliance). When the slash menu is open, ArrowUp/ArrowDown/Enter are
 * intercepted at COMMAND_PRIORITY_HIGH — higher than ChatKeyboardPlugin's LOW
 * — so they cycle the highlighted item and select it instead of sending the
 * message. selectedIndex is tracked in refs to avoid stale closures; it is
 * published to the parent via SlashState.selectedIndex in onSlashStateChange.
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
import { type MutableRefObject, useEffect, useRef } from 'react';

import { extractSlashQuery } from '../AgentChatComposerParts';
import type { MentionItem } from '../MentionAutocomplete';
import type { SlashCommand, SlashCommandContext } from '../SlashCommandMenu';
import { executeSlashSelectionFromPlugin } from './SlashCommandHandlers';
import {
  type SlashNavRefs,
  type SlashState,
  useSlashArrowDown,
  useSlashArrowUp,
  useSlashEnter,
} from './slashKeyboardNav';

export type { SlashState } from './slashKeyboardNav';

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
 * slash command. The ref pattern lets the parent call ref.current(cmd) from
 * SlashCommandMenu.onSelect without needing a direct editor reference.
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
        onCloseSlashMenu: () =>
          onSlashStateChange?.({ isOpen: false, query: null, selectedIndex: 0 }),
      });
    };
    return () => {
      handlerRef.current = null;
    };
  }, [editor, handlerRef, draft, onChange, onAddMention, slashCommandContext, onSlashStateChange]);
}

/* ---------- props ---------- */

export type SlashCommandPluginProps = {
  onSlashStateChange: (state: SlashState) => void;
  /** Slash commands — needed for keyboard Enter-to-select. */
  slashCommands: SlashCommand[];
  /** Current draft text — forwarded to executeSlashSelectionFromPlugin. */
  draft: string;
  /** onChange — forwarded to executeSlashSelectionFromPlugin. */
  onChange: (v: string) => void;
  /**
   * Wave 81 smoke fix: the keyboard-Enter path needs slashCommandContext +
   * onAddMention to actually execute IDE-side actions (/spec, /diff, /clear,
   * /compact, ...). Without these, executeSlashSelectionFromPlugin runs but
   * `args.slashCommandContext?.onSpec?.()` resolves to undefined → no-op.
   * Mouse-click select goes through useSlashSelectHandler which already
   * passes them; this prop closes the asymmetry.
   */
  slashCommandContext?: SlashCommandContext;
  onAddMention?: (mention: MentionItem) => void;
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

/* ---------- state-read and filter helpers ---------- */

function readSlashState(selection: RangeSelection, selectedIndex: number): SlashState {
  if (!selection.isCollapsed()) return { isOpen: false, query: null, selectedIndex: 0 };

  const anchor = selection.anchor;
  if (!$isTextNode(anchor.getNode())) return { isOpen: false, query: null, selectedIndex: 0 };

  const fullText = $getRoot().getTextContent();
  const absOffset = computeAbsoluteOffset(anchor);
  if (absOffset === null) return { isOpen: false, query: null, selectedIndex: 0 };

  const query = extractSlashQuery(fullText, absOffset);
  if (query === null) return { isOpen: false, query: null, selectedIndex: 0 };
  return { isOpen: true, query, selectedIndex };
}

function filterSlashCommands(query: string | null, commands: SlashCommand[]): SlashCommand[] {
  if (!query) return commands;
  const q = query.toLowerCase();
  return commands.filter(
    (cmd) =>
      cmd.id.toLowerCase().includes(q) ||
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q),
  );
}

/* ---------- update-listener hook ---------- */

function useSlashUpdateListener(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  slashCommands: SlashCommand[],
  onSlashStateChange: (state: SlashState) => void,
  refs: SlashNavRefs,
): void {
  const { isOpenRef, queryRef, selectedIndexRef, filteredRef } = refs;
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          isOpenRef.current = false;
          queryRef.current = null;
          selectedIndexRef.current = 0;
          onSlashStateChange({ isOpen: false, query: null, selectedIndex: 0 });
          return;
        }
        const next = readSlashState(selection, selectedIndexRef.current);
        // Reset selectedIndex when menu opens or query changes.
        if (next.isOpen && (!isOpenRef.current || next.query !== queryRef.current)) {
          selectedIndexRef.current = 0;
          next.selectedIndex = 0;
        }
        if (!next.isOpen) selectedIndexRef.current = 0;
        isOpenRef.current = next.isOpen;
        queryRef.current = next.query;
        filteredRef.current = filterSlashCommands(next.query, slashCommands);
        onSlashStateChange(next);
      });
    });
  }, [
    editor,
    onSlashStateChange,
    slashCommands,
    isOpenRef,
    queryRef,
    selectedIndexRef,
    filteredRef,
  ]);
}

/* ---------- plugin ---------- */

export function SlashCommandPlugin({
  onSlashStateChange,
  slashCommands,
  draft,
  onChange,
  slashCommandContext,
  onAddMention,
}: SlashCommandPluginProps): null {
  const [editor] = useLexicalComposerContext();
  const refs: SlashNavRefs = {
    isOpenRef: useRef(false),
    queryRef: useRef<string | null>(null),
    selectedIndexRef: useRef(0),
    filteredRef: useRef<SlashCommand[]>([]),
  };

  useSlashUpdateListener(editor, slashCommands, onSlashStateChange, refs);
  useSlashArrowDown(editor, onSlashStateChange, refs);
  useSlashArrowUp(editor, onSlashStateChange, refs);
  useSlashEnter(editor, {
    onSlashStateChange,
    draft,
    onChange,
    refs,
    slashCommandContext,
    onAddMention,
  });

  return null;
}
