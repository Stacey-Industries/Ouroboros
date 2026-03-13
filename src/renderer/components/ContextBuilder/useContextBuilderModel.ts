import { useCallback, useEffect, useState } from 'react';
import type { ContextGenerateOptions, ProjectContext } from '../../types/electron';

const DEFAULT_OPTIONS: ContextGenerateOptions = {
  includeCommands: true,
  includeDeps: true,
  includeStructure: true,
  maxDeps: 20,
};

export interface ContextBuilderModel {
  context: ProjectContext | null;
  editedContent: string;
  error: string | null;
  generatedContent: string;
  options: ContextGenerateOptions;
  scanning: boolean;
  statusMessage: string | null;
  handleCopyToClipboard: () => Promise<void>;
  handleCreateClaudeMd: () => Promise<void>;
  handleEditedContentChange: (value: string) => void;
  handleOptionToggle: (key: keyof ContextGenerateOptions) => void;
  handleResetEdits: () => void;
  handleSetSystemPrompt: () => Promise<void>;
  handleUpdateClaudeMd: () => Promise<void>;
  runScan: () => Promise<void>;
}

interface ContextBuilderState {
  context: ProjectContext | null;
  setContext: React.Dispatch<React.SetStateAction<ProjectContext | null>>;
  editedContent: string;
  setEditedContent: React.Dispatch<React.SetStateAction<string>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  generatedContent: string;
  setGeneratedContent: React.Dispatch<React.SetStateAction<string>>;
  options: ContextGenerateOptions;
  setOptions: React.Dispatch<React.SetStateAction<ContextGenerateOptions>>;
  scanning: boolean;
  setScanning: React.Dispatch<React.SetStateAction<boolean>>;
}

interface ContextScanParams {
  options: ContextGenerateOptions;
  projectRoot: string;
  setContext: React.Dispatch<React.SetStateAction<ProjectContext | null>>;
  setEditedContent: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setGeneratedContent: React.Dispatch<React.SetStateAction<string>>;
  setScanning: React.Dispatch<React.SetStateAction<boolean>>;
}

interface ContextRegenerationParams {
  context: ProjectContext | null;
  options: ContextGenerateOptions;
  projectRoot: string;
  setEditedContent: React.Dispatch<React.SetStateAction<string>>;
  setGeneratedContent: React.Dispatch<React.SetStateAction<string>>;
}

interface ClaudeMdActionParams {
  editedContent: string;
  projectRoot: string;
  showStatus: (message: string, durationMs?: number) => void;
}

interface CreateClaudeMdActionParams extends ClaudeMdActionParams {
  context: ProjectContext | null;
  setContext: React.Dispatch<React.SetStateAction<ProjectContext | null>>;
}

function useTimedStatus(): [string | null, (message: string, durationMs?: number) => void] {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const showStatus = useCallback((message: string, durationMs = 2000) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(null), durationMs);
  }, []);

  return [statusMessage, showStatus];
}

function useContextBuilderState(): ContextBuilderState {
  const [scanning, setScanning] = useState(false);
  const [context, setContext] = useState<ProjectContext | null>(null);
  const [generatedContent, setGeneratedContent] = useState('');
  const [editedContent, setEditedContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<ContextGenerateOptions>(DEFAULT_OPTIONS);

  return {
    context,
    editedContent,
    error,
    generatedContent,
    options,
    scanning,
    setContext,
    setEditedContent,
    setError,
    setGeneratedContent,
    setOptions,
    setScanning,
  };
}

function getClaudeMdPath(projectRoot: string): string {
  return `${projectRoot.replace(/\\/g, '/')}/CLAUDE.md`;
}

function useContextScan(params: ContextScanParams): () => Promise<void> {
  const {
    options,
    projectRoot,
    setContext,
    setEditedContent,
    setError,
    setGeneratedContent,
    setScanning,
  } = params;

  return useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const result = await window.electronAPI.context.generate(projectRoot, options);
      if (result.success && result.context && result.content) {
        setContext(result.context);
        setGeneratedContent(result.content);
        setEditedContent(result.content);
        return;
      }

      setError(result.error ?? 'Failed to scan project');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }, [options, projectRoot, setContext, setEditedContent, setError, setGeneratedContent, setScanning]);
}

function useContextRegeneration(params: ContextRegenerationParams): void {
  const { context, options, projectRoot, setEditedContent, setGeneratedContent } = params;

  useEffect(() => {
    if (!context) {
      return;
    }

    let cancelled = false;

    async function regenerate(): Promise<void> {
      try {
        const result = await window.electronAPI.context.generate(projectRoot, options);
        if (!cancelled && result.success && result.content) {
          setGeneratedContent(result.content);
          setEditedContent(result.content);
        }
      } catch {
        // Keep the last successful generation when regeneration fails.
      }
    }

    void regenerate();

    return () => {
      cancelled = true;
    };
  }, [context, options, projectRoot, setEditedContent, setGeneratedContent]);
}

function useCopyToClipboardAction(
  editedContent: string,
  showStatus: (message: string, durationMs?: number) => void,
): () => Promise<void> {
  return useCallback(async () => {
    try {
      await navigator.clipboard.writeText(editedContent);
      showStatus('Copied to clipboard');
    } catch {
      showStatus('Failed to copy');
    }
  }, [editedContent, showStatus]);
}

function useSetSystemPromptAction(
  editedContent: string,
  showStatus: (message: string, durationMs?: number) => void,
): () => Promise<void> {
  return useCallback(async () => {
    try {
      const current = await window.electronAPI.config.get('claudeCliSettings');
      await window.electronAPI.config.set('claudeCliSettings', {
        ...current,
        appendSystemPrompt: editedContent,
      });
      showStatus('Set as system prompt');
    } catch {
      showStatus('Failed to set system prompt');
    }
  }, [editedContent, showStatus]);
}

function useCreateClaudeMdAction(params: CreateClaudeMdActionParams): () => Promise<void> {
  const { context, editedContent, projectRoot, setContext, showStatus } = params;

  return useCallback(async () => {
    if (!context) {
      return;
    }

    try {
      const result = await window.electronAPI.files.createFile(getClaudeMdPath(projectRoot), editedContent);
      if (result.success) {
        showStatus('Created CLAUDE.md', 3000);
        setContext((previous) => (previous ? { ...previous, hasClaudeMd: true } : previous));
        return;
      }

      showStatus(result.error ?? 'Failed to create file', 3000);
    } catch {
      showStatus('Failed to create CLAUDE.md', 3000);
    }
  }, [context, editedContent, projectRoot, setContext, showStatus]);
}

function useUpdateClaudeMdAction(params: ClaudeMdActionParams): () => Promise<void> {
  const { editedContent, projectRoot, showStatus } = params;

  return useCallback(async () => {
    try {
      const result = await window.electronAPI.files.saveFile(getClaudeMdPath(projectRoot), editedContent);
      showStatus(result.success ? 'Updated CLAUDE.md' : result.error ?? 'Failed to update file', 3000);
    } catch {
      showStatus('Failed to update CLAUDE.md', 3000);
    }
  }, [editedContent, projectRoot, showStatus]);
}

function useOptionToggle(
  setOptions: React.Dispatch<React.SetStateAction<ContextGenerateOptions>>,
): (key: keyof ContextGenerateOptions) => void {
  return useCallback((key: keyof ContextGenerateOptions) => {
    setOptions((previous) => ({ ...previous, [key]: !previous[key] }));
  }, [setOptions]);
}

export function useContextBuilderModel(projectRoot: string): ContextBuilderModel {
  const state = useContextBuilderState();
  const [statusMessage, showStatus] = useTimedStatus();

  const runScan = useContextScan({ projectRoot, options: state.options, ...state });
  useEffect(() => {
    void runScan();
  }, [runScan]);

  useContextRegeneration({
    context: state.context,
    options: state.options,
    projectRoot,
    setEditedContent: state.setEditedContent,
    setGeneratedContent: state.setGeneratedContent,
  });

  const handleCopyToClipboard = useCopyToClipboardAction(state.editedContent, showStatus);
  const handleSetSystemPrompt = useSetSystemPromptAction(state.editedContent, showStatus);
  const handleCreateClaudeMd = useCreateClaudeMdAction({ ...state, projectRoot, showStatus });
  const handleUpdateClaudeMd = useUpdateClaudeMdAction({ editedContent: state.editedContent, projectRoot, showStatus });
  const handleOptionToggle = useOptionToggle(state.setOptions);

  return {
    context: state.context,
    editedContent: state.editedContent,
    error: state.error,
    generatedContent: state.generatedContent,
    handleCopyToClipboard,
    handleCreateClaudeMd,
    handleEditedContentChange: state.setEditedContent,
    handleOptionToggle,
    handleResetEdits: () => state.setEditedContent(state.generatedContent),
    handleSetSystemPrompt,
    handleUpdateClaudeMd,
    options: state.options,
    runScan,
    scanning: state.scanning,
    statusMessage,
  };
}
