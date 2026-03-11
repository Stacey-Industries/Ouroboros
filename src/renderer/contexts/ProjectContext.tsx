import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectContextValue {
  /** All open project roots */
  projectRoots: string[];
  /** Primary (first) root — backwards compatible */
  projectRoot: string | null;
  /** Human-readable name derived from the primary root's last path segment. */
  projectName: string;
  /** Replace all roots with a single root (backwards-compatible setProjectRoot). */
  setProjectRoot: (path: string) => void;
  /** Add a root to the workspace without replacing existing roots. */
  addProjectRoot: (path: string) => void;
  /** Remove a root from the workspace. */
  removeProjectRoot: (path: string) => void;
  /** Clear all roots (close all folders). */
  clearProject: () => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ProjectContext = createContext<ProjectContextValue | null>(null);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath;
}

function persistRoots(roots: string[]): void {
  if (typeof window === 'undefined' || !('electronAPI' in window)) return;
  void window.electronAPI.config.set('multiRoots', roots);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export interface ProjectProviderProps {
  /** Initial project root (e.g. from persisted config). */
  initialRoot?: string | null;
  children: React.ReactNode;
}

export function ProjectProvider({
  initialRoot = null,
  children,
}: ProjectProviderProps): React.ReactElement {
  const [projectRoots, setProjectRoots] = useState<string[]>(
    initialRoot ? [initialRoot] : []
  );

  // Load persisted multiRoots from config on mount (may override initialRoot)
  useEffect(() => {
    if (typeof window === 'undefined' || !('electronAPI' in window)) return;

    void window.electronAPI.config.get('multiRoots').then((saved) => {
      const saved_ = saved as string[] | undefined;
      if (Array.isArray(saved_) && saved_.length > 0) {
        // Merge: put saved roots first, then add initialRoot if not already present
        const merged = saved_.includes(initialRoot ?? '')
          ? saved_
          : initialRoot
          ? [initialRoot, ...saved_.filter((r) => r !== initialRoot)]
          : saved_;
        setProjectRoots(merged);
      }
      // If no saved multiRoots, keep whatever initialRoot gave us
    });
  // Only run once on mount — intentionally omitting initialRoot from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setProjectRoot = useCallback((path: string): void => {
    setProjectRoots([path]);
    persistRoots([path]);
  }, []);

  const addProjectRoot = useCallback((path: string): void => {
    setProjectRoots((prev) => {
      if (prev.includes(path)) return prev;
      const next = [...prev, path];
      persistRoots(next);
      return next;
    });
  }, []);

  const removeProjectRoot = useCallback((path: string): void => {
    setProjectRoots((prev) => {
      const next = prev.filter((r) => r !== path);
      persistRoots(next);
      return next;
    });
  }, []);

  const clearProject = useCallback((): void => {
    setProjectRoots([]);
    persistRoots([]);
  }, []);

  const projectRoot = useMemo(() => projectRoots[0] ?? null, [projectRoots]);

  const projectName = useMemo(
    () => (projectRoot ? basename(projectRoot) : ''),
    [projectRoot],
  );

  const value = useMemo<ProjectContextValue>(
    () => ({
      projectRoots,
      projectRoot,
      projectName,
      setProjectRoot,
      addProjectRoot,
      removeProjectRoot,
      clearProject,
    }),
    [projectRoots, projectRoot, projectName, setProjectRoot, addProjectRoot, removeProjectRoot, clearProject],
  );

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProject must be used inside <ProjectProvider>');
  }
  return ctx;
}
