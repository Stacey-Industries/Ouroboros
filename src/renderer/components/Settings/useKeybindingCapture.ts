import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AppConfig } from '../../types/electron';
import {
  findConflict,
  keyEventToString,
} from './keybindingsData';

export interface CaptureModel {
  capturedKeys: string;
  capturingId: string | null;
  conflictId: string | null;
  cancelCapture: () => void;
  commitShortcut: (actionId: string, shortcut: string) => void;
  resetToDefault: (actionId: string) => void;
  startCapture: (actionId: string) => void;
}

interface CaptureSnapshot {
  capturedKeys: string;
  capturingId: string | null;
  conflictId: string | null;
}

interface CaptureEffectOptions {
  captureRef: MutableRefObject<CaptureSnapshot>;
  capturingId: string | null;
  cancelCapture: () => void;
  commitShortcut: (actionId: string, shortcut: string) => void;
  keybindings: Record<string, string>;
  setCapturedKeys: Dispatch<SetStateAction<string>>;
  setConflictId: Dispatch<SetStateAction<string | null>>;
}

type CaptureResolution =
  | { actionId: string; shortcut: string; type: 'commit' }
  | { conflictId: string | null; shortcut: string; type: 'preview' }
  | null;

export function useKeybindingCapture(
  keybindings: Record<string, string>,
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void,
): CaptureModel {
  const [capturingId, setCapturingId] = useState<string | null>(null);
  const [capturedKeys, setCapturedKeys] = useState('');
  const [conflictId, setConflictId] = useState<string | null>(null);
  const captureRef = useCaptureSnapshot(capturingId, capturedKeys, conflictId);

  const cancelCapture = useCallback(() => {
    setCapturingId(null);
    setCapturedKeys('');
    setConflictId(null);
  }, []);

  const commitShortcut = useCallback(
    (actionId: string, shortcut: string) => {
      onChange('keybindings', { ...keybindings, [actionId]: shortcut });
      cancelCapture();
    },
    [cancelCapture, keybindings, onChange],
  );

  const resetToDefault = useCallback(
    (actionId: string) => {
      const updated = { ...keybindings };
      delete updated[actionId];
      onChange('keybindings', updated);
    },
    [keybindings, onChange],
  );

  const startCapture = useCallback((actionId: string) => {
    setCapturingId(actionId);
    setCapturedKeys('');
    setConflictId(null);
  }, []);

  useCaptureEffect({ captureRef, capturingId, cancelCapture, commitShortcut, keybindings, setCapturedKeys, setConflictId });

  return { capturedKeys, capturingId, conflictId, cancelCapture, commitShortcut, resetToDefault, startCapture };
}

function useCaptureSnapshot(
  capturingId: string | null,
  capturedKeys: string,
  conflictId: string | null,
): MutableRefObject<CaptureSnapshot> {
  const captureRef = useRef<CaptureSnapshot>({ capturingId: null, capturedKeys: '', conflictId: null });

  useEffect(() => {
    captureRef.current = { capturingId, capturedKeys, conflictId };
  }, [capturedKeys, capturingId, conflictId]);

  return captureRef;
}

function useCaptureEffect({
  captureRef,
  capturingId,
  cancelCapture,
  commitShortcut,
  keybindings,
  setCapturedKeys,
  setConflictId,
}: CaptureEffectOptions): void {
  useEffect(() => {
    if (!capturingId) return undefined;
    const handleKeyDown = (event: KeyboardEvent): void => {
      const snapshot = captureRef.current;
      if (!snapshot) return;
      const nextState = resolveCaptureKeyEvent(event, snapshot, keybindings, cancelCapture);
      if (!nextState) return;
      if (nextState.type === 'commit') return commitShortcut(nextState.actionId, nextState.shortcut);
      setCapturedKeys(nextState.shortcut);
      setConflictId(nextState.conflictId);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [cancelCapture, captureRef, capturingId, commitShortcut, keybindings, setCapturedKeys, setConflictId]);
}

function resolveCaptureKeyEvent(
  event: KeyboardEvent,
  snapshot: CaptureSnapshot,
  keybindings: Record<string, string>,
  cancelCapture: () => void,
): CaptureResolution {
  if (!snapshot.capturingId) return null;
  if (event.key === 'Escape') return cancelCaptureEvent(event, cancelCapture);
  if (event.key === 'Enter' && snapshot.capturedKeys && !snapshot.conflictId) {
    return commitCaptureEvent(event, snapshot.capturingId, snapshot.capturedKeys);
  }
  return previewCaptureEvent(event, snapshot.capturingId, keybindings);
}

function cancelCaptureEvent(
  event: KeyboardEvent,
  cancelCapture: () => void,
): CaptureResolution {
  event.preventDefault();
  event.stopPropagation();
  cancelCapture();
  return null;
}

function commitCaptureEvent(
  event: KeyboardEvent,
  actionId: string,
  shortcut: string,
): CaptureResolution {
  event.preventDefault();
  event.stopPropagation();
  return { actionId, shortcut, type: 'commit' };
}

function previewCaptureEvent(
  event: KeyboardEvent,
  actionId: string,
  keybindings: Record<string, string>,
): CaptureResolution {
  const shortcut = keyEventToString(event);
  if (!shortcut) return null;
  event.preventDefault();
  event.stopPropagation();
  return {
    conflictId: findConflict(shortcut, actionId, keybindings),
    shortcut,
    type: 'preview',
  };
}
