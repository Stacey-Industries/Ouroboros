/**
 * slashKeyboardNav.ts — Lexical command listeners for slash-menu keyboard nav.
 *
 * Extracted from SlashCommandPlugin.tsx for max-lines compliance. ArrowUp /
 * ArrowDown / Enter are intercepted at COMMAND_PRIORITY_HIGH (above
 * ChatKeyboardPlugin's LOW) so they cycle the highlighted slash item and
 * select it instead of sending the message. selectedIndex is tracked in refs
 * to avoid stale closures and republished via onSlashStateChange.
 */
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical';
import { type MutableRefObject, useEffect } from 'react';

import type { SlashCommand } from '../SlashCommandMenu';
import { executeSlashSelectionFromPlugin } from './SlashCommandHandlers';

type Editor = ReturnType<typeof useLexicalComposerContext>[0];

export type SlashState = {
  isOpen: boolean;
  query: string | null;
  /** Index of the currently highlighted command in the filtered list. */
  selectedIndex: number;
};

export type SlashNavRefs = {
  isOpenRef: MutableRefObject<boolean>;
  queryRef: MutableRefObject<string | null>;
  selectedIndexRef: MutableRefObject<number>;
  filteredRef: MutableRefObject<SlashCommand[]>;
};

export type SlashEnterOpts = {
  onSlashStateChange: (state: SlashState) => void;
  draft: string;
  onChange: (v: string) => void;
  refs: SlashNavRefs;
};

export function useSlashArrowDown(
  editor: Editor,
  onSlashStateChange: (state: SlashState) => void,
  refs: SlashNavRefs,
): void {
  const { isOpenRef, queryRef, selectedIndexRef, filteredRef } = refs;
  useEffect(() => {
    return editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      () => {
        if (!isOpenRef.current || filteredRef.current.length === 0) return false;
        const next = (selectedIndexRef.current + 1) % filteredRef.current.length;
        selectedIndexRef.current = next;
        onSlashStateChange({ isOpen: true, query: queryRef.current, selectedIndex: next });
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onSlashStateChange, isOpenRef, queryRef, selectedIndexRef, filteredRef]);
}

export function useSlashArrowUp(
  editor: Editor,
  onSlashStateChange: (state: SlashState) => void,
  refs: SlashNavRefs,
): void {
  const { isOpenRef, queryRef, selectedIndexRef, filteredRef } = refs;
  useEffect(() => {
    return editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      () => {
        if (!isOpenRef.current || filteredRef.current.length === 0) return false;
        const len = filteredRef.current.length;
        const next = (selectedIndexRef.current - 1 + len) % len;
        selectedIndexRef.current = next;
        onSlashStateChange({ isOpen: true, query: queryRef.current, selectedIndex: next });
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onSlashStateChange, isOpenRef, queryRef, selectedIndexRef, filteredRef]);
}

export function useSlashEnter(editor: Editor, opts: SlashEnterOpts): void {
  const { onSlashStateChange, draft, onChange, refs } = opts;
  const { isOpenRef, selectedIndexRef, filteredRef } = refs;
  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!isOpenRef.current || filteredRef.current.length === 0) return false;
        if (event?.shiftKey || event?.isComposing) return false;
        const cmd = filteredRef.current[selectedIndexRef.current];
        if (!cmd) return false;
        event?.preventDefault();
        executeSlashSelectionFromPlugin(editor, cmd, {
          draft,
          onChange,
          onCloseSlashMenu: () => {
            isOpenRef.current = false;
            selectedIndexRef.current = 0;
            onSlashStateChange({ isOpen: false, query: null, selectedIndex: 0 });
          },
        });
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onSlashStateChange, draft, onChange, isOpenRef, selectedIndexRef, filteredRef]);
}
