import React, { useCallback, useEffect, useState } from 'react';

import {
  FILE_ICON_THEMES_CHANGED_EVENT,
  OPEN_SETTINGS_PANEL_EVENT,
  PRODUCT_ICON_THEMES_CHANGED_EVENT,
  VSX_EXTENSIONS_CHANGED_EVENT,
} from '../../hooks/appEventNames';
import { useExtensionThemes } from '../../hooks/useExtensionThemes';
import { EXTENSION_THEMES_CHANGED_EVENT } from '../../hooks/useExtensionThemes';
import { setActiveFileIconTheme, useFileIconThemes } from '../../hooks/useFileIconThemes';
import {
  setActiveProductIconTheme,
  useProductIconThemes,
} from '../../hooks/useProductIconThemes';
import { useTheme } from '../../hooks/useTheme';
import type { InstalledVsxExtension } from '../../types/electron';
import { SectionLabel } from '../Settings/settingsStyles';
import { VsxInstalledBody } from './VsxInstalledSection.parts';

export function VsxInstalledSection(): React.ReactElement {
  const extensionThemes = useExtensionThemes();
  const { theme: activeTheme, setTheme } = useTheme();
  const { activeThemeId: activeFileIconThemeId, themes: fileIconThemes } = useFileIconThemes();
  const { activeThemeId: activeProductIconThemeId, themes: productIconThemes } =
    useProductIconThemes();
  const { disabledIds, extensions, loading, refresh, toggleEnabled, uninstall } = useVsxInstalled();

  return (
    <section>
      <SectionLabel>Store Extensions</SectionLabel>
      <VsxInstalledBody
        activeFileIconThemeId={activeFileIconThemeId}
        activeProductIconThemeId={activeProductIconThemeId}
        activeThemeId={activeTheme.id}
        disabledIds={disabledIds}
        extensionThemes={extensionThemes}
        extensions={extensions}
        fileIconThemes={fileIconThemes}
        loading={loading}
        onApplyFileIconTheme={setActiveFileIconTheme}
        onApplyProductIconTheme={setActiveProductIconTheme}
        onApplyTheme={setTheme}
        onOpenAppearance={() =>
          window.dispatchEvent(
            new CustomEvent(OPEN_SETTINGS_PANEL_EVENT, { detail: { tab: 'appearance' } }),
          )
        }
        onRefresh={refresh}
        onToggle={toggleEnabled}
        onUninstall={uninstall}
        productIconThemes={productIconThemes}
      />
    </section>
  );
}

function emitVsxThemeChangeEvents(): void {
  window.dispatchEvent(new CustomEvent(EXTENSION_THEMES_CHANGED_EVENT));
  window.dispatchEvent(new CustomEvent(FILE_ICON_THEMES_CHANGED_EVENT));
  window.dispatchEvent(new CustomEvent(PRODUCT_ICON_THEMES_CHANGED_EVENT));
  window.dispatchEvent(new CustomEvent(VSX_EXTENSIONS_CHANGED_EVENT));
}

async function refreshVsxInstalled(
  setExtensions: React.Dispatch<React.SetStateAction<InstalledVsxExtension[]>>,
  setDisabledIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  setLoading: React.Dispatch<React.SetStateAction<boolean>>,
): Promise<void> {
  if (!window.electronAPI?.extensionStore) return;
  setLoading(true);
  try {
    const [installed, disabledIds] = await Promise.all([
      window.electronAPI.extensionStore.getInstalled(),
      window.electronAPI.config.get('disabledVsxExtensions'),
    ]);
    if (installed.success && installed.extensions) setExtensions(installed.extensions);
    setDisabledIds(new Set(disabledIds));
  } catch {
    // Installed extension badges are non-critical.
  } finally {
    setLoading(false);
  }
}

async function toggleVsxContribution(
  id: string,
  isDisabled: boolean,
  setDisabledIds: React.Dispatch<React.SetStateAction<Set<string>>>,
): Promise<void> {
  if (!window.electronAPI?.extensionStore) return;
  const result = isDisabled
    ? await window.electronAPI.extensionStore.enableContributions(id)
    : await window.electronAPI.extensionStore.disableContributions(id);
  if (!result.success) return;
  setDisabledIds((prev) => {
    const next = new Set(prev);
    if (isDisabled) next.delete(id);
    else next.add(id);
    return next;
  });
  emitVsxThemeChangeEvents();
}

async function uninstallVsxExtension(
  id: string,
  setExtensions: React.Dispatch<React.SetStateAction<InstalledVsxExtension[]>>,
  setDisabledIds: React.Dispatch<React.SetStateAction<Set<string>>>,
): Promise<void> {
  if (!window.electronAPI?.extensionStore) return;
  const result = await window.electronAPI.extensionStore.uninstall(id);
  if (!result.success) return;
  setExtensions((prev) => prev.filter((extension) => extension.id !== id));
  setDisabledIds((prev) => {
    const next = new Set(prev);
    next.delete(id);
    return next;
  });
  emitVsxThemeChangeEvents();
}

function useVsxInstalled(): {
  disabledIds: Set<string>;
  extensions: InstalledVsxExtension[];
  loading: boolean;
  refresh: () => void;
  toggleEnabled: (id: string) => void;
  uninstall: (id: string) => void;
} {
  const [extensions, setExtensions] = useState<InstalledVsxExtension[]>([]);
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    void refreshVsxInstalled(setExtensions, setDisabledIds, setLoading);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener(VSX_EXTENSIONS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(VSX_EXTENSIONS_CHANGED_EVENT, handler);
  }, [refresh]);

  const toggleEnabled = useCallback(
    (id: string) => {
      void toggleVsxContribution(id, disabledIds.has(id), setDisabledIds);
    },
    [disabledIds],
  );

  const uninstall = useCallback((id: string) => {
    void uninstallVsxExtension(id, setExtensions, setDisabledIds);
  }, []);

  return { disabledIds, extensions, loading, refresh, toggleEnabled, uninstall };
}
