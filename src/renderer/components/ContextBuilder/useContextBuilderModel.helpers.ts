/**
 * useContextBuilderModel.helpers.ts — Stub module for context builder state helpers.
 */

import { useCallback, useEffect,useRef, useState } from 'react';

import type { ContextGenerateOptions, ProjectContext } from '../../types/electron';

export interface ContextBuilderState {
  context: ProjectContext | null;
  editedContent: string;
  error: string | null;
  generatedContent: string;
  options: ContextGenerateOptions;
  scanning: boolean;
  setContext: React.Dispatch<React.SetStateAction<ProjectContext | null>>;
  setEditedContent: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setGeneratedContent: React.Dispatch<React.SetStateAction<string>>;
  setOptions: React.Dispatch<React.SetStateAction<ContextGenerateOptions>>;
  setScanning: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useContextBuilderState(): ContextBuilderState {
  const [context, setContext] = useState<ProjectContext | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState('');
  const [options, setOptions] = useState<ContextGenerateOptions>({
    includeCommands: true,
    includeStructure: true,
    includeDeps: true,
  });
  const [scanning, setScanning] = useState(false);

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

export function useTimedStatus(): [string | null, (message: string, durationMs?: number) => void] {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = useCallback((message: string, durationMs = 2000) => {
    setStatusMessage(message);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setStatusMessage(null);
      timerRef.current = null;
    }, durationMs);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return [statusMessage, showStatus];
}
