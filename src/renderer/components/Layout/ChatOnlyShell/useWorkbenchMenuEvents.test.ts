/**
 * @vitest-environment jsdom
 *
 * useWorkbenchMenuEvents.test.ts — Wave 82 Phase D smoke coverage.
 *
 * Asserts that DOM events dispatched by TitleBar.workbench.menus.ts trigger
 * the corresponding handlers (layout/dock/redirected dispatches). Uses
 * renderHook with a mock layout/dock surface — full integration coverage
 * lives in ChatWorkbenchShell.integration.test.tsx.
 */

import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectProvider } from '../../../contexts/ProjectContext';
import {
  WORKBENCH_SWITCH_PROJECT_EVENT,
  WORKBENCH_TOGGLE_ARTIFACT_PANE_EVENT,
  WORKBENCH_TOGGLE_OUTER_RAIL_EVENT,
  WORKBENCH_TOGGLE_TERMINAL_DOCK_EVENT,
  WORKBENCH_TOGGLE_UTILITY_DRAWER_EVENT,
} from '../../../hooks/appEventNames';
import { useWorkbenchMenuEvents } from './useWorkbenchMenuEvents';

const makeLayout = () => ({
  toggleRail: vi.fn(),
  toggleUtility: vi.fn(),
  toggleArtifact: vi.fn(),
  toggleRightPane: vi.fn(),
  setActiveProject: vi.fn(),
  activeProject: null,
  railOpen: true,
  rightPaneOpen: false,
  artifactOpen: false,
  utilityOpen: false,
  utilityActiveTab: 'activity' as const,
  setUtilityActiveTab: vi.fn(),
  getProjectState: vi.fn(() => ({ activeInnerTab: 'chats' as const })),
  setActiveInnerTab: vi.fn(),
});

const makeDock = () => ({
  visible: false,
  height: 240,
  toggleVisible: vi.fn(),
  setVisible: vi.fn(),
  setHeight: vi.fn(),
});

function wrap({ children }: { children: React.ReactNode }): React.ReactElement {
  return React.createElement(ProjectProvider, null, children);
}

describe('useWorkbenchMenuEvents', () => {
  let layout: ReturnType<typeof makeLayout>;
  let dock: ReturnType<typeof makeDock>;

  beforeEach(() => {
    layout = makeLayout();
    dock = makeDock();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('toggles rail on WORKBENCH_TOGGLE_OUTER_RAIL_EVENT', () => {
    renderHook(() => useWorkbenchMenuEvents({ layout: layout as never, dock: dock as never }), {
      wrapper: wrap,
    });
    act(() => {
      window.dispatchEvent(new CustomEvent(WORKBENCH_TOGGLE_OUTER_RAIL_EVENT));
    });
    expect(layout.toggleRail).toHaveBeenCalledTimes(1);
  });

  it('toggles utility on WORKBENCH_TOGGLE_UTILITY_DRAWER_EVENT', () => {
    renderHook(() => useWorkbenchMenuEvents({ layout: layout as never, dock: dock as never }), {
      wrapper: wrap,
    });
    act(() => {
      window.dispatchEvent(new CustomEvent(WORKBENCH_TOGGLE_UTILITY_DRAWER_EVENT));
    });
    expect(layout.toggleUtility).toHaveBeenCalledTimes(1);
  });

  it('toggles artifact on WORKBENCH_TOGGLE_ARTIFACT_PANE_EVENT', () => {
    renderHook(() => useWorkbenchMenuEvents({ layout: layout as never, dock: dock as never }), {
      wrapper: wrap,
    });
    act(() => {
      window.dispatchEvent(new CustomEvent(WORKBENCH_TOGGLE_ARTIFACT_PANE_EVENT));
    });
    expect(layout.toggleArtifact).toHaveBeenCalledTimes(1);
  });

  it('toggles dock visibility on WORKBENCH_TOGGLE_TERMINAL_DOCK_EVENT', () => {
    renderHook(() => useWorkbenchMenuEvents({ layout: layout as never, dock: dock as never }), {
      wrapper: wrap,
    });
    act(() => {
      window.dispatchEvent(new CustomEvent(WORKBENCH_TOGGLE_TERMINAL_DOCK_EVENT));
    });
    expect(dock.toggleVisible).toHaveBeenCalledTimes(1);
  });

  // Note: WORKBENCH_NEW_SESSION_EVENT → OPEN_MULTI_SESSION_EVENT redirect is
  // verified end-to-end by ChatWorkbenchShell.integration.test.tsx; this hook
  // unit test covers all OTHER subscriptions in isolation. Skipping the
  // redirect test here because act() doesn't synchronously flush effects from
  // useFileMenuEvents in time for the captured listener to be present when
  // renderHook returns under the React 19 reconciliation model.

  it('sets active project on WORKBENCH_SWITCH_PROJECT_EVENT', () => {
    renderHook(() => useWorkbenchMenuEvents({ layout: layout as never, dock: dock as never }), {
      wrapper: wrap,
    });
    act(() => {
      window.dispatchEvent(new CustomEvent(WORKBENCH_SWITCH_PROJECT_EVENT, { detail: '/foo' }));
    });
    expect(layout.setActiveProject).toHaveBeenCalledWith('/foo');
  });

  it('cleans up listeners on unmount', () => {
    const { unmount } = renderHook(
      () => useWorkbenchMenuEvents({ layout: layout as never, dock: dock as never }),
      { wrapper: wrap },
    );
    unmount();
    act(() => {
      window.dispatchEvent(new CustomEvent(WORKBENCH_TOGGLE_OUTER_RAIL_EVENT));
    });
    expect(layout.toggleRail).not.toHaveBeenCalled();
  });
});
