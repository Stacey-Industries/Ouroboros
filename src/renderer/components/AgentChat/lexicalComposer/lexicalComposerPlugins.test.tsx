/**
 * @vitest-environment jsdom
 *
 * Smoke tests for extracted plugin components. Integration behavior is covered
 * by LexicalChatComposer.test.tsx; these tests verify the exports mount inside
 * a minimal Lexical harness without throwing and produce the expected DOM.
 */
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { cleanup, render, waitFor } from '@testing-library/react';
import { $getRoot } from 'lexical';
import { BeautifulMentionNode } from 'lexical-beautiful-mentions';
import React, { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ComposerEditable, DisabledPlugin, DraftSyncPlugin } from './lexicalComposerPlugins';

afterEach(() => cleanup());

const initialConfig = {
  namespace: 'PluginsTest',
  theme: {},
  nodes: [BeautifulMentionNode],
  onError: (e: Error) => {
    throw e;
  },
};

function Harness({ children }: { children: React.ReactNode }): React.ReactElement {
  return <LexicalComposer initialConfig={initialConfig}>{children}</LexicalComposer>;
}

function ReadEditorText({ onText }: { onText: (text: string) => void }): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => onText($getRoot().getTextContent()));
    });
  }, [editor, onText]);
  return null;
}

describe('lexicalComposerPlugins', () => {
  it('ComposerEditable renders with role=textbox and aria-label', () => {
    const { container } = render(
      <Harness>
        <ComposerEditable placeholderText="ask the agent" disabled={false} />
      </Harness>,
    );
    const ce = container.querySelector('[role="textbox"]');
    expect(ce).not.toBeNull();
    expect(ce?.getAttribute('aria-label')).toBe('ask the agent');
    expect(ce?.getAttribute('aria-multiline')).toBe('true');
  });

  it('ComposerEditable sets aria-disabled when disabled', () => {
    const { container } = render(
      <Harness>
        <ComposerEditable placeholderText="x" disabled={true} />
      </Harness>,
    );
    const ce = container.querySelector('[role="textbox"]');
    expect(ce?.getAttribute('aria-disabled')).toBe('true');
  });

  it('DisabledPlugin mounts without throwing', () => {
    expect(() =>
      render(
        <Harness>
          <ComposerEditable placeholderText="x" disabled={false} />
          <DisabledPlugin disabled={true} />
        </Harness>,
      ),
    ).not.toThrow();
  });

  it('DraftSyncPlugin populates the editor from draft prop', async () => {
    let observed = '';
    render(
      <Harness>
        <ComposerEditable placeholderText="x" disabled={false} />
        <DraftSyncPlugin draft="hello world" />
        <ReadEditorText onText={(t) => (observed = t)} />
      </Harness>,
    );
    await waitFor(() => expect(observed).toBe('hello world'));
  });

  it('DraftSyncPlugin mounts with empty draft without throwing', () => {
    expect(() =>
      render(
        <Harness>
          <ComposerEditable placeholderText="x" disabled={false} />
          <DraftSyncPlugin draft="" />
        </Harness>,
      ),
    ).not.toThrow();
  });
});
