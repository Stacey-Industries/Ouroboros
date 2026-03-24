/**
 * AgentChatComposerHooks.ts — React hooks for AgentChatComposer.
 * Extracted to keep AgentChatComposerSupport.ts under the 300-line limit.
 */
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  AgentChatMessageRecord,
  CodexModelOption,
  ImageAttachment,
} from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import { handleComposerChange, handleComposerKeyDown } from './AgentChatComposerKeyHandlers';
import { autoResizeTextarea } from './AgentChatComposerParts';
import {
  appendAttachments,
  readAttachmentFiles,
  selectComposerFile,
  selectComposerMention,
  selectComposerSlash,
} from './AgentChatComposerSupport';
import type { ChatOverrides } from './ChatControlsBar';
import type { MentionItem } from './MentionAutocomplete';
import type { SlashCommand, SlashCommandContext } from './SlashCommandMenu';

function useAttachmentDragHandlers(handleFiles: (files: File[]) => Promise<void>) {
  const [isDragging, setIsDragging] = useState(false);
  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (!Array.from(event.dataTransfer.items).some((item) => item.type.startsWith('image/')))
      return;
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
    },
    [handleFiles],
  );
  return { isDragging, handleDragOver, handleDragLeave, handleDrop };
}

export function useImageAttachmentHandlers(
  attachments: ImageAttachment[],
  onAttachmentsChange?: (attachments: ImageAttachment[]) => void,
) {
  const handleFiles = useCallback(
    async (files: File[]) =>
      appendAttachments(attachments, await readAttachmentFiles(files), onAttachmentsChange),
    [attachments, onAttachmentsChange],
  );
  const drag = useAttachmentDragHandlers(handleFiles);
  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(event.clipboardData.items)
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (!files.length) return;
      event.preventDefault();
      void handleFiles(files);
    },
    [handleFiles],
  );
  const handlePickImage = useCallback(async () => {
    if (!onAttachmentsChange || !window.electronAPI?.files?.showImageDialog) return;
    const result = await window.electronAPI.files.showImageDialog();
    if (result.success && !result.cancelled && result.attachments?.length)
      onAttachmentsChange([...attachments, ...(result.attachments as ImageAttachment[])]);
  }, [attachments, onAttachmentsChange]);
  const handleRemoveAttachment = useCallback(
    (name: string) => {
      const index = attachments.findIndex((a) => a.name === name);
      if (index === -1) return;
      const next = [...attachments];
      next.splice(index, 1);
      onAttachmentsChange?.(next);
    },
    [attachments, onAttachmentsChange],
  );
  return { ...drag, handlePaste, handlePickImage, handleRemoveAttachment };
}

export interface ComposerDraftHandlersArgs {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  lastSyncedDraft: React.MutableRefObject<string>;
  draft: string;
  messages?: AgentChatMessageRecord[];
  canSend: boolean;
  isAutocompleteOpen: boolean;
  autocompleteResults: FileEntry[];
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  isSlashMenuOpen: boolean;
  isMentionAutocompleteOpen: boolean;
  useMentionSystem: boolean;
  mentionQuery: string | null;
  setMentionQuery: React.Dispatch<React.SetStateAction<string | null>>;
  setIsMentionAutocompleteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  slashQuery: string | null;
  setSlashQuery: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSlashMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  chatOverrides?: ChatOverrides;
  onChatOverridesChange?: (overrides: ChatOverrides) => void;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  codexModels?: CodexModelOption[];
  onAutocompleteQuery?: (query: string) => void;
  onOpenAutocomplete?: () => void;
  onCloseAutocomplete?: () => void;
  onChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  slashCommandContext?: SlashCommandContext;
  onAddMention?: (mention: MentionItem) => void;
  onSelectFile?: (file: FileEntry) => void;
}

export function useComposerDraftHandlers(args: ComposerDraftHandlersArgs) {
  const ref = useRef(args);
  ref.current = args;
  const handleFileSelect = useCallback(
    (file: FileEntry) => selectComposerFile(ref.current, file),
    [],
  );
  return {
    handleFileSelect,
    handleMentionSelect: useCallback(
      (mention: MentionItem) => selectComposerMention(ref.current, mention),
      [],
    ),
    handleSlashSelect: useCallback(
      (cmd: SlashCommand) => selectComposerSlash(ref.current, cmd),
      [],
    ),
    handleChange: useCallback((value: string) => handleComposerChange(ref.current, value), []),
    handleKeyDown: useCallback(
      (event: React.KeyboardEvent<HTMLTextAreaElement>) =>
        handleComposerKeyDown({ ...ref.current, event, handleFileSelect }),
      [handleFileSelect],
    ),
  };
}

export function useComposerDraftSync(
  textareaRef: React.RefObject<HTMLTextAreaElement>,
  lastSyncedDraft: React.MutableRefObject<string>,
  draft: string,
): void {
  useEffect(() => {
    if (draft !== lastSyncedDraft.current && textareaRef.current) {
      lastSyncedDraft.current = draft;
      textareaRef.current.value = draft;
      autoResizeTextarea(textareaRef.current);
    }
  }, [draft, lastSyncedDraft, textareaRef]);
}

export function useComposerAutocompleteReset(
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
  autocompleteResultsLength: number,
): void {
  useEffect(() => {
    setSelectedIndex(0);
  }, [autocompleteResultsLength, setSelectedIndex]);
}
