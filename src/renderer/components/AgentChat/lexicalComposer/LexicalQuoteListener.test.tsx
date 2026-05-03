/**
 * @vitest-environment jsdom
 *
 * LexicalQuoteListener.test.tsx
 *
 * Tests:
 *  (a) quote event appends text to an empty editor
 *  (b) quote event with existing text inserts at cursor (end by default)
 *  (c) event with no text detail is ignored
 */
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { cleanup, render, waitFor } from '@testing-library/react';
import { $getRoot, type LexicalEditor } from 'lexical';
import React, { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { QUOTE_EVENT_NAME } from '../quoteComposer';
import { LexicalQuoteListener } from './LexicalQuoteListener';

afterEach(() => cleanup());

const BASE_CONFIG = {
  namespace: 'TestQuote',
  theme: {},
  nodes: [],
  onError: (e: Error) => {
    throw e;
  },
};

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

function dispatchQuote(text: string): void {
  window.dispatchEvent(new CustomEvent(QUOTE_EVENT_NAME, { detail: { text } }));
}

function Harness({
  onTextChange,
  editorRef,
}: {
  onTextChange: (t: string) => void;
  editorRef: React.MutableRefObject<LexicalEditor | null>;
}): React.ReactElement {
  return (
    <LexicalComposer initialConfig={BASE_CONFIG}>
      <PlainTextPlugin
        contentEditable={
          <ContentEditable aria-label="composer" aria-multiline="true" role="textbox" />
        }
        placeholder={<div />}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <OnChangePlugin
        onChange={(state) => state.read(() => onTextChange($getRoot().getTextContent()))}
        ignoreSelectionChange
      />
      <LexicalQuoteListener />
      <EditorRefCapture editorRef={editorRef} />
    </LexicalComposer>
  );
}

describe('LexicalQuoteListener', () => {
  it('(a) quote event appends text to empty editor', async () => {
    const texts: string[] = [];
    const editorRef: React.MutableRefObject<LexicalEditor | null> = { current: null };
    render(<Harness onTextChange={(t) => texts.push(t)} editorRef={editorRef} />);
    await waitFor(() => expect(editorRef.current).not.toBeNull());

    dispatchQuote('> quoted text\n');

    await waitFor(() => {
      const last = texts[texts.length - 1];
      expect(last).toContain('> quoted text');
    });
  });

  it('(b) quote event with existing content inserts after existing text', async () => {
    const texts: string[] = [];
    const editorRef: React.MutableRefObject<LexicalEditor | null> = { current: null };
    render(<Harness onTextChange={(t) => texts.push(t)} editorRef={editorRef} />);
    await waitFor(() => expect(editorRef.current).not.toBeNull());

    // First set some content
    dispatchQuote('first quote');
    await waitFor(() => {
      const last = texts[texts.length - 1];
      expect(last).toContain('first quote');
    });

    dispatchQuote('second quote');
    await waitFor(() => {
      const last = texts[texts.length - 1];
      expect(last).toContain('first quote');
      expect(last).toContain('second quote');
    });
  });

  it('(c) event with no text detail is ignored', async () => {
    const texts: string[] = [];
    const editorRef: React.MutableRefObject<LexicalEditor | null> = { current: null };
    render(<Harness onTextChange={(t) => texts.push(t)} editorRef={editorRef} />);
    await waitFor(() => expect(editorRef.current).not.toBeNull());

    const initialCount = texts.length;
    window.dispatchEvent(new CustomEvent(QUOTE_EVENT_NAME, { detail: {} }));
    window.dispatchEvent(new CustomEvent(QUOTE_EVENT_NAME, { detail: null }));

    await new Promise((r) => setTimeout(r, 30));
    // No new text change events should have fired
    expect(texts.length).toBe(initialCount);
  });
});
