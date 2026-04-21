/**
 * @vitest-environment jsdom
 *
 * FloatingComposerContainer.test.tsx — Smoke + class assertion tests.
 *
 * Verifies:
 *   - Renders children without crashing.
 *   - Base Tailwind token classes are always present (floating surface design).
 *   - Drag-ring class added only when isDragging is true.
 *   - data-layout attribute is set for CSS targeting.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { FloatingComposerContainer } from './FloatingComposerContainer';

describe('FloatingComposerContainer', () => {
  it('renders children', () => {
    render(
      <FloatingComposerContainer isDragging={false}>
        <span data-testid="child">composer</span>
      </FloatingComposerContainer>,
    );
    expect(screen.getByTestId('child')).toBeDefined();
  });

  it('applies surface token classes for the floating pill', () => {
    const { container } = render(
      <FloatingComposerContainer isDragging={false}>
        <span>content</span>
      </FloatingComposerContainer>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('bg-surface-raised');
    expect(el.className).toContain('rounded-xl');
    expect(el.className).toContain('shadow-sm');
    expect(el.className).toContain('overflow-visible');
    expect(el.className).not.toContain('overflow-hidden');
  });

  it('does not apply drag ring when isDragging is false', () => {
    const { container } = render(
      <FloatingComposerContainer isDragging={false}>
        <span>content</span>
      </FloatingComposerContainer>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).not.toContain('ring-interactive-accent');
  });

  it('applies drag ring class when isDragging is true', () => {
    const { container } = render(
      <FloatingComposerContainer isDragging>
        <span>content</span>
      </FloatingComposerContainer>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('ring-interactive-accent');
  });

  it('sets data-layout attribute for CSS targeting', () => {
    const { container } = render(
      <FloatingComposerContainer isDragging={false}>
        <span>content</span>
      </FloatingComposerContainer>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.dataset.layout).toBe('floating-composer');
  });
});
