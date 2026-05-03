/**
 * lexicalComposerHooks.ts — extracted callback hooks for LexicalChatComposer.
 *
 * Pulled out for max-lines compliance; pure hooks with no React tree side
 * effects beyond the editor.update() they wrap.
 */
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import type { BeautifulMentionsItem } from 'lexical-beautiful-mentions';
import { useCallback, useMemo } from 'react';

import type { AgentChatMessageRecord, CodexModelOption } from '../../../types/electron';
import type { FileEntry } from '../../FileTree/FileListItem';
import { findLastUserMessageContent } from '../AgentChatComposerParts';
import type { ChatOverrides } from '../ChatControlsBar';
import { cyclePermissionMode, resolveChatControlProvider } from '../ChatControlsBar';
import type { MentionItem, SymbolGraphNode } from '../MentionAutocomplete';
import { buildMentionSearchFn } from './lexicalMentionSearch';

type Editor = ReturnType<typeof useLexicalComposerContext>[0];

export function useSendCallback(onSubmit: () => Promise<void>): () => void {
  return useCallback(() => void onSubmit(), [onSubmit]);
}

export function useEscapeCallback(editor: Editor, onChange: (v: string) => void): () => void {
  return useCallback(() => {
    onChange('');
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      root.append($createParagraphNode());
    });
  }, [editor, onChange]);
}

export function useRestoreCallback(
  editor: Editor,
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

export type CycleArgs = {
  chatOverrides?: ChatOverrides;
  onChatOverridesChange?: (o: ChatOverrides) => void;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  codexModels?: CodexModelOption[];
  codexAppServerTransport?: boolean;
};

export function useCyclePermissionCallback(args: CycleArgs): () => void {
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

export function useMentionSearch(
  allFiles: FileEntry[] | undefined,
  mentions: MentionItem[] | undefined,
  symbolResults: SymbolGraphNode[] | undefined,
): (trigger: string, query?: string | null) => Promise<BeautifulMentionsItem[]> {
  return useMemo(
    () =>
      buildMentionSearchFn({
        allFiles: allFiles ?? [],
        selectedMentions: mentions ?? [],
        symbolResults,
      }),
    [allFiles, mentions, symbolResults],
  );
}
