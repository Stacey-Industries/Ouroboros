import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface ProjectContextValue {
  projectRoots: string[];
  projectRoot: string | null;
  projectName: string;
  /**
   * `true` once the initial async hydration from `getProjectRoots()` has
   * settled (resolved or failed). Consumers that validate against
   * `projectRoots` on cold boot must wait for this to avoid acting on
   * the empty initial state.
   */
  isLoaded: boolean;
  setProjectRoot: (path: string) => void;
  addProjectRoot: (path: string) => void;
  removeProjectRoot: (path: string) => void;
  clearProject: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath;
}

function persistRoots(roots: string[]): void {
  if (typeof window === 'undefined' || !('electronAPI' in window)) return;
  void window.electronAPI.window.setProjectRoots(roots);
}

function mergeSavedRoots(savedRoots: string[], initialRoot: string | null): string[] {
  if (!initialRoot || savedRoots.includes(initialRoot)) return savedRoots;
  return [initialRoot, ...savedRoots.filter((root) => root !== initialRoot)];
}

function useProjectRootState(
  initialRoot: string | null,
): [string[], React.Dispatch<React.SetStateAction<string[]>>, boolean] {
  const [projectRoots, setProjectRoots] = useState<string[]>(() =>
    initialRoot ? [initialRoot] : [],
  );
  const [isLoaded, setIsLoaded] = useState(false);
  const initialRootRef = useRef(initialRoot);

  useEffect(() => {
    if (typeof window === 'undefined' || !('electronAPI' in window)) {
      setIsLoaded(true);
      return;
    }

    void window.electronAPI.window
      .getProjectRoots()
      .then((result) => {
        const savedRoots = result.roots;
        if (Array.isArray(savedRoots) && savedRoots.length > 0) {
          setProjectRoots(mergeSavedRoots(savedRoots, initialRootRef.current));
        }
      })
      .finally(() => setIsLoaded(true));
  }, []);

  return [projectRoots, setProjectRoots, isLoaded];
}

function useProjectRootActions(
  setProjectRoots: React.Dispatch<React.SetStateAction<string[]>>,
): Pick<
  ProjectContextValue,
  'setProjectRoot' | 'addProjectRoot' | 'removeProjectRoot' | 'clearProject'
> {
  const updateRoots = useCallback(
    (updater: (roots: string[]) => string[]) => {
      setProjectRoots((prev) => {
        const next = updater(prev);
        persistRoots(next);
        return next;
      });
    },
    [setProjectRoots],
  );

  const setProjectRoot = useCallback(
    (path: string): void => {
      updateRoots(() => [path]);
    },
    [updateRoots],
  );

  const addProjectRoot = useCallback(
    (path: string): void => {
      updateRoots((prev) => (prev.includes(path) ? prev : [...prev, path]));
    },
    [updateRoots],
  );

  const removeProjectRoot = useCallback(
    (path: string): void => {
      updateRoots((prev) => prev.filter((root) => root !== path));
    },
    [updateRoots],
  );

  const clearProject = useCallback((): void => {
    updateRoots(() => []);
  }, [updateRoots]);

  return { setProjectRoot, addProjectRoot, removeProjectRoot, clearProject };
}

export interface ProjectProviderProps {
  initialRoot?: string | null;
  children: React.ReactNode;
}

export function ProjectProvider({
  initialRoot = null,
  children,
}: ProjectProviderProps): React.ReactElement {
  const [projectRoots, setProjectRoots, isLoaded] = useProjectRootState(initialRoot);
  const projectActions = useProjectRootActions(setProjectRoots);
  const projectRoot = projectRoots[0] ?? null;
  const projectName = projectRoot ? basename(projectRoot) : '';

  const value = useMemo<ProjectContextValue>(
    () => ({
      projectRoots,
      projectRoot,
      projectName,
      isLoaded,
      ...projectActions,
    }),
    [isLoaded, projectActions, projectName, projectRoot, projectRoots],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used inside <ProjectProvider>');
  return ctx;
}

/** Non-throwing variant — returns null if used outside <ProjectProvider>. */
export function useProjectOptional(): ProjectContextValue | null {
  return useContext(ProjectContext);
}
