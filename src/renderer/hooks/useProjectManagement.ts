/**
 * useProjectManagement — manages project switching and recent projects list.
 *
 * Extracted from InnerApp to reduce complexity.
 */

import { useCallback, useState } from 'react';

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

export interface UseProjectManagementReturn {
  recentProjects: string[];
  setRecentProjects: React.Dispatch<React.SetStateAction<string[]>>;
  handleProjectChange: (path: string) => Promise<void>;
}

export function useProjectManagement(
  initialRecentProjects: string[],
  setProjectRoot: (path: string) => void,
): UseProjectManagementReturn {
  const [recentProjects, setRecentProjects] = useState<string[]>(initialRecentProjects);

  const handleProjectChange = useCallback(
    async (path: string): Promise<void> => {
      setProjectRoot(path);
      const updated = [path, ...recentProjects.filter((p) => p !== path)].slice(0, 10);
      setRecentProjects(updated);

      if (hasElectronAPI()) {
        try {
          await window.electronAPI.config.set('defaultProjectRoot', path);
          await window.electronAPI.config.set('recentProjects', updated);
        } catch { /* best-effort */ }
      }
    },
    [recentProjects, setProjectRoot],
  );

  return { recentProjects, setRecentProjects, handleProjectChange };
}
