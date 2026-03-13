import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import type { FileChangeEvent } from '../../types/electron';

export interface OpenFile {
  path: string;
  /** Filename (basename) */
  name: string;
  /** File content — null while loading or for binary/image files */
  content: string | null;
  /** True while the initial load is in progress */
  isLoading: boolean;
  /** Error string if read failed */
  error: string | null;
  /** True when the file has been changed on disk since it was opened */
  isDirtyOnDisk: boolean;
  /** Snapshot of content when file was first loaded or last reloaded (before agent edits) */
  originalContent: string | null;
  /** True when the file is a recognized image type — renders ImageViewer instead of text */
  isImage?: boolean;
  /** True when the file has unsaved edits in the inline editor */
  isDirty?: boolean;
}

interface FileViewerState {
  openFiles: OpenFile[];
  activeIndex: number;
  activeFile: OpenFile | null;
  openFile: (filePath: string) => Promise<void>;
  closeFile: (filePath: string) => void;
  setActive: (filePath: string) => void;
  saveFile: (filePath: string, content: string) => Promise<void>;
  setDirty: (filePath: string, dirty: boolean) => void;
}

const FileViewerContext = createContext<FileViewerState | null>(null);

function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath;
}

/** Binary-file heuristic: checks for null bytes in the first 8KB of content. */
function looksLikeBinary(content: string): boolean {
  const sample = content.slice(0, 8192);
  return sample.includes('\x00');
}

/** Extensions that should be rendered as images. */
const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif',
]);

/** Returns true if the file path has a recognized image extension. */
function isImageFile(filePath: string): boolean {
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  return IMAGE_EXTENSIONS.has(ext);
}

export interface FileViewerManagerProps {
  projectRoot: string | null;
  children: React.ReactNode;
}

/**
 * FileViewerManager — context provider that manages open file tabs.
 * Wrap the FileViewer area with this and consume via useFileViewerManager().
 */
export function FileViewerManager({
  projectRoot,
  children,
}: FileViewerManagerProps): React.ReactElement {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Watch the project root for file changes — mark dirty and auto-read new content for diff
  useEffect(() => {
    if (!projectRoot) return;

    const cleanup = window.electronAPI.files.onFileChange((change: FileChangeEvent) => {
      if (change.type === 'change') {
        // Save previous content as originalContent for diff, mark dirty
        setOpenFiles((prev) =>
          prev.map((f) => {
            if (f.path !== change.path) return f;
            return {
              ...f,
              isDirtyOnDisk: true,
              // Preserve the very first original; only update if not already dirty
              originalContent: f.isDirtyOnDisk ? f.originalContent : (f.content ?? f.originalContent),
            };
          })
        );

        // Auto-read the new content so the diff view has both versions
        void window.electronAPI.files.readFile(change.path).then((result) => {
          if (!result.success) return;
          const newContent = result.content ?? '';
          if (looksLikeBinary(newContent)) return;

          setOpenFiles((prev) =>
            prev.map((f) => {
              if (f.path !== change.path) return f;
              return { ...f, content: newContent };
            })
          );
        });
      } else if (change.type === 'unlink') {
        setOpenFiles((prev) =>
          prev.map((f) => (f.path === change.path ? { ...f, isDirtyOnDisk: true } : f))
        );
      }
    });

    return cleanup;
  }, [projectRoot]);

  const openFile = useCallback(async (filePath: string): Promise<void> => {
    setOpenFiles((prev) => {
      const existing = prev.findIndex((f) => f.path === filePath);
      if (existing !== -1) {
        // Already open — just activate it (handled below)
        return prev;
      }
      // Add a loading placeholder
      return [
        ...prev,
        {
          path: filePath,
          name: basename(filePath),
          content: null,
          isLoading: true,
          error: null,
          isDirtyOnDisk: false,
          originalContent: null,
        },
      ];
    });

    // Activate this file
    setOpenFiles((prev) => {
      const idx = prev.findIndex((f) => f.path === filePath);
      if (idx !== -1) setActiveIndex(idx);
      return prev;
    });

    // Read content
    const result = await window.electronAPI.files.readFile(filePath);

    setOpenFiles((prev) =>
      prev.map((f) => {
        if (f.path !== filePath) return f;

        if (!result.success) {
          return {
            ...f,
            isLoading: false,
            error: result.error ?? 'Failed to read file',
            content: null,
          };
        }

        const content = result.content ?? '';

        // Image files: always render via ImageViewer regardless of binary detection
        if (isImageFile(filePath)) {
          return {
            ...f,
            isLoading: false,
            error: null,
            content: null,
            isImage: true,
          };
        }

        if (looksLikeBinary(content)) {
          return {
            ...f,
            isLoading: false,
            error: 'Binary file — cannot display',
            content: null,
          };
        }

        // Store current content as originalContent only on first load.
        // On reload (dirty-on-disk → reload), the previous content becomes
        // the original so the diff shows what changed.
        const originalContent = f.originalContent === null && f.content === null
          ? content           // first load: original = loaded content
          : f.content ?? f.originalContent; // reload: previous content becomes original

        return {
          ...f,
          isLoading: false,
          error: null,
          content,
          isDirtyOnDisk: false,
          originalContent,
        };
      })
    );

    // Set active after content loads
    setOpenFiles((prev) => {
      const idx = prev.findIndex((f) => f.path === filePath);
      if (idx !== -1) setActiveIndex(idx);
      return prev;
    });
  }, []);

  // Listen for agent-ide:reload-file DOM events (dispatched by ConflictResolver after saving)
  useEffect(() => {
    function onReloadFile(e: Event): void {
      const { filePath } = (e as CustomEvent<{ filePath: string }>).detail;
      if (!filePath) return;

      void window.electronAPI.files.readFile(filePath).then((result) => {
        if (!result.success) return;
        const newContent = result.content ?? '';

        setOpenFiles((prev) =>
          prev.map((f) => {
            if (f.path !== filePath) return f;
            return {
              ...f,
              content: newContent,
              isDirtyOnDisk: false,
            };
          })
        );
      });
    }

    window.addEventListener('agent-ide:reload-file', onReloadFile);
    return () => window.removeEventListener('agent-ide:reload-file', onReloadFile);
  }, []);

  // Listen for agent-ide:open-file DOM events (dispatched by SymbolSearch)
  useEffect(() => {
    function onOpenFile(e: Event): void {
      const { filePath, line, col } = (e as CustomEvent<{ filePath: string; line?: number; col?: number }>).detail;
      if (!filePath) return;

      void openFile(filePath).then(() => {
        if (line != null && line > 0) {
          // Give the file viewer a tick to render before issuing scroll
          requestAnimationFrame(() => {
            window.dispatchEvent(
              new CustomEvent('agent-ide:scroll-to-line', {
                detail: { filePath, line, col },
              }),
            );
          });
        }
      });
    }

    window.addEventListener('agent-ide:open-file', onOpenFile);
    return () => window.removeEventListener('agent-ide:open-file', onOpenFile);
  }, [openFile]);

  const closeFile = useCallback((filePath: string) => {
    setOpenFiles((prev) => {
      const idx = prev.findIndex((f) => f.path === filePath);
      if (idx === -1) return prev;
      const next = prev.filter((f) => f.path !== filePath);

      setActiveIndex((prevActive) => {
        if (next.length === 0) return 0;
        if (prevActive >= next.length) return next.length - 1;
        if (prevActive > idx) return prevActive - 1;
        return prevActive;
      });

      return next;
    });
  }, []);

  const setActive = useCallback((filePath: string) => {
    setOpenFiles((prev) => {
      const idx = prev.findIndex((f) => f.path === filePath);
      if (idx !== -1) setActiveIndex(idx);
      return prev;
    });
  }, []);

  const saveFile = useCallback(async (filePath: string, content: string): Promise<void> => {
    const result = await window.electronAPI.files.saveFile(filePath, content);
    if (!result.success) {
      console.error('[FileViewerManager] saveFile failed:', result.error);
      return;
    }
    // Update the stored content and clear dirty state
    setOpenFiles((prev) =>
      prev.map((f) => {
        if (f.path !== filePath) return f;
        return {
          ...f,
          content,
          isDirty: false,
          isDirtyOnDisk: false,
          originalContent: content,
        };
      })
    );
  }, []);

  const setDirty = useCallback((filePath: string, dirty: boolean) => {
    setOpenFiles((prev) =>
      prev.map((f) => {
        if (f.path !== filePath) return f;
        if (f.isDirty === dirty) return f;
        return { ...f, isDirty: dirty };
      })
    );
  }, []);

  const activeFile = openFiles[activeIndex] ?? null;

  const value: FileViewerState = {
    openFiles,
    activeIndex,
    activeFile,
    openFile,
    closeFile,
    setActive,
    saveFile,
    setDirty,
  };

  return (
    <FileViewerContext.Provider value={value}>
      {children}
    </FileViewerContext.Provider>
  );
}

export function useFileViewerManager(): FileViewerState {
  const ctx = useContext(FileViewerContext);
  if (!ctx) {
    throw new Error('useFileViewerManager must be used inside <FileViewerManager>');
  }
  return ctx;
}
