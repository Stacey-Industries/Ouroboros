/**
 * @vitest-environment jsdom
 *
 * LexicalImagePastePlugin.test.tsx
 *
 * Tests:
 *  (a) Image-only paste — onImagePaste called with the image File
 *  (b) Text-only paste — onImagePaste NOT called (returns false, text falls through)
 *  (c) Mixed paste (text + image) — onImagePaste called with only the image file
 */
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { LexicalEditor } from 'lexical';
import { PASTE_COMMAND } from 'lexical';
import React, { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LexicalImagePastePlugin } from './LexicalImagePastePlugin';

afterEach(() => cleanup());

const BASE_CONFIG = {
  namespace: 'TestPaste',
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

function makeDataTransferItem(type: string, file?: File): DataTransferItem {
  return {
    type,
    kind: file ? 'file' : 'string',
    getAsFile: () => file ?? null,
    getAsString: vi.fn(),
    webkitGetAsEntry: vi.fn(),
  } as unknown as DataTransferItem;
}

function makeClipboardEvent(items: DataTransferItem[]): ClipboardEvent {
  const dt = {
    items: items as unknown as DataTransferItemList,
    getData: vi.fn(),
    types: items.map((i) => i.type),
  } as unknown as DataTransfer;
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', { value: dt, writable: false });
  return event;
}

function makeImageFile(name = 'test.png'): File {
  return new File([''], name, { type: 'image/png' });
}

function Harness({
  onImagePaste,
  editorRef,
}: {
  onImagePaste: (files: File[]) => void;
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
      <LexicalImagePastePlugin onImagePaste={onImagePaste} />
      <EditorRefCapture editorRef={editorRef} />
    </LexicalComposer>
  );
}

describe('LexicalImagePastePlugin', () => {
  it('(a) image-only paste — onImagePaste called with the image file', async () => {
    const onImagePaste = vi.fn();
    const editorRef: React.MutableRefObject<LexicalEditor | null> = { current: null };

    render(<Harness onImagePaste={onImagePaste} editorRef={editorRef} />);
    await waitFor(() => expect(editorRef.current).not.toBeNull());

    const imageFile = makeImageFile('screenshot.png');
    const event = makeClipboardEvent([makeDataTransferItem('image/png', imageFile)]);

    editorRef.current!.dispatchCommand(PASTE_COMMAND, event);

    await waitFor(() => {
      expect(onImagePaste).toHaveBeenCalledOnce();
      expect(onImagePaste).toHaveBeenCalledWith([imageFile]);
    });
  });

  it('(b) text-only paste — onImagePaste NOT called', async () => {
    const onImagePaste = vi.fn();
    const editorRef: React.MutableRefObject<LexicalEditor | null> = { current: null };

    render(<Harness onImagePaste={onImagePaste} editorRef={editorRef} />);
    await waitFor(() => expect(editorRef.current).not.toBeNull());

    const textItem = makeDataTransferItem('text/plain');
    const event = makeClipboardEvent([textItem]);

    editorRef.current!.dispatchCommand(PASTE_COMMAND, event);

    // Allow a tick for any async handling
    await new Promise((r) => setTimeout(r, 10));
    expect(onImagePaste).not.toHaveBeenCalled();
  });

  it('(c) mixed paste (text + image) — onImagePaste called with only the image file', async () => {
    const onImagePaste = vi.fn();
    const editorRef: React.MutableRefObject<LexicalEditor | null> = { current: null };

    render(<Harness onImagePaste={onImagePaste} editorRef={editorRef} />);
    await waitFor(() => expect(editorRef.current).not.toBeNull());

    const imageFile = makeImageFile('photo.jpg');
    const event = makeClipboardEvent([
      makeDataTransferItem('text/plain'),
      makeDataTransferItem('image/jpeg', imageFile),
    ]);

    editorRef.current!.dispatchCommand(PASTE_COMMAND, event);

    await waitFor(() => {
      expect(onImagePaste).toHaveBeenCalledOnce();
      expect(onImagePaste).toHaveBeenCalledWith([imageFile]);
    });
  });
});
