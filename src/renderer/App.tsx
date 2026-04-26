import React from 'react';

import { InnerApp, useAppBootstrap } from './App.helpers';
import { ChangelogDrawer } from './components/Changelog/ChangelogDrawer';
import { WebFolderBrowser } from './components/FileBrowser';
import { LoadingScreen } from './components/Layout/LoadingScreen';
import { FirstRunTourGate } from './components/Onboarding/FirstRunTour';
import { System2IndexProgress } from './components/System2IndexProgress';
import { AgentEventsProvider } from './contexts/AgentEventsContext';
import { ApprovalProvider } from './contexts/ApprovalContext';
import { FocusProvider } from './contexts/FocusContext';
import { ProjectProvider } from './contexts/ProjectContext';
import { ToastProvider } from './contexts/ToastContext';
import { useConfig } from './hooks/useConfig';
import { useThemeRuntimeBootstrap } from './hooks/useTheme';
import { useTokenOverrides } from './hooks/useTokenOverrides';
import { useVisualViewportInsets } from './hooks/useVisualViewportInsets';

// ─── ConfiguredApp ────────────────────────────────────────────

interface ConfiguredAppProps {
  initialRoot: string | null;
  initialRecents: string[];
  keybindings: Record<string, string>;
  customCSS: string;
  persistTerminalSessions: boolean;
}

function ConfiguredApp({
  initialRoot,
  initialRecents,
  keybindings,
  customCSS,
  persistTerminalSessions,
}: ConfiguredAppProps): React.ReactElement {
  useAppBootstrap(customCSS);

  return (
    <ToastProvider>
      <FocusProvider>
        <AgentEventsProvider>
          <ApprovalProvider>
            <ProjectProvider initialRoot={initialRoot}>
              <InnerApp
                initialRecentProjects={initialRecents}
                keybindings={keybindings}
                persistTerminalSessions={persistTerminalSessions}
              />
            </ProjectProvider>
          </ApprovalProvider>
        </AgentEventsProvider>
      </FocusProvider>
      <WebFolderBrowser />
      <System2IndexProgress />
      <FirstRunTourGate />
      <ChangelogDrawer />
    </ToastProvider>
  );
}

// ─── Root App ─────────────────────────────────────────────────

export default function App(): React.ReactElement {
  const { config, isLoading: configLoading } = useConfig();
  useThemeRuntimeBootstrap(config);
  useTokenOverrides();
  useVisualViewportInsets();

  if (configLoading || !config) return <LoadingScreen />;

  const initialRoot: string | null = config.defaultProjectRoot || null;
  const initialRecents: string[] = Array.isArray(config.recentProjects)
    ? config.recentProjects
    : [];
  const keybindings: Record<string, string> =
    config.keybindings && typeof config.keybindings === 'object' ? config.keybindings : {};
  const customCSS: string = typeof config.customCSS === 'string' ? config.customCSS : '';
  const persistTerminalSessions: boolean = config.persistTerminalSessions === true;

  return (
    <ConfiguredApp
      initialRoot={initialRoot}
      initialRecents={initialRecents}
      keybindings={keybindings}
      customCSS={customCSS}
      persistTerminalSessions={persistTerminalSessions}
    />
  );
}
