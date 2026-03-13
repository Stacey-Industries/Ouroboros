import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface ProjectPickerController {
  busy: boolean;
  canAddProject: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  hasMultipleRoots: boolean;
  open: boolean;
  projectName: string;
  recents: string[];
  rootCount: number;
  addFolder: () => Promise<void>;
  openFolder: () => Promise<void>;
  selectRecent: (path: string) => void;
  toggleOpen: () => void;
}

export function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath;
}

function getRecentProjects(
  recentProjects: string[],
  currentPath: string | null,
): string[] {
  return [...new Set(recentProjects)]
    .filter((path) => path !== currentPath)
    .slice(0, 8);
}

async function pickFolder(onSelect: (path: string) => void): Promise<void> {
  const result = await window.electronAPI.files.selectFolder();
  if (!result.cancelled && result.path) {
    onSelect(result.path);
  }
}

export function useProjectPickerController({
  currentPath,
  recentProjects,
  onSelectProject,
  onAddProject,
  rootCount = 0,
}: {
  currentPath: string | null;
  recentProjects: string[];
  onSelectProject: (path: string) => void;
  onAddProject?: (path: string) => void;
  rootCount?: number;
}): ProjectPickerController {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const toggleOpen = useCallback(() => {
    setOpen((previous) => !previous);
  }, []);

  const openFolder = useCallback(async () => {
    setOpen(false);
    setBusy(true);

    try {
      await pickFolder(onSelectProject);
    } finally {
      setBusy(false);
    }
  }, [onSelectProject]);

  const addFolder = useCallback(async () => {
    setOpen(false);
    setBusy(true);

    try {
      await pickFolder(onAddProject ?? onSelectProject);
    } finally {
      setBusy(false);
    }
  }, [onAddProject, onSelectProject]);

  const selectRecent = useCallback((path: string) => {
    onSelectProject(path);
    setOpen(false);
  }, [onSelectProject]);

  const recents = useMemo(
    () => getRecentProjects(recentProjects, currentPath),
    [currentPath, recentProjects],
  );

  return {
    busy,
    canAddProject: rootCount > 0 && Boolean(onAddProject),
    containerRef,
    hasMultipleRoots: rootCount > 1,
    open,
    projectName: currentPath ? basename(currentPath) : 'Open a folder...',
    recents,
    rootCount,
    addFolder,
    openFolder,
    selectRecent,
    toggleOpen,
  };
}
