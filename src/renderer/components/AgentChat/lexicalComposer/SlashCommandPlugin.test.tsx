/**
 * @vitest-environment jsdom
 *
 * SlashCommandPlugin.test.tsx — unit tests for the slash-command Lexical plugin.
 *
 * Tests:
 *  (a) Detect / at start of empty editor → isOpen: true, query: ''
 *  (b) Detect /cmd partial query → isOpen: true, query: 'cle'
 *  (c) No match for slash mid-word (foo/bar) → isOpen: false, query: null
 *  (d) Mixed @user /clear cursor positions — correct state per cursor
 *  (e) Multi-paragraph cursor offset (Risk 9.5) — slash in para 2 detected
 *      via absolute root offset, not local paragraph offset
 */
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { cleanup, render, waitFor } from '@testing-library/react';
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from 'lexical';
import { BeautifulMentionNode } from 'lexical-beautiful-mentions';
import React, { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SlashState } from './SlashCommandPlugin';
import { SlashCommandPlugin } from './SlashCommandPlugin';

afterEach(() => cleanup());

/* ---------- fixtures ---------- */

const BASE_CONFIG = {
  namespace: 'TestSlash',
  theme: {},
  nodes: [BeautifulMentionNode],
  onError: (e: Error) => {
    throw e;
  },
};

/* ---------- EditorRefCapture ---------- */

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

/* ---------- Harness ---------- */

type HarnessProps = {
  onSlashStateChange: (state: SlashState) => void;
  editorRef: React.MutableRefObject<LexicalEditor | null>;
};

function Harness({ onSlashStateChange, editorRef }: HarnessProps): React.ReactElement {
  return (
    <LexicalComposer initialConfig={BASE_CONFIG}>
      <PlainTextPlugin
        contentEditable={
          <ContentEditable aria-label="composer" aria-multiline="true" role="textbox" />
        }
        placeholder={<div />}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <SlashCommandPlugin
        onSlashStateChange={onSlashStateChange}
        slashCommands={[]}
        draft=""
        onChange={vi.fn()}
      />
      <EditorRefCapture editorRef={editorRef} />
    </LexicalComposer>
  );
}

/* ---------- editor helpers ---------- */

/**
 * Sets the editor content to `text` and moves the cursor to `cursorOffset`
 * in the root's getTextContent() space.  Supports single-paragraph only.
 */
function setTextAndCursor(
  editor: LexicalEditor,
  text: string,
  cursorOffset: number,
): Promise<void> {
  return new Promise<void>((resolve) => {
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const p = $createParagraphNode();
        const node = $createTextNode(text);
        p.append(node);
        root.append(p);
        node.select(cursorOffset, cursorOffset);
      },
      { onUpdate: resolve },
    );
  });
}

/**
 * Creates two paragraphs (para1Text + \n + para2Text) and places the cursor
 * at `para2Offset` characters into para2.
 */
function setTwoParagraphs(
  editor: LexicalEditor,
  para1Text: string,
  para2Text: string,
  para2Offset: number,
): Promise<void> {
  return new Promise<void>((resolve) => {
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const p1 = $createParagraphNode();
        p1.append($createTextNode(para1Text));
        const p2 = $createParagraphNode();
        const node2 = $createTextNode(para2Text);
        p2.append(node2);
        root.append(p1);
        root.append(p2);
        node2.select(para2Offset, para2Offset);
      },
      { onUpdate: resolve },
    );
  });
}

/**
 * Moves the cursor in the current editor state to `para1Offset` chars into
 * the first paragraph's text node (assumes first para has one text node).
 */
function moveCursorToPara1(editor: LexicalEditor, para1Offset: number): Promise<void> {
  return new Promise<void>((resolve) => {
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = root.getFirstChild();
        if (!p1) return;
        const textNode = (p1 as ReturnType<typeof $createParagraphNode>).getFirstChild();
        if (!textNode) return;
        // Select within the text node at the given offset
        (textNode as ReturnType<typeof $createTextNode>).select(para1Offset, para1Offset);
      },
      { onUpdate: resolve },
    );
  });
}

/* ---------- tests ---------- */

describe('SlashCommandPlugin', () => {
  it('(a) detects / at start of empty editor — isOpen: true, query: empty string', async () => {
    const onSlashStateChange = vi.fn<[SlashState], void>();
    const editorRef: React.MutableRefObject<LexicalEditor | null> = { current: null };

    render(<Harness onSlashStateChange={onSlashStateChange} editorRef={editorRef} />);
    await waitFor(() => expect(editorRef.current).not.toBeNull());

    await setTextAndCursor(editorRef.current!, '/', 1);

    await waitFor(() => {
      const calls = onSlashStateChange.mock.calls;
      const last = calls[calls.length - 1][0];
      expect(last.isOpen).toBe(true);
      expect(last.query).toBe('');
    });
  });

  it('(b) detects /cle partial query — isOpen: true, query: "cle"', async () => {
    const onSlashStateChange = vi.fn<[SlashState], void>();
    const editorRef: React.MutableRefObject<LexicalEditor | null> = { current: null };

    render(<Harness onSlashStateChange={onSlashStateChange} editorRef={editorRef} />);
    await waitFor(() => expect(editorRef.current).not.toBeNull());

    await setTextAndCursor(editorRef.current!, '/cle', 4);

    await waitFor(() => {
      const calls = onSlashStateChange.mock.calls;
      const last = calls[calls.length - 1][0];
      expect(last.isOpen).toBe(true);
      expect(last.query).toBe('cle');
    });
  });

  it('(c) no match for slash mid-word (foo/bar) — isOpen: false', async () => {
    const onSlashStateChange = vi.fn<[SlashState], void>();
    const editorRef: React.MutableRefObject<LexicalEditor | null> = { current: null };

    render(<Harness onSlashStateChange={onSlashStateChange} editorRef={editorRef} />);
    await waitFor(() => expect(editorRef.current).not.toBeNull());

    // cursor after 'r' in 'foo/bar'
    await setTextAndCursor(editorRef.current!, 'foo/bar', 7);

    await waitFor(() => {
      const calls = onSlashStateChange.mock.calls;
      const last = calls[calls.length - 1][0];
      expect(last.isOpen).toBe(false);
      expect(last.query).toBeNull();
    });
  });

  it('(d) mixed @user /clear — correct state per cursor position', async () => {
    const onSlashStateChange = vi.fn<[SlashState], void>();
    const editorRef: React.MutableRefObject<LexicalEditor | null> = { current: null };

    render(<Harness onSlashStateChange={onSlashStateChange} editorRef={editorRef} />);
    await waitFor(() => expect(editorRef.current).not.toBeNull());

    // Cursor after '@user' (position 5) — no slash match
    await setTextAndCursor(editorRef.current!, '@user /cl', 5);
    await waitFor(() => {
      const calls = onSlashStateChange.mock.calls;
      const last = calls[calls.length - 1][0];
      expect(last.isOpen).toBe(false);
    });

    // Cursor at end, after '/cl' (position 9) — slash match
    await setTextAndCursor(editorRef.current!, '@user /cl', 9);
    await waitFor(() => {
      const calls = onSlashStateChange.mock.calls;
      const last = calls[calls.length - 1][0];
      expect(last.isOpen).toBe(true);
      expect(last.query).toBe('cl');
    });
  });

  it('(e) multi-paragraph cursor offset (Risk 9.5) — slash in para 2 detected at absolute offset', async () => {
    const onSlashStateChange = vi.fn<[SlashState], void>();
    const editorRef: React.MutableRefObject<LexicalEditor | null> = { current: null };

    render(<Harness onSlashStateChange={onSlashStateChange} editorRef={editorRef} />);
    await waitFor(() => expect(editorRef.current).not.toBeNull());

    // Para 1: "hello" (5 chars), Para 2: "/cmd" (4 chars)
    // $getRoot().getTextContent() = "hello\n\n/cmd" — Lexical inserts DOUBLE_LINE_BREAK
    // ('\n\n', 2 chars) between non-last block children (verified from Lexical source).
    //
    // Cursor at para2Offset=4 (after 'd'):
    //   Absolute offset = 5 (para1) + 2 (\n\n) + 4 (para2 cursor) = 11
    //   textBeforeCursor = "hello\n\n/cmd" → lastSlash=7 → query="cmd"
    //
    // If we mistakenly used local offset (4):
    //   extractSlashQuery("hello\n\n/cmd", 4) = null (no slash at/before offset 4)
    // Correct absolute offset (11):
    //   extractSlashQuery("hello\n\n/cmd", 11) → "cmd"
    await setTwoParagraphs(editorRef.current!, 'hello', '/cmd', 4);

    await waitFor(() => {
      const calls = onSlashStateChange.mock.calls;
      const last = calls[calls.length - 1][0];
      // Must detect the slash in para 2 via absolute offset — not null
      expect(last.isOpen).toBe(true);
      expect(last.query).toBe('cmd');
    });

    // Also verify: cursor in para 1 (no slash) → not open
    await moveCursorToPara1(editorRef.current!, 3);
    await waitFor(() => {
      const calls = onSlashStateChange.mock.calls;
      const last = calls[calls.length - 1][0];
      expect(last.isOpen).toBe(false);
    });
  });
});
