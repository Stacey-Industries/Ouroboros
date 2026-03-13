/**
 * useWorkspaceLayouts — manages workspace layout persistence and switching.
 *
 * Extracted from InnerApp to reduce complexity.
 */

import { useCallback, useEffect, useState } from 'react';
import type { WorkspaceLayout } from '../types/electron';

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

export interface UseWorkspaceLayoutsReturn {
  workspaceLayouts: WorkspaceLayout[];
  activeLayoutName: string;
  handleSelectLayout: (layout: WorkspaceLayout) => void;
  handleSaveLayout: (name: string) => void;
  handleUpdateLayout: (name: string) => void;
  handleDeleteLayout: (name: string) => void;
}

function readCurrentPanelState(): {
  sizes: { leftSidebar: number; rightSidebar: number; terminal: number };
  collapse: { leftSidebar: boolean; rightSidebar: boolean; terminal: boolean };
} {
  let sizes = { leftSidebar: 240, rightSidebar: 300, terminal: 250 };
  let collapse = { leftSidebar: false, rightSidebar: false, terminal: false };
  try {
    const stored = localStorage.getItem('agent-ide:panel-sizes');
    if (stored) sizes = { ...sizes, ...JSON.parse(stored) };
    const storedCollapse = localStorage.getItem('agent-ide:panel-collapse');
    if (storedCollapse) collapse = { ...collapse, ...JSON.parse(storedCollapse) };
  } catch { /* ignore */ }
  return { sizes, collapse };
}

export function useWorkspaceLayouts(): UseWorkspaceLayoutsReturn {
  const [workspaceLayouts, setWorkspaceLayouts] = useState<WorkspaceLayout[]>([]);
  const [activeLayoutName, setActiveLayoutName] = useState('Default');

  // Load layouts from config on mount
  useEffect(() => {
    if (!hasElectronAPI()) return;
    void (async () => {
      try {
        const layouts = await window.electronAPI.config.get('workspaceLayouts');
        const activeName = await window.electronAPI.config.get('activeLayoutName');
        if (Array.isArray(layouts) && layouts.length > 0) setWorkspaceLayouts(layouts);
        if (activeName) setActiveLayoutName(activeName);
      } catch { /* defaults */ }
    })();
  }, []);

  const handleSelectLayout = useCallback((layout: WorkspaceLayout) => {
    setActiveLayoutName(layout.name);
    window.dispatchEvent(new CustomEvent('agent-ide:apply-layout', { detail: layout }));
    if (hasElectronAPI()) {
      void window.electronAPI.config.set('activeLayoutName', layout.name);
    }
  }, []);

  const handleSaveLayout = useCallback((name: string) => {
    const { sizes, collapse } = readCurrentPanelState();
    const newLayout: WorkspaceLayout = {
      name,
      panelSizes: sizes,
      visiblePanels: {
        leftSidebar: !collapse.leftSidebar,
        rightSidebar: !collapse.rightSidebar,
        terminal: !collapse.terminal,
      },
      builtIn: false,
    };

    setWorkspaceLayouts((prev) => {
      const updated = [...prev, newLayout];
      if (hasElectronAPI()) void window.electronAPI.config.set('workspaceLayouts', updated);
      return updated;
    });
    setActiveLayoutName(name);
    if (hasElectronAPI()) void window.electronAPI.config.set('activeLayoutName', name);
  }, []);

  const handleUpdateLayout = useCallback((name: string) => {
    const { sizes, collapse } = readCurrentPanelState();
    setWorkspaceLayouts((prev) => {
      const updated = prev.map((l) =>
        l.name === name
          ? {
              ...l,
              panelSizes: sizes,
              visiblePanels: {
                leftSidebar: !collapse.leftSidebar,
                rightSidebar: !collapse.rightSidebar,
                terminal: !collapse.terminal,
              },
            }
          : l,
      );
      if (hasElectronAPI()) void window.electronAPI.config.set('workspaceLayouts', updated);
      return updated;
    });
  }, []);

  const handleDeleteLayout = useCallback((name: string) => {
    setWorkspaceLayouts((prev) => {
      const updated = prev.filter((l) => l.name !== name);
      if (hasElectronAPI()) void window.electronAPI.config.set('workspaceLayouts', updated);
      return updated;
    });
    setActiveLayoutName((prev) => {
      if (prev === name) {
        if (hasElectronAPI()) void window.electronAPI.config.set('activeLayoutName', 'Default');
        return 'Default';
      }
      return prev;
    });
  }, []);

  return {
    workspaceLayouts,
    activeLayoutName,
    handleSelectLayout,
    handleSaveLayout,
    handleUpdateLayout,
    handleDeleteLayout,
  };
}
