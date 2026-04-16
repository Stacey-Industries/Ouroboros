/**
 * @vitest-environment jsdom
 *
 * NoDragZone — Wave 28 Phase E
 * Verifies that pointer and touch events are stopped at capture phase so
 * dnd-kit sensors cannot initiate a drag from inside the terminal canvas.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NoDragZone } from './NoDragZone';

afterEach(() => {
  cleanup();
});

describe('NoDragZone', () => {
  it('renders children', () => {
    render(
      <NoDragZone>
        <span data-testid="ndzchild-renders">terminal</span>
      </NoDragZone>,
    );
    expect(screen.getByTestId('ndzchild-renders')).toBeTruthy();
  });

  it('stops pointerdown propagation so dnd-kit PointerSensor cannot start a drag', () => {
    const parentHandler = vi.fn();

    render(
      <div data-testid="ndz-parent-ptr" onPointerDown={parentHandler}>
        <NoDragZone>
          <span data-testid="ndzchild-ptr">content</span>
        </NoDragZone>
      </div>,
    );

    fireEvent.pointerDown(screen.getByTestId('ndzchild-ptr'));
    expect(parentHandler).not.toHaveBeenCalled();
  });

  it('stops touchstart propagation so dnd-kit TouchSensor long-press cannot start a drag', () => {
    const parentHandler = vi.fn();

    render(
      <div data-testid="ndz-parent-touch" onTouchStart={parentHandler}>
        <NoDragZone>
          <span data-testid="ndzchild-touch">content</span>
        </NoDragZone>
      </div>,
    );

    fireEvent.touchStart(screen.getByTestId('ndzchild-touch'));
    expect(parentHandler).not.toHaveBeenCalled();
  });

  it('applies full-size container style so the zone fills its parent', () => {
    const { container } = render(
      <NoDragZone>
        <span>x</span>
      </NoDragZone>,
    );
    const div = container.firstChild as HTMLElement;
    expect(div.style.height).toBe('100%');
    expect(div.style.width).toBe('100%');
  });
});
