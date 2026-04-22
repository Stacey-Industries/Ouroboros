/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotificationCenter } from './NotificationCenter';

afterEach(() => cleanup());

describe('NotificationCenter', () => {
  it('renders into document.body using the provided anchor rect', () => {
    const onClose = vi.fn();
    render(
      <div data-testid="host">
        <NotificationCenter
          anchorRect={{
            bottom: 42,
            right: 300,
          } as DOMRect}
          notifications={[]}
          onRemove={vi.fn()}
          onClearAll={vi.fn()}
          onClose={onClose}
        />
      </div>,
    );

    const panel = screen.getByRole('dialog', { name: 'Notification center' });
    expect(panel.parentElement).toBe(document.body);
    expect((panel as HTMLDivElement).style.position).toBe('fixed');
    expect((panel as HTMLDivElement).style.top).toBe('42px');
    expect((panel as HTMLDivElement).style.left).toBe('8px');
  });

  it('closes on outside mousedown', async () => {
    const onClose = vi.fn();
    render(
      <NotificationCenter
        anchorRect={{
          bottom: 48,
          right: 500,
        } as DOMRect}
        notifications={[]}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
        onClose={onClose}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
