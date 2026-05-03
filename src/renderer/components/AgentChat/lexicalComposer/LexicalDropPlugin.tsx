/**
 * LexicalDropPlugin.tsx — Handles drag-from-FileTree drops inside the Lexical
 * composer context.
 *
 * Design (Risk 9.3 mitigation):
 * INSERT_MENTION_COMMAND / useBeautifulMentions().insertMention require being
 * called from within the LexicalComposer subtree.  This plugin satisfies that
 * constraint by mounting inside the tree and attaching a drop listener to the
 * editor root DOM element via editor.registerRootListener.
 *
 * Drop event flow:
 *  1. FloatingComposerContainer receives the drop and calls
 *     attachmentHandlers.handleDrop — handles image-file drops (AttachmentChipsBar)
 *     via useImageAttachmentHandlers.  No change needed there.
 *  2. This plugin listens on the editor root element for the same drop event and
 *     handles the FileTree JSON payload.  Both handlers fire; they act on disjoint
 *     data (image files vs. application/json).
 *
 * Double-add prevention: LexicalMentionBridge detects the newly inserted
 * BeautifulMentionNode on the next editor state change and calls addMention.
 * We do NOT call addMention here — the bridge handles it.
 */
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useBeautifulMentions } from 'lexical-beautiful-mentions';
import { useEffect } from 'react';

import type { MentionItem } from '../MentionAutocomplete';
import { buildMentionDataPayload } from './lexicalMentionSearch';

/* ---------- drop-payload parser (exported for tests) ---------- */

export function buildMentionFromDropJson(jsonData: string): MentionItem | null {
  try {
    const parsed = JSON.parse(jsonData) as Record<string, unknown>;
    if (!parsed.path || typeof parsed.path !== 'string') return null;
    const isDir = Boolean(parsed.isDirectory);
    const name =
      typeof parsed.name === 'string'
        ? parsed.name
        : (parsed.path.split(/[\\/]/).pop() ?? parsed.path);
    const path = typeof parsed.relativePath === 'string' ? parsed.relativePath : parsed.path;
    return {
      type: isDir ? 'folder' : 'file',
      key: `@${isDir ? 'folder' : 'file'}:${path}`,
      label: name,
      path,
      estimatedTokens: isDir ? 5000 : 500,
    };
  } catch {
    return null;
  }
}

/* ---------- plugin ---------- */

export function LexicalDropPlugin(): null {
  const [editor] = useLexicalComposerContext();
  const { insertMention } = useBeautifulMentions();

  useEffect(() => {
    function onDrop(event: Event): void {
      const dragEvent = event as DragEvent;
      const jsonData = dragEvent.dataTransfer?.getData('application/json');
      if (!jsonData) return;
      const mention = buildMentionFromDropJson(jsonData);
      if (!mention) return;
      // Prevent Lexical's default drop handling only for FileTree payloads.
      dragEvent.preventDefault();
      insertMention({
        trigger: '@',
        value: mention.path,
        focus: true,
        data: buildMentionDataPayload(mention),
      });
    }

    // registerRootListener fires with (nextRoot, prevRoot) on mount/unmount.
    return editor.registerRootListener((nextRoot, prevRoot) => {
      if (prevRoot) prevRoot.removeEventListener('drop', onDrop);
      if (nextRoot) nextRoot.addEventListener('drop', onDrop);
    });
  }, [editor, insertMention]);

  return null;
}
