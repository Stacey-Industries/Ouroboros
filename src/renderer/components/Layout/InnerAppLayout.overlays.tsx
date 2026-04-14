/**
 * InnerAppLayout.overlays — overlay sub-components for InnerAppLayout.
 *
 * Extracted to keep InnerAppLayout.tsx under the 300-line ESLint limit.
 */

import React from 'react';

import { AboutModal } from '../AboutModal';
import { CommandPalette } from '../CommandPalette/CommandPalette';
import { SymbolSearch } from '../CommandPalette/SymbolSearch';
import type { Command } from '../CommandPalette/types';
import { PerformanceOverlay } from '../shared/PerformanceOverlay';
import { FilePickerConnected } from './FilePickerConnected';
import { LazyPanelFallback } from './LazyPanelFallback';

const BackgroundJobsPanel = React.lazy(() =>
  import('../BackgroundJobs/BackgroundJobsPanel').then((m) => ({ default: m.BackgroundJobsPanel })),
);

const RestoreSessionsGate = React.lazy(() =>
  import('../Terminal/RestoreSessionsGate').then((m) => ({ default: m.RestoreSessionsGate })),
);

export interface LayoutOverlaysProps {
  paletteOpen: boolean;
  closePalette: () => void;
  commands: Command[];
  recentIds: string[];
  handleExecute: (command: Command) => Promise<void>;
  filePickerOpen: boolean;
  setFilePickerOpen: (v: boolean) => void;
  projectRoot: string | null;
  symbolSearchOpen: boolean;
  setSymbolSearchOpen: (v: boolean) => void;
  perfOverlayVisible: boolean;
  persistTerminalSessions: boolean;
}

type PaletteOverlayProps = Pick<
  LayoutOverlaysProps,
  'paletteOpen' | 'closePalette' | 'commands' | 'recentIds' | 'handleExecute'
>;

function PaletteOverlay({
  paletteOpen,
  closePalette,
  commands,
  recentIds,
  handleExecute,
}: PaletteOverlayProps): React.ReactElement {
  return (
    <CommandPalette
      isOpen={paletteOpen}
      onClose={closePalette}
      commands={commands}
      recentIds={recentIds}
      onExecute={handleExecute}
    />
  );
}

type SearchOverlaysProps = Pick<
  LayoutOverlaysProps,
  'filePickerOpen' | 'setFilePickerOpen' | 'projectRoot' | 'symbolSearchOpen' | 'setSymbolSearchOpen'
>;

function SearchOverlays({
  filePickerOpen,
  setFilePickerOpen,
  projectRoot,
  symbolSearchOpen,
  setSymbolSearchOpen,
}: SearchOverlaysProps): React.ReactElement {
  return (
    <>
      <FilePickerConnected
        isOpen={filePickerOpen}
        onClose={() => setFilePickerOpen(false)}
        projectRoot={projectRoot}
      />
      <SymbolSearch
        isOpen={symbolSearchOpen}
        onClose={() => setSymbolSearchOpen(false)}
        projectRoot={projectRoot}
      />
    </>
  );
}

function LazyPanels({ persistTerminalSessions }: { persistTerminalSessions: boolean }): React.ReactElement {
  return (
    <>
      <AboutModal />
      <React.Suspense fallback={<LazyPanelFallback />}>
        <BackgroundJobsPanel />
      </React.Suspense>
      {persistTerminalSessions && (
        <React.Suspense fallback={null}>
          <RestoreSessionsGate />
        </React.Suspense>
      )}
    </>
  );
}

export function LayoutOverlays({
  paletteOpen,
  closePalette,
  commands,
  recentIds,
  handleExecute,
  filePickerOpen,
  setFilePickerOpen,
  projectRoot,
  symbolSearchOpen,
  setSymbolSearchOpen,
  perfOverlayVisible,
  persistTerminalSessions,
}: LayoutOverlaysProps): React.ReactElement {
  return (
    <>
      <PaletteOverlay
        paletteOpen={paletteOpen}
        closePalette={closePalette}
        commands={commands}
        recentIds={recentIds}
        handleExecute={handleExecute}
      />
      <SearchOverlays
        filePickerOpen={filePickerOpen}
        setFilePickerOpen={setFilePickerOpen}
        projectRoot={projectRoot}
        symbolSearchOpen={symbolSearchOpen}
        setSymbolSearchOpen={setSymbolSearchOpen}
      />
      <PerformanceOverlay visible={perfOverlayVisible} />
      <LazyPanels persistTerminalSessions={persistTerminalSessions} />
    </>
  );
}
