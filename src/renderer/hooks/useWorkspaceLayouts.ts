/**
 * useWorkspaceLayouts — manages workspace layout persistence and switching.
 *
 * Extracted from InnerApp to reduce complexity.
 */

import React, { useCallback, useEffect, useState } from 'react';

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

async function loadLayoutsFromConfig(
  setLayouts: React.Dispatch<React.SetStateAction<WorkspaceLayout[]>>,
  setActive: React.Dispatch<React.SetStateAction<string>>,
): Promise<void> {
  try {
    const layouts = await window.electronAPI.config.get('workspaceLayouts');
    const activeName = await window.electronAPI.config.get('activeLayoutName');
    if (Array.isArray(layouts) && layouts.length > 0) setLayouts(layouts);
    if (activeName) setActive(activeName);
  } catch { /* defaults */ }
}

function buildVisiblePanels(collapse: { leftSidebar: boolean; rightSidebar: boolean; terminal: boolean }) {
  return {
    leftSidebar: !collapse.leftSidebar,
    rightSidebar: !collapse.rightSidebar,
    terminal: !collapse.terminal,
  };
}

function persistLayouts(layouts: WorkspaceLayout[]): void {
  if (hasElectronAPI()) void window.electronAPI.config.set('workspaceLayouts', layouts);
}

function persistActiveLayout(name: string): void {
  if (hasElectronAPI()) void window.electronAPI.config.set('activeLayoutName', name);
}

function buildLayoutFromCurrentState(name: string): WorkspaceLayout {
  const { sizes, collapse } = readCurrentPanelState();
  return { name, panelSizes: sizes, visiblePanels: buildVisiblePanels(collapse), builtIn: false };
}

function mergeCurrentStateIntoLayout(layout: WorkspaceLayout): WorkspaceLayout {
  const { sizes, collapse } = readCurrentPanelState();
  return { ...layout, panelSizes: sizes, visiblePanels: buildVisiblePanels(collapse) };
}

export function useWorkspaceLayouts(): UseWorkspaceLayoutsReturn {
  const [workspaceLayouts, setWorkspaceLayouts] = useState<WorkspaceLayout[]>([]);
  const [activeLayoutName, setActiveLayoutName] = useState('Default');

  useEffect(() => {
    if (!hasElectronAPI()) return;
    void loadLayoutsFromConfig(setWorkspaceLayouts, setActiveLayoutName);
  }, []);

  const handleSelectLayout = useCallback((layout: WorkspaceLayout) => {
    setActiveLayoutName(layout.name);
    window.dispatchEvent(new CustomEvent('agent-ide:apply-layout', { detail: layout }));
    persistActiveLayout(layout.name);
  }, []);

  const handleSaveLayout = useCallback((name: string) => {
    const newLayout = buildLayoutFromCurrentState(name);
    setWorkspaceLayouts((prev) => { const u = [...prev, newLayout]; persistLayouts(u); return u; });
    setActiveLayoutName(name);
    persistActiveLayout(name);
  }, []);

  const handleUpdateLayout = useCallback((name: string) => {
    setWorkspaceLayouts((prev) => {
      const updated = prev.map((l) => (l.name === name ? mergeCurrentStateIntoLayout(l) : l));
      persistLayouts(updated);
      return updated;
    });
  }, []);

  const handleDeleteLayout = useCallback((name: string) => {
    setWorkspaceLayouts((prev) => { const u = prev.filter((l) => l.name !== name); persistLayouts(u); return u; });
    setActiveLayoutName((prev) => {
      if (prev === name) { persistActiveLayout('Default'); return 'Default'; }
      return prev;
    });
  }, []);

  return { workspaceLayouts, activeLayoutName, handleSelectLayout, handleSaveLayout, handleUpdateLayout, handleDeleteLayout };
}
