/**
 * LexicalMentionBridge.tsx — Lexical plugin that syncs BeautifulMentionNodes
 * into the mentions[] zustand store via addMention / removeMention callbacks.
 *
 * Bridging strategy: option (a) — addMention / removeMention are passed as
 * props from LexicalChatComposer → InnerComposer → LexicalMentionBridge.
 * This keeps the bridge decoupled from any specific context shape and makes
 * the data flow explicit and traceable.
 *
 * Detection approach (Wave 81 smoke fix, take 2): two listeners belt-and-
 * suspenders style.
 *   1. registerMutationListener fires immediately on BeautifulMentionNode
 *      'created' / 'destroyed' — fast path.
 *   2. registerUpdateListener reconciles on every commit by scanning all
 *      BeautifulMentionNodes in the current editor state against our cached
 *      nodeKey → mentionItem.key map — slow safety net. If the mutation
 *      listener missed a removal for any reason (replace-rewrite paths,
 *      decorator-delete shortcuts, library oddities), the reconciler catches
 *      it on the next update.
 *
 * We track nodeKey → mentionItem.key in a ref so 'destroyed' / drift checks
 * can fire the correct removeMention(key) without re-reading the gone node.
 */
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNodeByKey, $nodesOfType } from 'lexical';
import { $isBeautifulMentionNode, BeautifulMentionNode } from 'lexical-beautiful-mentions';
import { useEffect, useRef } from 'react';

import type { MentionItem } from '../MentionAutocomplete';
import { mentionItemFromData } from './lexicalMentionSearch';

export type LexicalMentionBridgeProps = {
  addMention: (mention: MentionItem) => void;
  removeMention: (key: string) => void;
};

type Editor = ReturnType<typeof useLexicalComposerContext>[0];

function readMentionItemForNode(editor: Editor, nodeKey: string): MentionItem | null {
  let item: MentionItem | null = null;
  editor.getEditorState().read(() => {
    const node = $getNodeByKey(nodeKey);
    if (!node || !$isBeautifulMentionNode(node)) return;
    const exported = node.exportJSON() as {
      data?: Record<string, string | boolean | number | null>;
    };
    item = mentionItemFromData(exported.data);
  });
  return item;
}

function handleCreated(
  editor: Editor,
  nodeKey: string,
  cache: Map<string, string>,
  addMention: (m: MentionItem) => void,
): void {
  if (cache.has(nodeKey)) return; // already added — guard against duplicate fire
  const item = readMentionItemForNode(editor, nodeKey);
  if (!item) return;
  cache.set(nodeKey, item.key);
  addMention(item);
}

function handleDestroyed(
  nodeKey: string,
  cache: Map<string, string>,
  removeMention: (key: string) => void,
): void {
  const mentionKey = cache.get(nodeKey);
  if (!mentionKey) return;
  cache.delete(nodeKey);
  removeMention(mentionKey);
}

/**
 * Fallback reconciler: scan the live editor state for BeautifulMentionNode
 * keys and compare against our cache. Anything in the cache but not in the
 * live state was destroyed without firing the mutation listener — fire
 * removeMention now.
 */
function reconcileMissed(
  editor: Editor,
  cache: Map<string, string>,
  removeMention: (key: string) => void,
): void {
  const liveKeys = new Set<string>();
  editor.getEditorState().read(() => {
    for (const node of $nodesOfType(BeautifulMentionNode)) {
      liveKeys.add(node.getKey());
    }
  });
  for (const [nodeKey, mentionKey] of cache) {
    if (!liveKeys.has(nodeKey)) {
      cache.delete(nodeKey);
      removeMention(mentionKey);
    }
  }
}

export function LexicalMentionBridge({
  addMention,
  removeMention,
}: LexicalMentionBridgeProps): null {
  const [editor] = useLexicalComposerContext();
  const cache = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const unsubMutation = editor.registerMutationListener(BeautifulMentionNode, (mutations) => {
      for (const [nodeKey, mutation] of mutations) {
        if (mutation === 'created') handleCreated(editor, nodeKey, cache.current, addMention);
        else if (mutation === 'destroyed') handleDestroyed(nodeKey, cache.current, removeMention);
      }
    });
    const unsubUpdate = editor.registerUpdateListener(() => {
      reconcileMissed(editor, cache.current, removeMention);
    });
    return () => {
      unsubMutation();
      unsubUpdate();
    };
  }, [editor, addMention, removeMention]);

  return null;
}
