/**
 * ChatKeyboardPlugin.tsx — Lexical plugin for chat keyboard shortcuts.
 *
 * Registers command listeners for the keyboard contract that mirrors the
 * existing `handleComposerShortcutKeyDown` in AgentChatComposerKeyHandlers.ts.
 * Port is faithful; gating conditions are unchanged.
 */
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
} from 'lexical';
import { useEffect } from 'react';

export type ChatKeyboardPluginProps = {
  onSend: () => void;
  onEscape?: () => void;
  onRestoreLastMessage?: () => void;
  onCyclePermissionMode?: () => void;
};

function clearEditor(editor: ReturnType<typeof useLexicalComposerContext>[0]): void {
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    root.append($createParagraphNode());
  });
}

function isAtEditorStart(): boolean {
  const selection = $getSelection();
  // No active selection means the editor has never been focused — treat as
  // start position, consistent with legacy textarea.selectionStart === 0.
  if (!$isRangeSelection(selection)) return true;
  const anchor = selection.anchor;
  if (anchor.offset !== 0) return false;
  const root = $getRoot();
  const firstChild = root.getFirstChild();
  if (!firstChild) return true;
  const anchorNode = anchor.getNode();
  return anchorNode === firstChild || anchorNode.getParent() === firstChild;
}

function useEnterCommand(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  onSend: () => void,
): void {
  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!event || event.isComposing || event.shiftKey) return false;
        event.preventDefault();
        onSend();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, onSend]);
}

function useEscapeCommand(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  onEscape?: () => void,
): void {
  useEffect(() => {
    return editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event: KeyboardEvent | null) => {
        event?.preventDefault();
        clearEditor(editor);
        onEscape?.();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, onEscape]);
}

function useArrowUpCommand(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  onRestoreLastMessage?: () => void,
): void {
  useEffect(() => {
    return editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!event || event.shiftKey || event.ctrlKey || event.metaKey) return false;
        const text = $getRoot().getTextContent().trim();
        if (text !== '' || !isAtEditorStart()) return false;
        onRestoreLastMessage?.();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, onRestoreLastMessage]);
}

function useTabCommand(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  onCyclePermissionMode?: () => void,
): void {
  useEffect(() => {
    return editor.registerCommand(
      KEY_TAB_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!event || !event.shiftKey) return false;
        onCyclePermissionMode?.();
        event.preventDefault();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, onCyclePermissionMode]);
}

export function ChatKeyboardPlugin(props: ChatKeyboardPluginProps): null {
  const [editor] = useLexicalComposerContext();
  useEnterCommand(editor, props.onSend);
  useEscapeCommand(editor, props.onEscape);
  useArrowUpCommand(editor, props.onRestoreLastMessage);
  useTabCommand(editor, props.onCyclePermissionMode);
  return null;
}
