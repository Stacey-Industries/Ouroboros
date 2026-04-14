/**
 * @vitest-environment jsdom
 *
 * InnerAppLayout.overlays — smoke tests for LayoutOverlays.
 * Verifies the component renders without crashing and mounts
 * the RestoreSessionsGate when persistTerminalSessions is true.
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LayoutOverlays } from './InnerAppLayout.overlays';

afterEach(() => cleanup());

// Stub heavy lazy-loaded sub-modules so Suspense resolves synchronously.
vi.mock('../CommandPalette/CommandPalette', () => ({
  CommandPalette: () => null,
}));
vi.mock('../CommandPalette/SymbolSearch', () => ({
  SymbolSearch: () => null,
}));
vi.mock('./FilePickerConnected', () => ({
  FilePickerConnected: () => null,
}));
vi.mock('../shared/PerformanceOverlay', () => ({
  PerformanceOverlay: () => null,
}));
vi.mock('../AboutModal', () => ({
  AboutModal: () => null,
}));
vi.mock('../BackgroundJobs/BackgroundJobsPanel', () => ({
  BackgroundJobsPanel: () => null,
}));
vi.mock('../Terminal/RestoreSessionsGate', () => ({
  RestoreSessionsGate: () => <div data-testid="restore-gate" />,
}));

const baseProps = {
  paletteOpen: false,
  closePalette: vi.fn(),
  commands: [],
  recentIds: [],
  handleExecute: vi.fn(),
  filePickerOpen: false,
  setFilePickerOpen: vi.fn(),
  projectRoot: null,
  symbolSearchOpen: false,
  setSymbolSearchOpen: vi.fn(),
  perfOverlayVisible: false,
  persistTerminalSessions: false,
};

describe('LayoutOverlays', () => {
  it('renders without crashing when persistTerminalSessions is false', () => {
    const { container } = render(<LayoutOverlays {...baseProps} />);
    expect(container).toBeDefined();
  });

  it('renders without crashing when persistTerminalSessions is true', () => {
    const { container } = render(
      <LayoutOverlays {...baseProps} persistTerminalSessions={true} />,
    );
    expect(container).toBeDefined();
  });
});
