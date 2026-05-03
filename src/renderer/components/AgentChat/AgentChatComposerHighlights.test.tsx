/**
 * @vitest-environment jsdom
 *
 * AgentChatComposerHighlights.test.tsx — unit tests for the highlight helpers
 * used by the legacy RichTextarea path.
 */
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderHighlights } from './AgentChatComposerHighlights';

afterEach(() => cleanup());

describe('renderHighlights', () => {
  it('renders plain text with no highlighted spans', () => {
    const { container } = render(<>{renderHighlights('hello world')}</>);
    const spans = container.querySelectorAll('span');
    const highlighted = Array.from(spans).filter((s) => s.style.color !== '');
    expect(highlighted).toHaveLength(0);
    expect(container.textContent).toBe('hello world');
  });

  it('highlights a bare @mention token', () => {
    const { container } = render(<>{renderHighlights('@src/lib/utils.ts')}</>);
    const spans = container.querySelectorAll('span');
    const highlighted = Array.from(spans).filter((s) => s.style.color !== '');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].textContent).toBe('@src/lib/utils.ts');
  });

  it('highlights a bracketed @mention token with spaces', () => {
    const { container } = render(<>{renderHighlights('@[foo bar baz]')}</>);
    const spans = container.querySelectorAll('span');
    const highlighted = Array.from(spans).filter((s) => s.style.color !== '');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].textContent).toBe('@[foo bar baz]');
  });

  it('highlights a /slash token', () => {
    const { container } = render(<>{renderHighlights('/clear')}</>);
    const highlighted = Array.from(container.querySelectorAll('span')).filter(
      (s) => s.style.color !== '',
    );
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].textContent).toBe('/clear');
  });

  it('does not highlight a bare slash without a following word', () => {
    const { container } = render(<>{renderHighlights('/')}</>);
    const highlighted = Array.from(container.querySelectorAll('span')).filter(
      (s) => s.style.color !== '',
    );
    expect(highlighted).toHaveLength(0);
  });

  it('renders mixed plain + mention + slash correctly', () => {
    const { container } = render(
      <>{renderHighlights('send @src/foo.ts /clear now')}</>,
    );
    const highlighted = Array.from(container.querySelectorAll('span')).filter(
      (s) => s.style.color !== '',
    );
    expect(highlighted).toHaveLength(2);
    expect(highlighted[0].textContent).toBe('@src/foo.ts');
    expect(highlighted[1].textContent).toBe('/clear');
  });
});
