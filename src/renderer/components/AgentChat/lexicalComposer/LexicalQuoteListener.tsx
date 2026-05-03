/**
 * LexicalQuoteListener.tsx — Lexical plugin that listens for
 * `agent-ide:quote-to-composer` DOM events and inserts the quoted text into
 * the editor at the current cursor position (or at the end if no selection).
 *
 * Mirrors the legacy useQuoteListener hook from AgentChatComposerHooks.ts but
 * uses editor.update() + $createTextNode instead of mutating a textarea ref.
 *
 * The plugin returns null (no UI) and is safe to mount unconditionally inside
 * the LexicalComposer subtree.
 */
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createTextNode, $getRoot, $getSelection, $isRangeSelection } from 'lexical';
import { useEffect } from 'react';

import { QUOTE_EVENT_NAME, type QuoteEventDetail } from '../quoteComposer';

export function LexicalQuoteListener(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    function handler(e: Event): void {
      const detail = (e as CustomEvent<QuoteEventDetail>).detail;
      if (!detail?.text) return;
      const { text } = detail;
      editor.update(() => {
        const selection = $getSelection();
        const textNode = $createTextNode(text);
        if ($isRangeSelection(selection)) {
          selection.insertNodes([textNode]);
        } else {
          $getRoot().selectEnd().insertNodes([textNode]);
        }
      });
    }

    window.addEventListener(QUOTE_EVENT_NAME, handler);
    return () => window.removeEventListener(QUOTE_EVENT_NAME, handler);
  }, [editor]);

  return null;
}
