/**
 * @vitest-environment jsdom
 *
 * AppLayout DnD integration — Wave 28 Phase B.
 * Verifies that DroppableSlot wrappers are present in the tree when the
 * layout.dragAndDrop flag is on, and absent when it is off.
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileLayoutProvider } from '../../contexts/MobileLayoutContext';

// ---------------------------------------------------------------------------
// Mock heavy sub-components and hooks that need Electron / xterm / Monaco
// ---------------------------------------------------------------------------
vi.mock('../../hooks/useConfig', () => ({ useConfig: vi.fn() }));
vi.mock('../../contexts/FocusContext', () => ({
  useFocusPanel: vi.fn(() => ({ setFocusedPanel: vi.fn(), focusRingStyle: () => undefined })),
  FocusProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
vi.mock('./usePanelCollapse', () => ({
  usePanelCollapse: vi.fn(() => ({
    collapsed: { leftSidebar: false, rightSidebar: false, terminal: false, editor: false },
    toggle: vi.fn(),
    expand: vi.fn(),
    collapse: vi.fn(),
    applyState: vi.fn(),
  })),
}));
vi.mock('./useResizable', () => ({
  useResizable: vi.fn(() => ({
    sizes: { leftSidebar: 220, rightSidebar: 300, terminal: 280 },
    startResize: vi.fn(),
    resetSize: vi.fn(),
    applySizes: vi.fn(),
  })),
}));
vi.mock('./TitleBar', () => ({ TitleBar: () => null }));
vi.mock('./Sidebar', () => ({ Sidebar: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));
vi.mock('./CentrePane', () => ({ CentrePane: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));
vi.mock('./TerminalPane', () => ({ TerminalPane: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));
vi.mock('./AgentMonitorPane', () => ({ AgentMonitorPane: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));
vi.mock('./ResizeDivider', () => ({ ResizeDivider: () => null }));
vi.mock('./StatusBar', () => ({ StatusBar: () => null }));
vi.mock('./AppLayout.mobile', () => ({
  MobileNavBar: () => null,
  MOBILE_NAV_ITEMS: [
    { id: 'files', label: 'Files' },
    { id: 'editor', label: 'Editor' },
    { id: 'terminal', label: 'Terminal' },
    { id: 'chat', label: 'Chat' },
  ],
}));
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: React.PropsWithChildren) => <>{children}</>,
  DragOverlay: () => null,
  PointerSensor: class PointerSensor {},
  TouchSensor: class TouchSensor {},
  KeyboardSensor: class KeyboardSensor {},
  useSensor: vi.fn((Cls) => ({ sensor: Cls })),
  useSensors: vi.fn((...s: unknown[]) => s),
  useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
  useDraggable: vi.fn(() => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), isDragging: false })),
}));

vi.mock('@dnd-kit/sortable', () => ({
  sortableKeyboardCoordinates: vi.fn(),
}));
vi.mock('./layoutPresets/LayoutPresetResolver', () => ({
  useLayoutPreset: vi.fn(() => ({
    preset: { id: 'ide-primary', name: 'IDE', slots: {}, panelSizes: {}, visiblePanels: {} },
    swapSlots: vi.fn(),
  })),
}));

import React from 'react';

import { useConfig } from '../../hooks/useConfig';
import type { AppLayoutProps } from './AppLayout';
import { AppLayout } from './AppLayout';

const mockUseConfig = vi.mocked(useConfig);

function mockConfig(dragAndDrop: boolean): void {
  mockUseConfig.mockReturnValue({
    config: { layout: { dragAndDrop } } as never,
    isLoading: false,
    error: null,
    set: vi.fn(),
    refresh: vi.fn(),
  });
}

const baseProps: AppLayoutProps = {
  terminalControl: {
    sessions: [],
    activeSessionId: null,
    onActivate: vi.fn(),
    onClose: vi.fn(),
    onNew: vi.fn(),
    onNewClaude: vi.fn(),
    onNewCodex: vi.fn(),
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithMobile(): ReturnType<typeof render> {
  return render(
    <MobileLayoutProvider>
      <AppLayout {...baseProps} />
    </MobileLayoutProvider>,
  );
}

describe('AppLayout DnD integration', () => {
  it('renders DroppableSlot wrappers when layout.dragAndDrop is true', () => {
    mockConfig(true);
    const { container } = renderWithMobile();
    const slots = container.querySelectorAll('[data-droppable-slot]');
    expect(slots.length).toBeGreaterThan(0);
  });

  it('does not render DroppableSlot wrappers when layout.dragAndDrop is false', () => {
    mockConfig(false);
    const { container } = renderWithMobile();
    const slots = container.querySelectorAll('[data-droppable-slot]');
    expect(slots.length).toBe(0);
  });

  it('renders the correct slot names as data attributes when DnD is on', () => {
    mockConfig(true);
    const { container } = renderWithMobile();
    const slotNames = Array.from(container.querySelectorAll('[data-droppable-slot]'))
      .map((el) => el.getAttribute('data-droppable-slot'));
    expect(slotNames).toContain('editorContent');
    expect(slotNames).toContain('terminalContent');
    expect(slotNames).toContain('agentCards');
  });
});
