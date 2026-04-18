/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => cleanup());

import { MonacoMobileChrome } from './MonacoMobileChrome';

describe('MonacoMobileChrome', () => {
  it('renders a disabled "Open in desktop" button', () => {
    render(<MonacoMobileChrome />);
    const btn = screen.getByRole('button', { name: /open in desktop/i });
    expect(btn).toBeDefined();
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('button has the correct title attribute', () => {
    render(<MonacoMobileChrome />);
    const btn = screen.getByTitle('Desktop mode required');
    expect(btn).toBeDefined();
  });
});
