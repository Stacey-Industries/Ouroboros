/**
 * @vitest-environment jsdom
 *
 * Smoke tests for imageAttachmentSupport — verifies the pure helpers behave as
 * expected. Hook integration is covered by the legacy composer's behavior in
 * AgentChatComposerInput tests.
 */
import { describe, expect, it } from 'vitest';

import { buildMentionFromDrop, hasFileTreeData, hasImageItems } from './imageAttachmentSupport';

describe('buildMentionFromDrop', () => {
  it('returns a file MentionItem for a valid JSON payload with a file path', () => {
    const json = JSON.stringify({ path: 'src/foo.ts', name: 'foo.ts' });
    const mention = buildMentionFromDrop(json);
    expect(mention?.type).toBe('file');
    expect(mention?.path).toBe('src/foo.ts');
    expect(mention?.label).toBe('foo.ts');
  });

  it('returns a folder MentionItem when isDirectory is true', () => {
    const json = JSON.stringify({ path: 'src/foo', isDirectory: true, name: 'foo' });
    const mention = buildMentionFromDrop(json);
    expect(mention?.type).toBe('folder');
    expect(mention?.estimatedTokens).toBe(5000);
  });

  it('prefers relativePath when present', () => {
    const json = JSON.stringify({
      path: 'C:/abs/src/foo.ts',
      relativePath: 'src/foo.ts',
      name: 'foo.ts',
    });
    const mention = buildMentionFromDrop(json);
    expect(mention?.path).toBe('src/foo.ts');
  });

  it('returns null on invalid JSON', () => {
    expect(buildMentionFromDrop('not-json')).toBeNull();
  });

  it('returns null when path is missing', () => {
    expect(buildMentionFromDrop(JSON.stringify({ name: 'foo' }))).toBeNull();
  });
});

describe('hasImageItems / hasFileTreeData', () => {
  it('hasImageItems returns true when an image item is present', () => {
    const event = {
      dataTransfer: { items: [{ type: 'image/png' }, { type: 'text/plain' }] },
    } as unknown as React.DragEvent;
    expect(hasImageItems(event)).toBe(true);
  });

  it('hasImageItems returns false when no image items', () => {
    const event = {
      dataTransfer: { items: [{ type: 'text/plain' }] },
    } as unknown as React.DragEvent;
    expect(hasImageItems(event)).toBe(false);
  });

  it('hasFileTreeData returns true when application/json is in types', () => {
    const event = {
      dataTransfer: { types: ['application/json', 'text/plain'] },
    } as unknown as React.DragEvent;
    expect(hasFileTreeData(event)).toBe(true);
  });

  it('hasFileTreeData returns false when no application/json', () => {
    const event = {
      dataTransfer: { types: ['text/plain'] },
    } as unknown as React.DragEvent;
    expect(hasFileTreeData(event)).toBe(false);
  });
});
