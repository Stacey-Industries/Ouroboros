/**
 * @vitest-environment jsdom
 *
 * LexicalMentionMenuItem.test.tsx — smoke tests for the custom
 * BeautifulMentionsPlugin menu item component.
 */
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { LexicalMentionMenuItem } from './LexicalMentionMenuItem';

afterEach(() => cleanup());

function makeItem(
  overrides: Partial<{
    trigger: string;
    value: string;
    displayValue: string;
    data: Record<string, string | number | boolean | null>;
  }> = {},
) {
  return {
    trigger: '@',
    value: 'src/lib/fileUtils.ts',
    displayValue: 'src/lib/fileUtils.ts',
    ...overrides,
  };
}

describe('LexicalMentionMenuItem', () => {
  it('renders the displayValue text', () => {
    render(
      <ul>
        <LexicalMentionMenuItem
          selected={false}
          item={makeItem({ displayValue: 'src/lib/fileUtils.ts' })}
          label=""
          itemValue=""
        />
      </ul>,
    );
    expect(screen.getByText('src/lib/fileUtils.ts')).toBeDefined();
  });

  it('applies bg-surface-overlay class when selected', () => {
    const { container } = render(
      <ul>
        <LexicalMentionMenuItem selected={true} item={makeItem()} label="" itemValue="" />
      </ul>,
    );
    const li = container.querySelector('li');
    expect(li?.className).toContain('bg-surface-overlay');
  });

  it('does NOT apply bg-surface-overlay when not selected', () => {
    const { container } = render(
      <ul>
        <LexicalMentionMenuItem selected={false} item={makeItem()} label="" itemValue="" />
      </ul>,
    );
    const li = container.querySelector('li');
    expect(li?.className).not.toContain('bg-surface-overlay');
  });

  it('shows line number when startLine >= 0 in data', () => {
    render(
      <ul>
        <LexicalMentionMenuItem
          selected={false}
          item={makeItem({
            data: {
              mentionType: 'symbol',
              startLine: 42,
              endLine: 60,
              symbolType: 'function',
              mentionKey: 'k',
              mentionLabel: 'l',
              mentionPath: 'p',
              estimatedTokens: 100,
            },
            displayValue: 'parseConfig',
          })}
          label=""
          itemValue=""
        />
      </ul>,
    );
    expect(screen.getByText(':42')).toBeDefined();
  });

  it('does not show line number when startLine is -1', () => {
    render(
      <ul>
        <LexicalMentionMenuItem
          selected={false}
          item={makeItem({
            data: {
              mentionType: 'file',
              startLine: -1,
              endLine: -1,
              symbolType: '',
              mentionKey: 'k',
              mentionLabel: 'l',
              mentionPath: 'p',
              estimatedTokens: 100,
            },
          })}
          label=""
          itemValue=""
        />
      </ul>,
    );
    expect(screen.queryByText(/^:\d+$/)).toBeNull();
  });

  it('renders a folder icon for folder type', () => {
    const { container } = render(
      <ul>
        <LexicalMentionMenuItem
          selected={false}
          item={makeItem({
            data: {
              mentionType: 'folder',
              startLine: -1,
              endLine: -1,
              symbolType: '',
              mentionKey: 'k',
              mentionLabel: 'l',
              mentionPath: 'p',
              estimatedTokens: 100,
            },
            displayValue: 'src/lib/',
          })}
          label=""
          itemValue=""
        />
      </ul>,
    );
    // folder icon has a path with M22 19
    const svgPath = container.querySelector('svg path[d^="M22 19"]');
    expect(svgPath).not.toBeNull();
  });
});
