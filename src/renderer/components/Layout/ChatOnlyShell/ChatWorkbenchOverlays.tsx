/**
 * ChatWorkbenchOverlays — Wave 89 Phase 3
 *
 * Renders both utility-drawer and artifact-pane OverlayDrawer instances
 * inside the chat-area's positioned ancestor (which carries `relative`).
 *
 * Tile layout (per ADR Decision 3 + Phase 3 spec):
 *   - Utility drawer anchors to the right edge (right: 0).
 *   - Artifact pane anchors to the LEFT of the utility drawer when utility is
 *     open (right: utilityWidth), or to the right edge when utility is closed.
 *   Rationale: utility is tooling; artifact IS chat content — closer to the
 *   chat panel makes semantic sense.
 *
 * Each overlay is independently dismissible via backdrop click, close button,
 * or Escape. Both may be visible simultaneously (no z-index collision: they
 * tile horizontally so their bounding boxes don't overlap).
 *
 * z-index: 200 (per OverlayDrawer primitive — between in-layout content and
 * full-screen modals). Both instances share the same z-index; horizontal
 * tiling means no stacking conflict.
 */

import React, { Suspense } from 'react';

import { ChatWorkbenchUtilityDrawer } from './ChatWorkbenchUtilityDrawer';
import { OverlayDrawer } from './OverlayDrawer';
import type { ChatWorkbenchUtilityTab } from './useChatWorkbenchLayout';
import type { UseOverlayDrawerWidthsReturn } from './useOverlayDrawerWidths';

// Artifact pane is lazy-loaded to avoid xterm cost on cold boot.
const ChatWorkbenchArtifactPane = React.lazy(() =>
  import('./ChatWorkbenchArtifactPane').then((m) => ({ default: m.ChatWorkbenchArtifactPane })),
);

// ── Tile-offset computation ────────────────────────────────────────────────────

/**
 * Returns the CSS `right` offset (px) for the artifact pane overlay.
 * When utility is open, artifact tiles to the LEFT of it.
 * When utility is closed, artifact anchors to the right edge (right: 0).
 */
function artifactRightOffset(utilityOpen: boolean, utilityWidth: number): number {
  return utilityOpen ? utilityWidth : 0;
}

// ── Prop types ────────────────────────────────────────────────────────────────

export interface ChatWorkbenchOverlaysProps {
  utilityOpen: boolean;
  artifactOpen: boolean;
  activeUtilityTab: ChatWorkbenchUtilityTab;
  onSelectUtilityTab: (tab: ChatWorkbenchUtilityTab) => void;
  onCloseUtility: () => void;
  onCloseArtifact: () => void;
  activeProject: string | null;
  overlayWidths: UseOverlayDrawerWidthsReturn;
}

// ── Utility overlay ───────────────────────────────────────────────────────────

function UtilityOverlay({
  open,
  width,
  onWidthChange,
  onClose,
  activeTab,
  onSelectTab,
  activeProject,
}: {
  open: boolean;
  width: number;
  onWidthChange: (w: number) => void;
  onClose: () => void;
  activeTab: ChatWorkbenchUtilityTab;
  onSelectTab: (tab: ChatWorkbenchUtilityTab) => void;
  activeProject: string | null;
}): React.ReactElement {
  return (
    <OverlayDrawer
      open={open}
      onClose={onClose}
      width={width}
      onWidthChange={onWidthChange}
      dataTestId="utility-overlay-drawer"
    >
      <ChatWorkbenchUtilityDrawer
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        onClose={onClose}
        activeProject={activeProject}
      />
    </OverlayDrawer>
  );
}

// ── Artifact overlay ──────────────────────────────────────────────────────────

function ArtifactOverlay({
  open,
  width,
  onWidthChange,
  onClose,
  rightOffset,
}: {
  open: boolean;
  width: number;
  onWidthChange: (w: number) => void;
  onClose: () => void;
  rightOffset: number;
}): React.ReactElement {
  // The OverlayDrawer primitive anchors right: 0 via Tailwind `right-0`.
  // For tiling we need to override that with a pixel offset. We render a
  // wrapper that shifts the drawer leftward by the utility width.
  const offsetStyle: React.CSSProperties = rightOffset > 0 ? { right: rightOffset } : {};
  return (
    <div
      className="absolute inset-y-0 pointer-events-none"
      style={{ left: 0, right: 0, ...offsetStyle }}
      data-testid="artifact-overlay-container"
    >
      <OverlayDrawer
        open={open}
        onClose={onClose}
        width={width}
        onWidthChange={onWidthChange}
        dataTestId="artifact-overlay-drawer"
      >
        <Suspense fallback={null}>
          <ChatWorkbenchArtifactPane onClose={onClose} />
        </Suspense>
      </OverlayDrawer>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ChatWorkbenchOverlays({
  utilityOpen,
  artifactOpen,
  activeUtilityTab,
  onSelectUtilityTab,
  onCloseUtility,
  onCloseArtifact,
  activeProject,
  overlayWidths,
}: ChatWorkbenchOverlaysProps): React.ReactElement {
  const {
    overlayDrawerWidth,
    artifactOverlayWidth,
    setOverlayDrawerWidth,
    setArtifactOverlayWidth,
  } = overlayWidths;

  const artifactOffset = artifactRightOffset(utilityOpen, overlayDrawerWidth);

  return (
    <>
      <UtilityOverlay
        open={utilityOpen}
        width={overlayDrawerWidth}
        onWidthChange={setOverlayDrawerWidth}
        onClose={onCloseUtility}
        activeTab={activeUtilityTab}
        onSelectTab={onSelectUtilityTab}
        activeProject={activeProject}
      />
      <ArtifactOverlay
        open={artifactOpen}
        width={artifactOverlayWidth}
        onWidthChange={setArtifactOverlayWidth}
        onClose={onCloseArtifact}
        rightOffset={artifactOffset}
      />
    </>
  );
}
