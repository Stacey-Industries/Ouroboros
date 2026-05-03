/**
 * @vitest-environment jsdom
 *
 * LexicalMentionBridge.test.tsx — unit tests for the mention bridge plugin.
 *
 * Tests:
 *  (a) addMention called when a BeautifulMentionNode is inserted
 *  (b) removeMention called when a BeautifulMentionNode is removed
 *  (c) no duplicate addMention calls for the same node
 */
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { cleanup, render, waitFor } from '@testing-library/react';
import { $createParagraphNode, $getRoot, type LexicalEditor } from 'lexical';
import {
  $createBeautifulMentionNode,
  BeautifulMentionNode,
  BeautifulMentionsPlugin,
} from 'lexical-beautiful-mentions';
import React, { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MentionItem } from '../MentionAutocomplete';
import { LexicalMentionBridge } from './LexicalMentionBridge';

afterEach(() => cleanup());

/* ---------- fixtures ---------- */

const FILE_DATA = {
  mentionKey: '@file:/project/src/lib/fileUtils.ts',
  mentionType: 'file',
  mentionLabel: 'fileUtils.ts',
  mentionPath: 'src/lib/fileUtils.ts',
  estimatedTokens: 1000,
  startLine: -1,
  endLine: -1,
  symbolType: '',
};

const EXPECTED_MENTION: MentionItem = {
  key: '@file:/project/src/lib/fileUtils.ts',
  type: 'file',
  label: 'fileUtils.ts',
  path: 'src/lib/fileUtils.ts',
  estimatedTokens: 1000,
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

const BASE_CONFIG = {
  namespace: 'TestBridge',
  theme: {},
  nodes: [BeautifulMentionNode],
  onError: (e: Error) => {
    throw e;
  },
};

type HarnessProps = {
  onAddMention: (m: MentionItem) => void;
  onRemoveMention: (key: string) => void;
  editorRef: React.MutableRefObject<LexicalEditor | null>;
};

function Harness({ onAddMention, onRemoveMention, editorRef }: HarnessProps): React.ReactElement {
  return (
    <LexicalComposer initialConfig={BASE_CONFIG}>
      <PlainTextPlugin
        contentEditable={
          <ContentEditable aria-label="composer" aria-multiline="true" role="textbox" />
        }
        placeholder={<div />}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <BeautifulMentionsPlugin triggers={['@']} onSearch={async () => []} />
      <LexicalMentionBridge addMention={onAddMention} removeMention={onRemoveMention} />
      <EditorRefCapture editorRef={editorRef} />
    </LexicalComposer>
  );
}

/* ---------- helpers ---------- */

function insertMentionNode(editor: LexicalEditor): Promise<void> {
  return new Promise<void>((resolve) => {
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const p = $createParagraphNode();
        const node = $createBeautifulMentionNode('@', 'src/lib/fileUtils.ts', FILE_DATA);
        p.append(node);
        root.append(p);
      },
      { onUpdate: resolve },
    );
  });
}

function clearEditor(editor: LexicalEditor): Promise<void> {
  return new Promise<void>((resolve) => {
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        root.append($createParagraphNode());
      },
      { onUpdate: resolve },
    );
  });
}

/* ---------- tests ---------- */

describe('LexicalMentionBridge', () => {
  it('(a) calls addMention when a BeautifulMentionNode is inserted', async () => {
    const onAddMention = vi.fn();
    const onRemoveMention = vi.fn();
    const editorRef: React.MutableRefObject<LexicalEditor | null> = { current: null };

    render(
      <Harness
        onAddMention={onAddMention}
        onRemoveMention={onRemoveMention}
        editorRef={editorRef}
      />,
    );

    await waitFor(() => expect(editorRef.current).not.toBeNull());
    await insertMentionNode(editorRef.current!);

    await waitFor(() => expect(onAddMention).toHaveBeenCalledOnce());
    const called = onAddMention.mock.calls[0][0] as MentionItem;
    expect(called.key).toBe(EXPECTED_MENTION.key);
    expect(called.type).toBe('file');
    expect(called.path).toBe(EXPECTED_MENTION.path);
  });

  it('(b) calls removeMention when a BeautifulMentionNode is removed', async () => {
    const onAddMention = vi.fn();
    const onRemoveMention = vi.fn();
    const editorRef: React.MutableRefObject<LexicalEditor | null> = { current: null };

    render(
      <Harness
        onAddMention={onAddMention}
        onRemoveMention={onRemoveMention}
        editorRef={editorRef}
      />,
    );

    await waitFor(() => expect(editorRef.current).not.toBeNull());
    await insertMentionNode(editorRef.current!);
    await waitFor(() => expect(onAddMention).toHaveBeenCalledOnce());

    await clearEditor(editorRef.current!);
    await waitFor(() => expect(onRemoveMention).toHaveBeenCalledOnce());
    expect(onRemoveMention.mock.calls[0][0]).toBe(EXPECTED_MENTION.key);
  });

  it('(c) does not call addMention twice for the same node on re-render', async () => {
    const onAddMention = vi.fn();
    const onRemoveMention = vi.fn();
    const editorRef: React.MutableRefObject<LexicalEditor | null> = { current: null };

    render(
      <Harness
        onAddMention={onAddMention}
        onRemoveMention={onRemoveMention}
        editorRef={editorRef}
      />,
    );

    await waitFor(() => expect(editorRef.current).not.toBeNull());
    await insertMentionNode(editorRef.current!);
    await waitFor(() => expect(onAddMention).toHaveBeenCalledOnce());

    // A second no-op update should not trigger a second addMention call
    await new Promise<void>((resolve) => {
      editorRef.current!.update(() => {}, { onUpdate: resolve });
    });

    expect(onAddMention).toHaveBeenCalledOnce();
  });
});
