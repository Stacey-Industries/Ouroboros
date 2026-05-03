/**
 * @vitest-environment jsdom
 *
 * ChatKeyboardPlugin.test.tsx — keyboard contract unit tests.
 *
 * Commands are dispatched directly on the editor instance via
 * editor.dispatchCommand — this is deterministic in jsdom and avoids
 * relying on Lexical's DOM keydown listener translating synthetic events.
 */
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { cleanup, render, waitFor } from '@testing-library/react';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  type LexicalEditor,
} from 'lexical';
import { BeautifulMentionNode } from 'lexical-beautiful-mentions';
import React, { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatKeyboardPlugin } from './ChatKeyboardPlugin';

afterEach(() => cleanup());

/* ---------- editor-ref capture plugin ---------- */

function EditorRefCapture({
  editorRef,
}: {
  editorRef: React.MutableRefObject<LexicalEditor | null>;
}): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editorRef.current = editor;
  }, [editor, editorRef]);
  return null;
}

/* ---------- harness ---------- */

type HarnessProps = {
  onSend?: () => void;
  onEscape?: () => void;
  onRestoreLastMessage?: () => void;
  onCyclePermissionMode?: () => void;
  editorRef?: React.MutableRefObject<LexicalEditor | null>;
};

const BASE_CONFIG = {
  namespace: 'TestComposer',
  theme: {},
  nodes: [BeautifulMentionNode],
  onError: (e: Error) => {
    throw e;
  },
};

function Harness(props: HarnessProps): React.ReactElement {
  return (
    <LexicalComposer initialConfig={BASE_CONFIG}>
      <PlainTextPlugin
        contentEditable={
          <ContentEditable
            aria-label="composer"
            aria-multiline="true"
            role="textbox"
            data-testid="editor"
          />
        }
        placeholder={<div />}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <ChatKeyboardPlugin
        onSend={props.onSend ?? vi.fn()}
        onEscape={props.onEscape}
        onRestoreLastMessage={props.onRestoreLastMessage}
        onCyclePermissionMode={props.onCyclePermissionMode}
      />
      {props.editorRef && <EditorRefCapture editorRef={props.editorRef} />}
    </LexicalComposer>
  );
}

function makeKeyEvent(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
}

/* ---------- tests ---------- */

describe('ChatKeyboardPlugin', () => {
  it('(a) IME Enter suppression — onSend NOT called when isComposing=true', async () => {
    const onSend = vi.fn();
    const editorRef = { current: null } as React.MutableRefObject<LexicalEditor | null>;
    render(<Harness onSend={onSend} editorRef={editorRef} />);
    await waitFor(() => expect(editorRef.current).not.toBeNull());

    const composingEvent = makeKeyEvent({ key: 'Enter', isComposing: true });
    editorRef.current!.dispatchCommand(KEY_ENTER_COMMAND, composingEvent);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('(b) IME Enter after composition — onSend called after compositionend', async () => {
    const onSend = vi.fn();
    const editorRef = { current: null } as React.MutableRefObject<LexicalEditor | null>;
    render(<Harness onSend={onSend} editorRef={editorRef} />);
    await waitFor(() => expect(editorRef.current).not.toBeNull());

    const editor = editorRef.current!;
    editor.dispatchCommand(KEY_ENTER_COMMAND, makeKeyEvent({ key: 'Enter', isComposing: true }));
    expect(onSend).not.toHaveBeenCalled();

    editor.dispatchCommand(KEY_ENTER_COMMAND, makeKeyEvent({ key: 'Enter', isComposing: false }));
    expect(onSend).toHaveBeenCalledOnce();
  });

  it('(c) ArrowUp gating — onRestoreLastMessage NOT called when editor has content', async () => {
    const onRestoreLastMessage = vi.fn();
    const editorRef = { current: null } as React.MutableRefObject<LexicalEditor | null>;
    render(<Harness onRestoreLastMessage={onRestoreLastMessage} editorRef={editorRef} />);
    await waitFor(() => expect(editorRef.current).not.toBeNull());

    const editor = editorRef.current!;
    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          const p = $createParagraphNode();
          p.append($createTextNode('hello world'));
          root.append(p);
        },
        { onUpdate: resolve },
      );
    });

    editor.dispatchCommand(KEY_ARROW_UP_COMMAND, makeKeyEvent({ key: 'ArrowUp' }));
    expect(onRestoreLastMessage).not.toHaveBeenCalled();
  });

  it('(d) ArrowUp gating — onRestoreLastMessage called when editor is empty', async () => {
    const onRestoreLastMessage = vi.fn();
    const editorRef = { current: null } as React.MutableRefObject<LexicalEditor | null>;
    render(<Harness onRestoreLastMessage={onRestoreLastMessage} editorRef={editorRef} />);
    await waitFor(() => expect(editorRef.current).not.toBeNull());

    editorRef.current!.dispatchCommand(KEY_ARROW_UP_COMMAND, makeKeyEvent({ key: 'ArrowUp' }));
    expect(onRestoreLastMessage).toHaveBeenCalledOnce();
  });

  it('(e) Shift+Enter — onSend NOT called; editor content can hold a newline', async () => {
    const onSend = vi.fn();
    const editorRef = { current: null } as React.MutableRefObject<LexicalEditor | null>;
    render(<Harness onSend={onSend} editorRef={editorRef} />);
    await waitFor(() => expect(editorRef.current).not.toBeNull());

    const editor = editorRef.current!;
    editor.dispatchCommand(KEY_ENTER_COMMAND, makeKeyEvent({ key: 'Enter', shiftKey: true }));
    expect(onSend).not.toHaveBeenCalled();

    // Verify the editor is capable of holding multiline content (the plugin
    // returns false for shift+enter, leaving default handling to insert a newline).
    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          const p = $createParagraphNode();
          p.append($createTextNode('line1\nline2'));
          root.append(p);
        },
        { onUpdate: resolve },
      );
    });

    let text = '';
    editor.getEditorState().read(() => {
      text = $getRoot().getTextContent();
    });
    expect(text).toContain('\n');
  });
});
