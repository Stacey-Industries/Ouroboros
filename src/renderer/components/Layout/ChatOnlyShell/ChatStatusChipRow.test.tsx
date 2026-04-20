/**
 * @vitest-environment jsdom
 *
 * ChatStatusChipRow tests — Wave 44 Phase D.
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Stub ChatOnlyHeaderControls so this test focuses on the strip wrapper.
vi.mock('./ChatOnlyHeaderControls', () => ({
  ChatOnlyHeaderControls: () => <div data-testid="stub-header-controls">chips</div>,
}));

import { ChatStatusChipRow } from './ChatStatusChipRow';

afterEach(() => cleanup());

describe('ChatStatusChipRow', () => {
  it('renders the chip strip container', () => {
    render(<ChatStatusChipRow />);
    expect(screen.getByTestId('chat-status-chip-row')).toBeTruthy();
  });

  it('mounts ChatOnlyHeaderControls inside the strip', () => {
    render(<ChatStatusChipRow />);
    expect(screen.getByTestId('stub-header-controls')).toBeTruthy();
  });

  it('uses thin strip layout classes (px-4, flex, text-xs)', () => {
    render(<ChatStatusChipRow />);
    const strip = screen.getByTestId('chat-status-chip-row');
    expect(strip.className).toContain('px-4');
    expect(strip.className).toContain('flex');
    expect(strip.className).toContain('text-xs');
  });
});
