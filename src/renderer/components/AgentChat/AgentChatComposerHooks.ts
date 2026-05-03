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
import {
  useAttachmentDragHandlers,
  usePasteHandler,
  useRemoveAttachment,
} from './imageAttachmentSupport';
import type { MentionItem } from './MentionAutocomplete';
import { QUOTE_EVENT_NAME, type QuoteEventDetail } from './quoteComposer';
import type { SlashCommand, SlashCommandContext } from './SlashCommandMenu';

function useImageActions(
  handleFiles: (files: File[]) => Promise<void>,
  attachments: ImageAttachment[],
  onAttachmentsChange?: (attachments: ImageAttachment[]) => void,
) {
  const handlePickImage = useCallback(async () => {
    if (!onAttachmentsChange || !window.electronAPI?.files?.showImageDialog) return;
    const result = await window.electronAPI.files.showImageDialog();
    if (result.success && !result.cancelled && result.attachments?.length)
      onAttachmentsChange([...attachments, ...(result.attachments as ImageAttachment[])]);
  }, [attachments, onAttachmentsChange]);
  const handleImageFiles = useCallback(
    (files: File[]) => {
      void handleFiles(files);
    },
    [handleFiles],
  );
  return { handlePickImage, handleImageFiles };
}

export function useImageAttachmentHandlers(
  attachments: ImageAttachment[],
  onAttachmentsChange?: (attachments: ImageAttachment[]) => void,
  opts?: {
    textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
    lastSyncedDraft?: React.MutableRefObject<string>;
    onChange?: (value: string) => void;
  },
) {
  const handleFiles = useCallback(
    async (files: File[]) =>
      appendAttachments(attachments, await readAttachmentFiles(files), onAttachmentsChange),
    [attachments, onAttachmentsChange],
  );
  const noop = useCallback(() => {}, []);
  const nullRef = useRef<HTMLTextAreaElement>(null);
  const nullDraft = useRef('');
  const drag = useAttachmentDragHandlers(
    handleFiles,
    opts?.textareaRef ?? nullRef,
    opts?.lastSyncedDraft ?? nullDraft,
    opts?.onChange ?? noop,
  );
  const actions = useImageActions(handleFiles, attachments, onAttachmentsChange);
  return {
    ...drag,
    handlePaste: usePasteHandler(handleFiles),
    handleImageFiles: actions.handleImageFiles,
    handlePickImage: actions.handlePickImage,
    handleRemoveAttachment: useRemoveAttachment(attachments, onAttachmentsChange),
  };
}

export interface ComposerDraftHandlersArgs {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
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
  codexAppServerTransport?: boolean;
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
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
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

export function useComposerMenuState() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [isMentionAutocompleteOpen, setIsMentionAutocompleteOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [isSlashMenuOpen, setIsSlashMenuOpen] = useState(false);
  const closeMentionAutocomplete = useCallback(() => {
    setIsMentionAutocompleteOpen(false);
    setMentionQuery(null);
  }, []);
  const closeSlashMenu = useCallback(() => {
    setIsSlashMenuOpen(false);
    setSlashQuery(null);
  }, []);
  return {
    selectedIndex,
    setSelectedIndex,
    mentionQuery,
    setMentionQuery,
    isMentionAutocompleteOpen,
    setIsMentionAutocompleteOpen,
    slashQuery,
    setSlashQuery,
    isSlashMenuOpen,
    setIsSlashMenuOpen,
    closeMentionAutocomplete,
    closeSlashMenu,
  };
}

/**
 * Listens for `agent-ide:quote-to-composer` DOM events and appends
 * the quoted text to the current draft via `onChange`.
 */
export function useQuoteListener(draft: string, onChange: (value: string) => void): void {
  const draftRef = useRef(draft);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<QuoteEventDetail>).detail;
      if (!detail?.text) return;
      const current = draftRef.current;
      const separator = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
      onChangeRef.current(current + separator + detail.text);
    };
    window.addEventListener(QUOTE_EVENT_NAME, handler);
    return () => window.removeEventListener(QUOTE_EVENT_NAME, handler);
  }, []);
}

/** Pick only the fields needed for ComposerState from useComposerMenuState. */
export function pickMenuFields(m: ReturnType<typeof useComposerMenuState>) {
  const { selectedIndex, mentionQuery, isMentionAutocompleteOpen } = m;
  const { slashQuery, isSlashMenuOpen, closeMentionAutocomplete, closeSlashMenu } = m;
  return {
    selectedIndex,
    mentionQuery,
    isMentionAutocompleteOpen,
    slashQuery,
    isSlashMenuOpen,
    closeMentionAutocomplete,
    closeSlashMenu,
  };
}
