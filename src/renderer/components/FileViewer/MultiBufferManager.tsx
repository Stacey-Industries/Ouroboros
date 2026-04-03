import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import type { BufferExcerpt, MultiBufferConfig } from '../../types/electron';

export type { AddExcerptFormProps } from './MultiBufferAddExcerptForm';
export { AddExcerptForm } from './MultiBufferAddExcerptForm';

type FileContentState = {
  content: string | null;
  isLoading: boolean;
  error: string | null;
};

type SetMultiBuffers = React.Dispatch<React.SetStateAction<MultiBufferTab[]>>;
type LoadFileContent = (filePath: string, multiBufferId: string) => Promise<void>;

interface ReadFileResult {
  success: boolean;
  content?: string | null;
  error?: string;
}

interface MultiBufferState {
  multiBuffers: MultiBufferTab[];
  openMultiBuffer: (config?: MultiBufferConfig) => string;
  closeMultiBuffer: (id: string) => void;
  addExcerpt: (id: string, excerpt: BufferExcerpt) => void;
  removeExcerpt: (id: string, excerptIndex: number) => void;
  renameMultiBuffer: (id: string, name: string) => void;
}

export interface MultiBufferTab {
  id: string;
  config: MultiBufferConfig;
  /** Loaded file contents keyed by file path */
  fileContents: Map<string, FileContentState>;
}

export interface MultiBufferManagerProps {
  children: React.ReactNode;
}

const MultiBufferContext = createContext<MultiBufferState | null>(null);

let nextId = 1;

function generateId(): string {
  return `mb-${nextId++}-${Date.now()}`;
}

function updateMultiBuffers(
  buffers: MultiBufferTab[],
  id: string,
  updater: (buffer: MultiBufferTab) => MultiBufferTab,
): MultiBufferTab[] {
  return buffers.map((buffer) => (buffer.id === id ? updater(buffer) : buffer));
}

function withFileContent(
  buffer: MultiBufferTab,
  filePath: string,
  nextState: FileContentState,
): MultiBufferTab {
  const fileContents = new Map(buffer.fileContents);
  fileContents.set(filePath, nextState);
  return { ...buffer, fileContents };
}

function ensureLoadingFileContent(buffer: MultiBufferTab, filePath: string): MultiBufferTab {
  if (buffer.fileContents.has(filePath)) return buffer;
  return withFileContent(buffer, filePath, { content: null, isLoading: true, error: null });
}

function appendExcerpt(buffer: MultiBufferTab, excerpt: BufferExcerpt): MultiBufferTab {
  return {
    ...buffer,
    config: { ...buffer.config, excerpts: [...buffer.config.excerpts, excerpt] },
  };
}

function removeExcerptAtIndex(buffer: MultiBufferTab, excerptIndex: number): MultiBufferTab {
  const excerpts = buffer.config.excerpts.filter((_, index) => index !== excerptIndex);
  return { ...buffer, config: { ...buffer.config, excerpts } };
}

function renameBuffer(buffer: MultiBufferTab, name: string): MultiBufferTab {
  return { ...buffer, config: { ...buffer.config, name } };
}

function createMultiBufferTab(config?: MultiBufferConfig): MultiBufferTab {
  return {
    id: generateId(),
    config: config ?? { name: 'Untitled Multi-Buffer', excerpts: [] },
    fileContents: new Map(),
  };
}

function queueExcerptLoads(
  config: MultiBufferConfig,
  multiBufferId: string,
  loadFileContent: LoadFileContent,
): void {
  const uniquePaths = [...new Set(config.excerpts.map((excerpt) => excerpt.filePath))];
  for (const filePath of uniquePaths) {
    void loadFileContent(filePath, multiBufferId);
  }
}

function toFileContentState(result: ReadFileResult): FileContentState {
  if (result.success) {
    return { content: result.content ?? '', isLoading: false, error: null };
  }
  return { content: null, isLoading: false, error: result.error ?? 'Failed to read file' };
}

async function readFileContentState(filePath: string): Promise<FileContentState> {
  try {
    const result = await window.electronAPI.files.readFile(filePath);
    return toFileContentState(result as ReadFileResult);
  } catch (error) {
    return { content: null, isLoading: false, error: String(error) };
  }
}

function useFileContentLoader(setMultiBuffers: SetMultiBuffers): LoadFileContent {
  return useCallback(async (filePath: string, multiBufferId: string) => {
    setMultiBuffers((prev) =>
      updateMultiBuffers(prev, multiBufferId, (buffer) => ensureLoadingFileContent(buffer, filePath)),
    );
    const nextState = await readFileContentState(filePath);
    setMultiBuffers((prev) =>
      updateMultiBuffers(prev, multiBufferId, (buffer) => withFileContent(buffer, filePath, nextState)),
    );
  }, [setMultiBuffers]);
}

function useBufferLifecycleActions(setMultiBuffers: SetMultiBuffers, loadFileContent: LoadFileContent) {
  const openMultiBuffer = useCallback((config?: MultiBufferConfig): string => {
    const tab = createMultiBufferTab(config);
    setMultiBuffers((prev) => [...prev, tab]);
    queueExcerptLoads(tab.config, tab.id, loadFileContent);
    return tab.id;
  }, [loadFileContent, setMultiBuffers]);

  const closeMultiBuffer = useCallback((id: string) => {
    setMultiBuffers((prev) => prev.filter((buffer) => buffer.id !== id));
  }, [setMultiBuffers]);

  return { openMultiBuffer, closeMultiBuffer };
}

function useBufferConfigActions(setMultiBuffers: SetMultiBuffers, loadFileContent: LoadFileContent) {
  const addExcerpt = useCallback((id: string, excerpt: BufferExcerpt) => {
    setMultiBuffers((prev) => updateMultiBuffers(prev, id, (buffer) => appendExcerpt(buffer, excerpt)));
    void loadFileContent(excerpt.filePath, id);
  }, [loadFileContent, setMultiBuffers]);

  const removeExcerpt = useCallback((id: string, excerptIndex: number) => {
    setMultiBuffers((prev) =>
      updateMultiBuffers(prev, id, (buffer) => removeExcerptAtIndex(buffer, excerptIndex)),
    );
  }, [setMultiBuffers]);

  const renameMultiBuffer = useCallback((id: string, name: string) => {
    setMultiBuffers((prev) => updateMultiBuffers(prev, id, (buffer) => renameBuffer(buffer, name)));
  }, [setMultiBuffers]);

  return { addExcerpt, removeExcerpt, renameMultiBuffer };
}

function useOpenMultiBufferListener(openMultiBuffer: MultiBufferState['openMultiBuffer']): void {
  useEffect(() => {
    function onOpenMultiBuffer(event: Event): void {
      openMultiBuffer((event as CustomEvent<MultiBufferConfig | undefined>).detail);
    }
    window.addEventListener('agent-ide:open-multi-buffer', onOpenMultiBuffer);
    return () => window.removeEventListener('agent-ide:open-multi-buffer', onOpenMultiBuffer);
  }, [openMultiBuffer]);
}

function useMultiBufferState(): MultiBufferState {
  const [multiBuffers, setMultiBuffers] = useState<MultiBufferTab[]>([]);
  const loadFileContent = useFileContentLoader(setMultiBuffers);
  const { openMultiBuffer, closeMultiBuffer } = useBufferLifecycleActions(setMultiBuffers, loadFileContent);
  const { addExcerpt, removeExcerpt, renameMultiBuffer } = useBufferConfigActions(
    setMultiBuffers,
    loadFileContent,
  );

  useOpenMultiBufferListener(openMultiBuffer);
  return { multiBuffers, openMultiBuffer, closeMultiBuffer, addExcerpt, removeExcerpt, renameMultiBuffer };
}

export function MultiBufferManager({ children }: MultiBufferManagerProps): React.ReactElement {
  const value = useMultiBufferState();
  return <MultiBufferContext.Provider value={value}>{children}</MultiBufferContext.Provider>;
}

export function useMultiBufferManager(): MultiBufferState {
  const ctx = useContext(MultiBufferContext);
  if (!ctx) {
    throw new Error('useMultiBufferManager must be used inside <MultiBufferManager>');
  }
  return ctx;
}
