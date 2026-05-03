/**
 * AgentChatComposerSupport.ts — Pure helpers for AgentChatComposer.
 * Hooks live in AgentChatComposerHooks.ts.
 * Extracted to keep AgentChatComposer.tsx under the 300-line limit.
 */
import type { ImageAttachment, ImageMimeType } from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import { autoResizeTextarea } from './AgentChatComposerParts';
import type { MentionItem } from './MentionAutocomplete';
import type { SlashCommand, SlashCommandContext } from './SlashCommandMenu';

/* ---------- Constants ---------- */

export const MENU_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab']);
export const noop = (): void => {};
export const DIFF_MENTION: MentionItem = {
  type: 'diff',
  key: '@diff',
  label: 'Git Diff',
  path: '@diff',
  estimatedTokens: 2000,
};

/* ---------- Attachment file readers ---------- */

function readImageFilesAsAttachments(files: File[]): Promise<ImageAttachment>[] {
  return files.map(
    (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve({
            name: file.name,
            mimeType: file.type as ImageMimeType,
            base64Data: dataUrl.split(',')[1],
            sizeBytes: file.size,
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }),
  );
}

export async function readAttachmentFiles(files: File[]): Promise<ImageAttachment[]> {
  return (await Promise.allSettled(readImageFilesAsAttachments(files)))
    .filter(
      (result): result is PromiseFulfilledResult<ImageAttachment> => result.status === 'fulfilled',
    )
    .map((result) => result.value);
}

export function appendAttachments(
  existing: ImageAttachment[],
  additions: ImageAttachment[],
  onAttachmentsChange?: (attachments: ImageAttachment[]) => void,
): void {
  if (additions.length) onAttachmentsChange?.([...existing, ...additions]);
}

/* ---------- Draft helpers ---------- */

export function setDraftValue(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  lastSyncedDraft: React.MutableRefObject<string>,
  onChange: (value: string) => void,
  value: string,
): void {
  lastSyncedDraft.current = value;
  onChange(value);
  if (textareaRef.current) {
    textareaRef.current.value = value;
    autoResizeTextarea(textareaRef.current);
  }
}

export function resetDraftTextarea(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  lastSyncedDraft: React.MutableRefObject<string>,
  onChange: (value: string) => void,
): void {
  setDraftValue(textareaRef, lastSyncedDraft, onChange, '');
}

export function removeTriggerBeforeCursor(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  lastSyncedDraft: React.MutableRefObject<string>,
  onChange: (value: string) => void,
): void {
  const textarea = textareaRef.current;
  if (!textarea) return;
  const lastAt = textarea.value.slice(0, textarea.selectionStart).lastIndexOf('@');
  if (lastAt === -1) return;
  const nextDraft = textarea.value.slice(0, lastAt) + textarea.value.slice(textarea.selectionStart);
  setDraftValue(textareaRef, lastSyncedDraft, onChange, nextDraft);
}

/**
 * Returns the insertion string for a mention.
 *
 * Special mentions that already carry a leading '@' (e.g. @codebase, @diff)
 * are emitted verbatim; the leading '@' is the trigger character itself, so
 * we do not add a second one.
 *
 * For ordinary file paths: if the path-part (after stripping any leading '@')
 * contains whitespace or ']', we use bracketed syntax `@[path] `. Paths with
 * ']' inside brackets are technically unsupported (the tokenizer terminates on
 * the first ']'), but such paths are vanishingly rare in practice. Bracketed
 * form is still preferable over bare because at least the '@[' trigger is
 * identifiable; bare insertion would silently truncate at the ']' too.
 */
export function buildMentionInsertion(path: string): string {
  const bare = path.startsWith('@') ? path.slice(1) : path;
  if (/[\s\]]/.test(bare)) return `@[${bare}] `;
  return `@${bare} `;
}

/** Replace the @trigger text with `@path ` inline in the textarea. */
export function replaceTriggerWithPath(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  lastSyncedDraft: React.MutableRefObject<string>,
  onChange: (value: string) => void,
  path: string,
): void {
  const textarea = textareaRef.current;
  if (!textarea) return;
  const cursor = textarea.selectionStart;
  const lastAt = textarea.value.slice(0, cursor).lastIndexOf('@');
  if (lastAt === -1) return;
  const insertion = buildMentionInsertion(path);
  const nextDraft = textarea.value.slice(0, lastAt) + insertion + textarea.value.slice(cursor);
  setDraftValue(textareaRef, lastSyncedDraft, onChange, nextDraft);
  const newCursor = lastAt + insertion.length;
  textarea.setSelectionRange(newCursor, newCursor);
}

/** Replace the /trigger text with `/cmdId ` inline in the textarea. */
function replaceSlashTrigger(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  lastSyncedDraft: React.MutableRefObject<string>,
  onChange: (value: string) => void,
  cmdId: string,
): void {
  const textarea = textareaRef.current;
  if (!textarea) return;
  const cursor = textarea.selectionStart;
  const lastSlash = textarea.value.slice(0, cursor).lastIndexOf('/');
  if (lastSlash === -1) return;
  const insertion = `/${cmdId} `;
  const nextDraft = textarea.value.slice(0, lastSlash) + insertion + textarea.value.slice(cursor);
  setDraftValue(textareaRef, lastSyncedDraft, onChange, nextDraft);
  const newCursor = lastSlash + insertion.length;
  textarea.setSelectionRange(newCursor, newCursor);
}

/* ---------- Mention/file selection helpers ---------- */

export function createFileMention(file: FileEntry): MentionItem {
  return {
    type: 'file',
    key: `@file:${file.path}`,
    label: file.name,
    path: file.relativePath,
    estimatedTokens: file.size > 0 ? Math.ceil(file.size / 4) : 500,
  };
}

export function selectComposerFile(
  args: {
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    lastSyncedDraft: React.MutableRefObject<string>;
    onChange: (value: string) => void;
    useMentionSystem: boolean;
    onAddMention?: (mention: MentionItem) => void;
    onSelectFile?: (file: FileEntry) => void;
    onCloseAutocomplete?: () => void;
    setMentionQuery?: React.Dispatch<React.SetStateAction<string | null>>;
    setIsMentionAutocompleteOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  },
  file: FileEntry,
): void {
  if (args.useMentionSystem) {
    replaceTriggerWithPath(
      args.textareaRef,
      args.lastSyncedDraft,
      args.onChange,
      file.relativePath,
    );
    args.setIsMentionAutocompleteOpen?.(false);
    args.setMentionQuery?.(null);
    return;
  }
  removeTriggerBeforeCursor(args.textareaRef, args.lastSyncedDraft, args.onChange);
  args.onSelectFile?.(file);
  args.onCloseAutocomplete?.();
}

export function selectComposerMention(
  args: {
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    lastSyncedDraft: React.MutableRefObject<string>;
    onChange: (value: string) => void;
    onAddMention?: (mention: MentionItem) => void;
    setMentionQuery?: React.Dispatch<React.SetStateAction<string | null>>;
    setIsMentionAutocompleteOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  },
  mention: MentionItem,
): void {
  replaceTriggerWithPath(args.textareaRef, args.lastSyncedDraft, args.onChange, mention.path);
  args.onAddMention?.(mention);
  args.setIsMentionAutocompleteOpen?.(false);
  args.setMentionQuery?.(null);
  args.textareaRef.current?.focus();
}

/* ---------- Slash command helpers ---------- */

type RunComposerSlashCommandArgs = {
  draft: string;
  slashCommandContext?: SlashCommandContext;
  onAddMention?: (mention: MentionItem) => void;
};

function runComposerRemember(args: RunComposerSlashCommandArgs): void {
  const text = args.draft.replace(/^\/remember\s*/i, '').trim();
  if (text) args.slashCommandContext?.onRemember?.(text);
}

function runComposerSpec(args: RunComposerSlashCommandArgs): void {
  const featureName = args.draft.replace(/^\/spec\s*/i, '').trim();
  if (featureName) args.slashCommandContext?.onSpec?.(featureName);
}

function runComposerSlashCommand(args: RunComposerSlashCommandArgs, cmd: SlashCommand): void {
  if (cmd.id === 'remember') return runComposerRemember(args);
  if (cmd.id === 'diff') {
    args.onAddMention?.(DIFF_MENTION);
    return;
  }
  if (cmd.id === 'spec') return runComposerSpec(args);
  cmd.action();
}

export function selectComposerSlash(
  args: {
    draft: string;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    lastSyncedDraft: React.MutableRefObject<string>;
    onChange: (value: string) => void;
    onAddMention?: (mention: MentionItem) => void;
    slashCommandContext?: SlashCommandContext;
    setSlashQuery?: React.Dispatch<React.SetStateAction<string | null>>;
    setIsSlashMenuOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  },
  cmd: SlashCommand,
): void {
  runComposerSlashCommand(
    {
      draft: args.draft,
      slashCommandContext: args.slashCommandContext,
      onAddMention: args.onAddMention,
    },
    cmd,
  );
  if (cmd.clearDraft !== false) {
    resetDraftTextarea(args.textareaRef, args.lastSyncedDraft, args.onChange);
  } else {
    replaceSlashTrigger(args.textareaRef, args.lastSyncedDraft, args.onChange, cmd.id);
  }
  args.setIsSlashMenuOpen?.(false);
  args.setSlashQuery?.(null);
  args.textareaRef.current?.focus();
}

/* ---------- Re-exports from key handlers module ---------- */
export {
  handleAutocompleteKeyDown,
  handleComposerChange,
  handleComposerKeyDown,
  handleComposerShortcutKeyDown,
} from './AgentChatComposerKeyHandlers';
