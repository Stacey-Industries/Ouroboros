/**
 * @vitest-environment jsdom
 *
 * LexicalMentionMenu.test.tsx — smoke tests for the menuComponent wrapper.
 *
 * Verifies:
 *  (a) renders a <ul> with the above-cursor positioning classes (bottom-full)
 *  (b) does NOT forward the library-internal `loading` prop to the DOM
 *  (c) forwards aria-* and other valid attributes
 *  (d) renders children (menu items)
 */
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { LexicalMentionMenu } from './LexicalMentionMenu';

afterEach(() => cleanup());

describe('LexicalMentionMenu', () => {
  it('(a) renders a <ul> positioned above the cursor (bottom-full)', () => {
    const { container } = render(
      <LexicalMentionMenu loading={false} aria-label="test" role="menu" />,
    );
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
    expect(ul?.className).toContain('absolute');
    expect(ul?.className).toContain('bottom-full');
    expect(ul?.className).toContain('z-50');
  });

  it('(b) does NOT forward the loading prop to the DOM element', () => {
    const { container } = render(
      <LexicalMentionMenu loading={true} aria-label="test" role="menu" />,
    );
    const ul = container.querySelector('ul');
    expect(ul?.hasAttribute('loading')).toBe(false);
  });

  it('(c) forwards aria-* and role attributes to the DOM', () => {
    const { container } = render(
      <LexicalMentionMenu
        loading={false}
        aria-label="Choose a mention"
        aria-hidden="false"
        role="menu"
      />,
    );
    const ul = container.querySelector('ul');
    expect(ul?.getAttribute('aria-label')).toBe('Choose a mention');
    expect(ul?.getAttribute('role')).toBe('menu');
  });

  it('(d) renders children passed in', () => {
    const { container } = render(
      <LexicalMentionMenu loading={false} aria-label="test" role="menu">
        <li data-testid="item-1">item one</li>
        <li data-testid="item-2">item two</li>
      </LexicalMentionMenu>,
    );
    expect(container.querySelector('[data-testid="item-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="item-2"]')).not.toBeNull();
  });
});
