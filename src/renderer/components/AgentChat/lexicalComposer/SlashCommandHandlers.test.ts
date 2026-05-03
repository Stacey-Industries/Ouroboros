/**
 * @vitest-environment jsdom
 *
 * SlashCommandHandlers.test.ts — unit tests for the slash-command selection
 * action helpers used by SlashCommandPlugin.
 *
 * These tests exercise the pure mutation helpers (clearEditorDraft,
 * replaceWithSlashId, executeSlashSelection) against a real Lexical editor
 * instance so the editor-update paths are verified without DOM rendering.
 */
import { createEditor } from 'lexical';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SlashCommand } from '../SlashCommandMenu';
import {
  clearEditorDraft,
  executeSlashSelection,
  replaceWithSlashId,
  type SlashActionArgs,
} from './SlashCommandHandlers';

/* ---------- helpers ---------- */

function makeEditor() {
  return createEditor({
    namespace: 'test',
    theme: {},
    nodes: [],
    onError: (e) => {
      throw e;
    },
  });
}

function makeCmd(overrides: Partial<SlashCommand> = {}): SlashCommand {
  return {
    id: 'clear',
    label: 'Clear',
    description: 'Clear conversation',
    icon: '⌫',
    action: vi.fn(),
    ...overrides,
  };
}

function makeArgs(overrides: Partial<SlashActionArgs> = {}): SlashActionArgs & {
  onChange: ReturnType<typeof vi.fn>;
  onCloseSlashMenu: ReturnType<typeof vi.fn>;
} {
  return {
    editor: makeEditor(),
    draft: '',
    onChange: vi.fn(),
    onCloseSlashMenu: vi.fn(),
    ...overrides,
  };
}

/* ---------- tests ---------- */

describe('clearEditorDraft', () => {
  it('calls onChange with empty string', () => {
    const editor = makeEditor();
    const onChange = vi.fn();
    clearEditorDraft(editor, onChange);
    expect(onChange).toHaveBeenCalledWith('');
  });
});

describe('replaceWithSlashId', () => {
  it('calls onChange with the /cmdId replacement', () => {
    const editor = makeEditor();
    const onChange = vi.fn();
    replaceWithSlashId(editor, onChange, 'spec');
    expect(onChange).toHaveBeenCalledWith('/spec ');
  });

  it('includes trailing space in the replacement text', () => {
    const editor = makeEditor();
    const onChange = vi.fn();
    replaceWithSlashId(editor, onChange, 'remember');
    const [called] = (onChange as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(called.endsWith(' ')).toBe(true);
  });
});

describe('executeSlashSelection', () => {
  let onCloseSpy: ReturnType<typeof vi.fn>;
  let onChangeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onCloseSpy = vi.fn();
    onChangeSpy = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears draft and closes menu for a clearDraft command', () => {
    const cmd = makeCmd({ id: 'clear', clearDraft: undefined }); // default clearDraft
    const args = makeArgs({ onCloseSlashMenu: onCloseSpy, onChange: onChangeSpy });
    executeSlashSelection(args, cmd);
    expect(onChangeSpy).toHaveBeenCalledWith('');
    expect(onCloseSpy).toHaveBeenCalledOnce();
  });

  it('replaces draft text and closes menu when clearDraft is false', () => {
    const cmd = makeCmd({ id: 'spec', clearDraft: false, action: vi.fn() });
    const args = makeArgs({ onCloseSlashMenu: onCloseSpy, onChange: onChangeSpy });
    executeSlashSelection(args, cmd);
    expect(onChangeSpy).toHaveBeenCalledWith('/spec ');
    expect(onCloseSpy).toHaveBeenCalledOnce();
  });

  it('calls cmd.action() for generic commands', () => {
    const action = vi.fn();
    const cmd = makeCmd({ id: 'settings', action });
    const args = makeArgs({ onCloseSlashMenu: onCloseSpy });
    executeSlashSelection(args, cmd);
    expect(action).toHaveBeenCalledOnce();
  });

  it('calls slashCommandContext.onRemember with draft text for /remember', () => {
    const onRemember = vi.fn();
    const cmd = makeCmd({ id: 'remember', action: vi.fn() });
    const args = makeArgs({
      draft: '/remember save this note',
      slashCommandContext: { onRemember },
      onCloseSlashMenu: onCloseSpy,
    });
    executeSlashSelection(args, cmd);
    expect(onRemember).toHaveBeenCalledWith('save this note');
    expect(onCloseSpy).toHaveBeenCalledOnce();
  });

  it('calls onAddMention with DIFF_MENTION for /diff', () => {
    const onAddMention = vi.fn();
    const cmd = makeCmd({ id: 'diff', action: vi.fn() });
    const args = makeArgs({ onAddMention, onCloseSlashMenu: onCloseSpy });
    executeSlashSelection(args, cmd);
    expect(onAddMention).toHaveBeenCalledOnce();
    const mention = (onAddMention as ReturnType<typeof vi.fn>).mock.calls[0][0] as { type: string };
    expect(mention.type).toBe('diff');
  });

  it('calls slashCommandContext.onSpec with feature name for /spec', () => {
    const onSpec = vi.fn();
    const cmd = makeCmd({ id: 'spec', clearDraft: false, action: vi.fn() });
    const args = makeArgs({
      draft: '/spec dark mode toggle',
      slashCommandContext: { onSpec },
      onCloseSlashMenu: onCloseSpy,
    });
    executeSlashSelection(args, cmd);
    expect(onSpec).toHaveBeenCalledWith('dark mode toggle');
  });
});
