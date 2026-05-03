/**
 * @vitest-environment jsdom
 *
 * LexicalDropPlugin.test.tsx
 *
 * Tests:
 *  (a) buildMentionFromDropJson — file payload parses correctly
 *  (b) buildMentionFromDropJson — directory payload sets type: 'folder'
 *  (c) buildMentionFromDropJson — relativePath preferred over path
 *  (d) buildMentionFromDropJson — invalid JSON returns null
 *  (e) buildMentionFromDropJson — missing path field returns null
 *  (f) LexicalDropPlugin mounts inside composer without throwing
 */
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { cleanup, render } from '@testing-library/react';
import { BeautifulMentionNode, BeautifulMentionsPlugin } from 'lexical-beautiful-mentions';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildMentionFromDropJson, LexicalDropPlugin } from './LexicalDropPlugin';

afterEach(() => cleanup());

const BASE_CONFIG = {
  namespace: 'TestDrop',
  theme: {},
  nodes: [BeautifulMentionNode],
  onError: (e: Error) => {
    throw e;
  },
};

function Harness(): React.ReactElement {
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
      <LexicalDropPlugin />
    </LexicalComposer>
  );
}

describe('buildMentionFromDropJson', () => {
  it('(a) file payload parses correctly', () => {
    const json = JSON.stringify({
      path: 'src/utils/foo.ts',
      name: 'foo.ts',
      isDirectory: false,
    });
    const result = buildMentionFromDropJson(json);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('file');
    expect(result!.path).toBe('src/utils/foo.ts');
    expect(result!.label).toBe('foo.ts');
    expect(result!.key).toBe('@file:src/utils/foo.ts');
    expect(result!.estimatedTokens).toBe(500);
  });

  it('(b) directory payload sets type: folder', () => {
    const json = JSON.stringify({
      path: 'src/utils',
      name: 'utils',
      isDirectory: true,
    });
    const result = buildMentionFromDropJson(json);
    expect(result!.type).toBe('folder');
    expect(result!.estimatedTokens).toBe(5000);
  });

  it('(c) relativePath preferred over path when present', () => {
    const json = JSON.stringify({
      path: '/absolute/src/utils/foo.ts',
      relativePath: 'src/utils/foo.ts',
      name: 'foo.ts',
      isDirectory: false,
    });
    const result = buildMentionFromDropJson(json);
    expect(result!.path).toBe('src/utils/foo.ts');
  });

  it('(d) invalid JSON returns null', () => {
    expect(buildMentionFromDropJson('not-json')).toBeNull();
  });

  it('(e) missing path field returns null', () => {
    expect(buildMentionFromDropJson(JSON.stringify({ name: 'foo' }))).toBeNull();
  });
});

describe('LexicalDropPlugin', () => {
  it('(f) mounts inside LexicalComposer without throwing', () => {
    // BeautifulMentionsPlugin is required for useBeautifulMentions context.
    const consoleSpy = vi.spyOn(console, 'error');
    expect(() => render(<Harness />)).not.toThrow();
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
