/**
 * @vitest-environment jsdom
 *
 * EdgeDropZones — unit tests for Wave 28 Phase C.
 *
 * Verifies that four edge drop zones are rendered per slot, that each carries
 * the correct composite ID (`{slotName}:edge:{direction}`), and that the
 * accent bar appears only on the hovered edge.
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @dnd-kit/core
// ---------------------------------------------------------------------------

type UseDroppableReturn = {
  setNodeRef: ReturnType<typeof vi.fn>;
  isOver: boolean;
  over: null;
  active: null;
  rect: { current: null };
  node: { current: null };
};

const defaultDroppableReturn: UseDroppableReturn = {
  setNodeRef: vi.fn(),
  isOver: false,
  over: null,
  active: null,
  rect: { current: null },
  node: { current: null },
};

const mockUseDroppable = vi.fn((opts: { id: string }): UseDroppableReturn => {
  void opts;
  return defaultDroppableReturn;
});

vi.mock('@dnd-kit/core', () => ({
  useDroppable: (opts: { id: string }) => mockUseDroppable(opts),
  useDndContext: () => ({ active: null }),
}));

import { EdgeDropZones } from './EdgeDropZones';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('EdgeDropZones', () => {
  it('renders all four edge zones for a slot', () => {
    const { container } = render(<EdgeDropZones slotName="editorContent" />);
    const zones = container.querySelectorAll('[data-edge-drop]');
    expect(zones).toHaveLength(4);
  });

  it('assigns correct composite IDs to each edge zone', () => {
    const { container } = render(<EdgeDropZones slotName="terminalContent" />);
    const ids = Array.from(container.querySelectorAll('[data-edge-drop]')).map(
      (el) => el.getAttribute('data-edge-drop'),
    );
    expect(ids).toContain('terminalContent:edge:north');
    expect(ids).toContain('terminalContent:edge:south');
    expect(ids).toContain('terminalContent:edge:east');
    expect(ids).toContain('terminalContent:edge:west');
  });

  it('passes the composite ID string to useDroppable', () => {
    render(<EdgeDropZones slotName="sidebarContent" />);
    const calledIds = mockUseDroppable.mock.calls.map((call) => call[0].id);
    expect(calledIds).toContain('sidebarContent:edge:north');
    expect(calledIds).toContain('sidebarContent:edge:south');
    expect(calledIds).toContain('sidebarContent:edge:east');
    expect(calledIds).toContain('sidebarContent:edge:west');
  });

  it('shows accent bar on the hovered edge only', () => {
    mockUseDroppable.mockImplementation((opts: { id: string }): UseDroppableReturn => ({
      setNodeRef: vi.fn(),
      isOver: opts.id === 'editorContent:edge:north',
      over: null,
      active: null,
      rect: { current: null },
      node: { current: null },
    }));

    const { container } = render(<EdgeDropZones slotName="editorContent" />);

    const northZone = container.querySelector('[data-edge-drop="editorContent:edge:north"]');
    const southZone = container.querySelector('[data-edge-drop="editorContent:edge:south"]');

    // Accent bar is the sole child element of the hovered edge zone.
    expect(northZone?.children.length).toBe(1);
    expect(southZone?.children.length).toBe(0);
  });

  it('shows no accent bars when no edge is hovered', () => {
    mockUseDroppable.mockImplementation((opts: { id: string }): UseDroppableReturn => {
      void opts;
      return {
        setNodeRef: vi.fn(),
        isOver: false,
        over: null,
        active: null,
        rect: { current: null },
        node: { current: null },
      };
    });

    const { container } = render(<EdgeDropZones slotName="agentCards" />);
    // Each EdgeZone div has aria-hidden="true" (4 zones); accent bars are
    // children of those zones and only rendered when isOver=true.
    // With isOver=false, no zone should have any child elements.
    const zonesWithChildren = Array.from(container.querySelectorAll('[data-edge-drop]')).filter(
      (el) => el.children.length > 0,
    );
    expect(zonesWithChildren).toHaveLength(0);
  });
});
