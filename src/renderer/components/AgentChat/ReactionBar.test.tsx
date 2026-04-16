/**
 * ReactionBar.test.tsx
 * @vitest-environment jsdom
 *
 * Tests for ReactionBar: rendering, active state, toggle (add/remove),
 * count display, and IPC call routing.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Reaction } from '../../types/electron';
import { ReactionBar } from './ReactionBar';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockAdd = vi.fn();
const mockRemove = vi.fn();

beforeEach(() => {
  mockAdd.mockResolvedValue({ success: true, reactions: [] });
  mockRemove.mockResolvedValue({ success: true, reactions: [] });

  Object.assign(globalThis, {
    window: Object.assign(typeof window !== 'undefined' ? window : {}, {
      electronAPI: {
        agentChat: {
          addMessageReaction: mockAdd,
          removeMessageReaction: mockRemove,
        },
      },
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

function up(by?: string): Reaction {
  return { kind: '+1', at: 1000, ...(by ? { by } : {}) };
}

function down(by?: string): Reaction {
  return { kind: '-1', at: 1000, ...(by ? { by } : {}) };
}

function render_(reactions: Reaction[] = [], id = 'msg-1'): ReturnType<typeof render> {
  return render(<ReactionBar messageId={id} reactions={reactions} />);
}

// ── Smoke: renders buttons ────────────────────────────────────────────────────

describe('ReactionBar — rendering', () => {
  it('renders thumbs-up and thumbs-down buttons', () => {
    render_();
    expect(screen.getByTitle('Thumbs up')).toBeTruthy();
    expect(screen.getByTitle('Thumbs down')).toBeTruthy();
  });

  it('shows count when reactions are present', () => {
    render_([up(), up()]);
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('hides count when zero', () => {
    render_();
    expect(screen.queryByText('0')).toBeNull();
  });
});

// ── Active state ──────────────────────────────────────────────────────────────

describe('ReactionBar — active state', () => {
  it('marks thumbs-up button as pressed when +1 reaction exists', () => {
    render_([up()]);
    const btn = screen.getByTitle('Remove thumbs up');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('marks thumbs-down button as pressed when -1 reaction exists', () => {
    render_([down()]);
    const btn = screen.getByTitle('Remove thumbs down');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('neither button is active when no reactions', () => {
    render_();
    expect(screen.getByTitle('Thumbs up').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTitle('Thumbs down').getAttribute('aria-pressed')).toBe('false');
  });
});

// ── Add reaction ──────────────────────────────────────────────────────────────

describe('ReactionBar — adding reaction', () => {
  it('calls addMessageReaction with +1 when thumbs-up clicked (no prior reaction)', () => {
    render_([], 'msg-42');
    fireEvent.click(screen.getByTitle('Thumbs up'));
    expect(mockAdd).toHaveBeenCalledWith('msg-42', '+1');
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('calls addMessageReaction with -1 when thumbs-down clicked', () => {
    render_([], 'msg-7');
    fireEvent.click(screen.getByTitle('Thumbs down'));
    expect(mockAdd).toHaveBeenCalledWith('msg-7', '-1');
  });
});

// ── Remove reaction ───────────────────────────────────────────────────────────

describe('ReactionBar — removing reaction', () => {
  it('calls removeMessageReaction when already-active +1 is clicked', () => {
    render_([up()], 'msg-5');
    fireEvent.click(screen.getByTitle('Remove thumbs up'));
    expect(mockRemove).toHaveBeenCalledWith('msg-5', '+1');
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('calls removeMessageReaction when already-active -1 is clicked', () => {
    render_([down()], 'msg-6');
    fireEvent.click(screen.getByTitle('Remove thumbs down'));
    expect(mockRemove).toHaveBeenCalledWith('msg-6', '-1');
  });
});

// ── IPC reconciliation ────────────────────────────────────────────────────────

describe('ReactionBar — IPC reconciliation', () => {
  it('updates count from IPC response reactions', async () => {
    const updatedReactions: Reaction[] = [up(), up(), up()];
    mockAdd.mockResolvedValue({ success: true, reactions: updatedReactions });

    render_([]);
    fireEvent.click(screen.getByTitle('Thumbs up'));

    // Flush promises so the .then() fires
    await vi.waitFor(() => screen.getByText('3'));
    expect(screen.getByText('3')).toBeTruthy();
  });
});
