/**
 * imageAttachmentSupport.ts — drop / paste / remove helpers for the legacy
 * RichTextarea composer image attachment surface.
 *
 * Extracted from AgentChatComposerHooks.ts to keep that file under the
 * 300-line cap. All three hooks (`useAttachmentDragHandlers`,
 * `useRemoveAttachment`, `usePasteHandler`) plus the support helpers
 * (`hasImageItems`, `hasFileTreeData`, `buildMentionFromDrop`,
 * `insertDroppedPath`) move together since they are tightly coupled.
 */
import type React from 'react';
import { useCallback, useState } from 'react';

import type { ImageAttachment } from '../../types/electron';
import { buildMentionInsertion, setDraftValue } from './AgentChatComposerSupport';
import type { MentionItem } from './MentionAutocomplete';

export function hasImageItems(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.items).some((i) => i.type.startsWith('image/'));
}

export function hasFileTreeData(event: React.DragEvent): boolean {
  return event.dataTransfer.types.includes('application/json');
}

export function buildMentionFromDrop(jsonData: string): MentionItem | null {
  try {
    const parsed = JSON.parse(jsonData);
    if (!parsed.path || typeof parsed.path !== 'string') return null;
    const isDir = Boolean(parsed.isDirectory);
    const name = parsed.name || parsed.path.split(/[\\/]/).pop() || parsed.path;
    return {
      type: isDir ? 'folder' : 'file',
      key: `@${isDir ? 'folder' : 'file'}:${parsed.path}`,
      label: name,
      path: parsed.relativePath || parsed.path,
      estimatedTokens: isDir ? 5000 : 500,
    };
  } catch {
    return null;
  }
}

export function insertDroppedPath(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  lastSyncedDraft: React.MutableRefObject<string>,
  onChange: (value: string) => void,
  path: string,
): void {
  const textarea = textareaRef.current;
  if (!textarea) return;
  const cursor = textarea.selectionStart ?? textarea.value.length;
  const insertion = buildMentionInsertion(path);
  const next = textarea.value.slice(0, cursor) + insertion + textarea.value.slice(cursor);
  setDraftValue(textareaRef, lastSyncedDraft, onChange, next);
  const newCursor = cursor + insertion.length;
  textarea.setSelectionRange(newCursor, newCursor);
  textarea.focus();
}

export function useAttachmentDragHandlers(
  handleFiles: (files: File[]) => Promise<void>,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  lastSyncedDraft: React.MutableRefObject<string>,
  onChange: (value: string) => void,
) {
  const [isDragging, setIsDragging] = useState(false);
  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (!hasImageItems(event) && !hasFileTreeData(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      void handleFiles(
        Array.from(event.dataTransfer.files).filter((f) => f.type.startsWith('image/')),
      );
      const jsonData = event.dataTransfer.getData('application/json');
      if (!jsonData) return;
      const mention = buildMentionFromDrop(jsonData);
      if (mention) insertDroppedPath(textareaRef, lastSyncedDraft, onChange, mention.path);
    },
    [handleFiles, textareaRef, lastSyncedDraft, onChange],
  );
  return { isDragging, handleDragOver, handleDragLeave, handleDrop };
}

export function useRemoveAttachment(
  attachments: ImageAttachment[],
  onAttachmentsChange?: (attachments: ImageAttachment[]) => void,
) {
  return useCallback(
    (name: string) => {
      const index = attachments.findIndex((a) => a.name === name);
      if (index === -1) return;
      const next = [...attachments];
      next.splice(index, 1);
      onAttachmentsChange?.(next);
    },
    [attachments, onAttachmentsChange],
  );
}

export function usePasteHandler(handleFiles: (files: File[]) => Promise<void>) {
  return useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const imageFiles = Array.from(event.clipboardData.items)
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (!imageFiles.length) return;
      event.preventDefault();
      void handleFiles(imageFiles);
    },
    [handleFiles],
  );
}
