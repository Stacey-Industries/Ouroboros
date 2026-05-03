/**
 * LexicalMentionBridge.tsx — Lexical plugin that syncs BeautifulMentionNodes
 * into the mentions[] zustand store via addMention / removeMention callbacks.
 *
 * Bridging strategy: option (a) — addMention / removeMention are passed as
 * props from LexicalChatComposer → InnerComposer → LexicalMentionBridge.
 * This keeps the bridge decoupled from any specific context shape and makes
 * the data flow explicit and traceable.
 *
 * Detection approach (per Phase A audit §2c): no dedicated removal callback
 * exists in lexical-beautiful-mentions. We diff getMentions() on every editor
 * state change against prevMentionsRef to detect additions and removals.
 */
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useBeautifulMentions } from 'lexical-beautiful-mentions';
import { useEffect, useRef } from 'react';

import type { MentionItem } from '../MentionAutocomplete';
import { mentionItemFromData } from './lexicalMentionSearch';

export type LexicalMentionBridgeProps = {
  addMention: (mention: MentionItem) => void;
  removeMention: (key: string) => void;
};

type LiveMention = { trigger: string; value: string; data: Record<string, unknown> | undefined };

function mentionKey(m: LiveMention): string {
  // Reconstruct the canonical key from data if available; fall back to a
  // trigger+value composite so the diff always has a stable identity.
  const key = m.data?.['mentionKey'];
  return typeof key === 'string' ? key : `${m.trigger}${m.value}`;
}

function diffMentions(
  prev: Map<string, LiveMention>,
  next: LiveMention[],
): { added: LiveMention[]; removedKeys: string[] } {
  const nextMap = new Map<string, LiveMention>();
  for (const m of next) nextMap.set(mentionKey(m), m);

  const added: LiveMention[] = [];
  for (const [k, m] of nextMap) {
    if (!prev.has(k)) added.push(m);
  }

  const removedKeys: string[] = [];
  for (const k of prev.keys()) {
    if (!nextMap.has(k)) removedKeys.push(k);
  }

  return { added, removedKeys };
}

export function LexicalMentionBridge({
  addMention,
  removeMention,
}: LexicalMentionBridgeProps): null {
  const [editor] = useLexicalComposerContext();
  const { getMentions } = useBeautifulMentions();
  const prevRef = useRef<Map<string, LiveMention>>(new Map());

  useEffect(() => {
    return editor.registerUpdateListener(() => {
      const current = getMentions() as LiveMention[];
      const { added, removedKeys } = diffMentions(prevRef.current, current);

      // Build new map before firing callbacks so prevRef is always up to date
      const nextMap = new Map<string, LiveMention>();
      for (const m of current) nextMap.set(mentionKey(m), m);
      prevRef.current = nextMap;

      for (const m of added) {
        const rawData = m.data as Record<string, string | boolean | number | null> | undefined;
        const item = mentionItemFromData(rawData);
        if (item) addMention(item);
      }

      for (const key of removedKeys) {
        removeMention(key);
      }
    });
  }, [editor, getMentions, addMention, removeMention]);

  return null;
}
