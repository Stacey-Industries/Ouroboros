/**
 * @vitest-environment jsdom
 *
 * ChatWorkbenchOverlays — Wave 89 Phase 3 integration tests.
 *
 * Contract verified:
 * - Utility drawer OverlayDrawer is translate-x-full (hidden) when closed.
 * - Utility drawer OverlayDrawer is translate-x-0 (visible) when open.
 * - Artifact pane OverlayDrawer is translate-x-full when closed, translate-x-0 when open.
 * - Both overlays visible simultaneously (concurrent tile layout).
 * - Utility close callback fires when utility's internal close button clicked.
 * - Artifact close callback fires when artifact's internal close button clicked.
 * - Artifact container right offset equals utility width when both open (tile).
 * - Artifact container has no right offset override when utility is closed.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatWorkbenchOverlays } from './ChatWorkbenchOverlays';
import type { UseOverlayDrawerWidthsReturn } from './useOverlayDrawerWidths';

afterEach(cleanup);

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('./ChatWorkbenchUtilityDrawer', () => ({
  ChatWorkbenchUtilityDrawer: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="mock-utility-drawer">
      <button onClick={onClose} data-testid="utility-close-btn">
        Close Utility
      </button>
    </div>
  ),
}));

vi.mock('./ChatWorkbenchArtifactPane', () => ({
  ChatWorkbenchArtifactPane: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="mock-artifact-pane">
      <button onClick={onClose} data-testid="artifact-close-btn">
        Close Artifact
      </button>
    </div>
  ),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWidths(
  overrides: Partial<UseOverlayDrawerWidthsReturn> = {},
): UseOverlayDrawerWidthsReturn {
  return {
    overlayDrawerWidth: 380,
    artifactOverlayWidth: 480,
    setOverlayDrawerWidth: vi.fn(),
    setArtifactOverlayWidth: vi.fn(),
    ...overrides,
  };
}

interface RenderProps {
  utilityOpen?: boolean;
  artifactOpen?: boolean;
  overlayWidths?: UseOverlayDrawerWidthsReturn;
}

function renderOverlays({
  utilityOpen = false,
  artifactOpen = false,
  overlayWidths = makeWidths(),
}: RenderProps = {}) {
  const onCloseUtility = vi.fn();
  const onCloseArtifact = vi.fn();

  const utils = render(
    <div style={{ position: 'relative', width: 800, height: 600 }}>
      <ChatWorkbenchOverlays
        utilityOpen={utilityOpen}
        artifactOpen={artifactOpen}
        activeUtilityTab="activity"
        onSelectUtilityTab={vi.fn()}
        onCloseUtility={onCloseUtility}
        onCloseArtifact={onCloseArtifact}
        activeProject={null}
        overlayWidths={overlayWidths}
      />
    </div>,
  );

  return { ...utils, onCloseUtility, onCloseArtifact };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChatWorkbenchOverlays — utility overlay', () => {
  it('hides the utility drawer (translate-x-full) when utilityOpen is false', () => {
    renderOverlays({ utilityOpen: false });
    const drawer = screen.getByTestId('utility-overlay-drawer');
    expect(drawer.className).toContain('translate-x-full');
  });

  it('shows the utility drawer (translate-x-0) when utilityOpen is true', () => {
    renderOverlays({ utilityOpen: true });
    const drawer = screen.getByTestId('utility-overlay-drawer');
    expect(drawer.className).toContain('translate-x-0');
    expect(drawer.className).not.toContain('translate-x-full');
  });

  it('renders backdrop only when utility is open', () => {
    renderOverlays({ utilityOpen: true });
    // backdrop fires onClose when clicked
    expect(screen.queryByTestId('overlay-drawer-backdrop')).toBeTruthy();
  });

  it('calls onCloseUtility when utility close button is clicked', () => {
    const { onCloseUtility } = renderOverlays({ utilityOpen: true });
    fireEvent.click(screen.getByTestId('utility-close-btn'));
    expect(onCloseUtility).toHaveBeenCalledOnce();
  });
});

describe('ChatWorkbenchOverlays — artifact overlay', () => {
  it('hides the artifact drawer (translate-x-full) when artifactOpen is false', () => {
    renderOverlays({ artifactOpen: false });
    const drawer = screen.getByTestId('artifact-overlay-drawer');
    expect(drawer.className).toContain('translate-x-full');
  });

  it('shows the artifact drawer (translate-x-0) when artifactOpen is true', () => {
    renderOverlays({ artifactOpen: true });
    const drawer = screen.getByTestId('artifact-overlay-drawer');
    expect(drawer.className).toContain('translate-x-0');
    expect(drawer.className).not.toContain('translate-x-full');
  });

  it('calls onCloseArtifact when artifact close button is clicked', () => {
    const { onCloseArtifact } = renderOverlays({ artifactOpen: true });
    fireEvent.click(screen.getByTestId('artifact-close-btn'));
    expect(onCloseArtifact).toHaveBeenCalledOnce();
  });
});

describe('ChatWorkbenchOverlays — concurrent tile layout', () => {
  it('both drawers are visible simultaneously (translate-x-0) when both open', () => {
    renderOverlays({ utilityOpen: true, artifactOpen: true });
    const utilityDrawer = screen.getByTestId('utility-overlay-drawer');
    const artifactDrawer = screen.getByTestId('artifact-overlay-drawer');
    expect(utilityDrawer.className).toContain('translate-x-0');
    expect(artifactDrawer.className).toContain('translate-x-0');
  });

  it('artifact container right offset equals utility width when both open (tile)', () => {
    const overlayWidths = makeWidths({ overlayDrawerWidth: 380 });
    renderOverlays({ utilityOpen: true, artifactOpen: true, overlayWidths });
    const container = screen.getByTestId('artifact-overlay-container');
    expect(container.style.right).toBe('380px');
  });

  it('artifact container right offset is 0px (anchored to right edge) when utility is closed', () => {
    renderOverlays({ utilityOpen: false, artifactOpen: true });
    const container = screen.getByTestId('artifact-overlay-container');
    // rightOffset is 0 → container is anchored to the right edge (right: 0px or '')
    const right = container.style.right;
    expect(right === '' || right === '0px').toBe(true);
  });

  it('closing utility leaves artifact open', () => {
    const { onCloseUtility } = renderOverlays({ utilityOpen: true, artifactOpen: true });
    fireEvent.click(screen.getByTestId('utility-close-btn'));
    expect(onCloseUtility).toHaveBeenCalledOnce();
    // artifact drawer still shows translate-x-0 (its open state is unchanged)
    const artifactDrawer = screen.getByTestId('artifact-overlay-drawer');
    expect(artifactDrawer.className).toContain('translate-x-0');
  });
});
