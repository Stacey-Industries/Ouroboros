/**
 * SlashCommandHandlers.ts — pure helpers for slash-command selection actions
 * in the Lexical composer path.
 *
 * The legacy path uses selectComposerSlash / runComposerSlashCommand from
 * AgentChatComposerSupport.ts, which mutate a <textarea> ref.  These helpers
 * replicate the same logic using Lexical's editor.update() API instead.
 *
 * Kept separate from SlashCommandPlugin.tsx so the 40-line function lint rule
 * is satisfied and the mutation helpers can be tested independently.
 */
import type { LexicalEditor } from 'lexical';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';

import { DIFF_MENTION } from '../AgentChatComposerSupport';
import type { MentionItem } from '../MentionAutocomplete';
import type { SlashCommand, SlashCommandContext } from '../SlashCommandMenu';

/* ---------- types ---------- */

export type SlashActionArgs = {
  editor: LexicalEditor;
  draft: string;
  onChange: (v: string) => void;
  onAddMention?: (mention: MentionItem) => void;
  slashCommandContext?: SlashCommandContext;
  onCloseSlashMenu: () => void;
};

/* ---------- editor-mutation helpers ---------- */

export function clearEditorDraft(editor: LexicalEditor, onChange: (v: string) => void): void {
  onChange('');
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    root.append($createParagraphNode());
  });
}

export function replaceWithSlashId(
  editor: LexicalEditor,
  onChange: (v: string) => void,
  cmdId: string,
): void {
  const replacement = `/${cmdId} `;
  onChange(replacement);
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    const p = $createParagraphNode();
    p.append($createTextNode(replacement));
    root.append(p);
  });
}

/* ---------- runSlashAction — mirrors runComposerSlashCommand ---------- */

function runRemember(args: SlashActionArgs): void {
  const text = args.draft.replace(/^\/remember\s*/i, '').trim();
  if (text) args.slashCommandContext?.onRemember?.(text);
}

function runSpec(args: SlashActionArgs): void {
  const featureName = args.draft.replace(/^\/spec\s*/i, '').trim();
  if (featureName) args.slashCommandContext?.onSpec?.(featureName);
}

function runSlashAction(args: SlashActionArgs, cmd: SlashCommand): void {
  if (cmd.id === 'remember') return runRemember(args);
  if (cmd.id === 'diff') {
    args.onAddMention?.(DIFF_MENTION);
    return;
  }
  if (cmd.id === 'spec') return runSpec(args);
  cmd.action();
}

/* ---------- executeSlashSelection — full select lifecycle ---------- */

export function executeSlashSelection(args: SlashActionArgs, cmd: SlashCommand): void {
  runSlashAction(args, cmd);
  if (cmd.clearDraft !== false) {
    clearEditorDraft(args.editor, args.onChange);
  } else {
    replaceWithSlashId(args.editor, args.onChange, cmd.id);
  }
  args.onCloseSlashMenu();
}

/* ---------- executeSlashSelectionFromPlugin ---------- */

/**
 * Bridge variant called from `useSlashSelectHandler` (parent-driven select via
 * SlashCommandMenu) and from `useSlashEnter` in slashKeyboardNav.ts. Wraps the
 * positional args into the `SlashActionArgs` shape `executeSlashSelection`
 * expects. Lives here (not in SlashCommandPlugin.tsx) to avoid a circular
 * import between SlashCommandPlugin and slashKeyboardNav.
 */
export function executeSlashSelectionFromPlugin(
  editor: LexicalEditor,
  cmd: SlashCommand,
  args: {
    draft: string;
    onChange: (v: string) => void;
    onAddMention?: (mention: MentionItem) => void;
    slashCommandContext?: SlashCommandContext;
    onCloseSlashMenu: () => void;
  },
): void {
  executeSlashSelection(
    {
      editor,
      draft: args.draft,
      onChange: args.onChange,
      onAddMention: args.onAddMention,
      slashCommandContext: args.slashCommandContext,
      onCloseSlashMenu: args.onCloseSlashMenu,
    },
    cmd,
  );
}
