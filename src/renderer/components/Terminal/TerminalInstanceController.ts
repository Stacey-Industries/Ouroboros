import log from 'electron-log/renderer';
import { useEffect, useRef, useState } from 'react';

import { useProject } from '../../contexts/ProjectContext';
import { buildTerminalController } from './TerminalInstanceController.build';
import {
  useCopyBlockOutput,
  useTerminalFoundation,
  useTerminalHistoryState,
  useTerminalSetupBridge,
} from './TerminalInstanceController.helpers';
import type {
  TerminalInstanceController,
  TerminalInstanceProps,
} from './TerminalInstanceController.types';
import {
  useCommandSearchActions,
  useContextMenuState,
  usePendingPaste,
  useRichInputState,
  useSelectionTooltipState,
} from './TerminalInstanceUiState';
import { useTerminalPersistence } from './useTerminalPersistence';

export type {
  TerminalInstanceController,
  TerminalInstanceProps,
} from './TerminalInstanceController.types';

const DEFAULT_FONT_SIZE = 14;

function useTerminalConfig(): {
  fontSize: number;
  cursorStyle: 'block' | 'underline' | 'bar';
  loaded: boolean;
} {
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [cursorStyle, setCursorStyle] = useState<'block' | 'underline' | 'bar'>('block');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      window.electronAPI.config.get('terminalFontSize'),
      window.electronAPI.config.get('terminalCursorStyle'),
    ])
      .then(([fs, cs]) => {
        if (cancelled) return;
        if (typeof fs === 'number' && fs >= 8 && fs <= 32) setFontSize(fs);
        if (cs === 'block' || cs === 'underline' || cs === 'bar') setCursorStyle(cs);
        setLoaded(true);
      })
      .catch((error) => {
        log.error('Failed to load terminal config:', error);
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { fontSize, cursorStyle, loaded };
}

export function useTerminalInstanceController(
  props: TerminalInstanceProps,
): TerminalInstanceController {
  const config = useTerminalConfig();
  const { projectRoot } = useProject();
  const foundation = useTerminalFoundation(props);
  const historyState = useTerminalHistoryState(foundation.sessionId, foundation.cwd);
  const { restoreSession } = useTerminalPersistence({
    sessionId: foundation.sessionId,
    terminalRef: foundation.terminalRef,
    serializeAddonRef: foundation.serializeAddonRef,
    projectRoot,
    cwd: foundation.cwd,
  });
  const restoreAttemptedRef = useRef(false);
  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;
    void restoreSession();
  }, [restoreSession]);
  const pasteState = usePendingPaste(foundation.sessionId);
  const contextMenuState = useContextMenuState(foundation.terminalRef);
  const richInputState = useRichInputState(foundation.sessionId, foundation.terminalRef);
  const tooltipState = useSelectionTooltipState();
  const cmdSearchActions = useCommandSearchActions(
    foundation.sessionId,
    historyState.historyHook.cmdSearch,
    foundation.terminalRef,
  );
  useTerminalSetupBridge({
    foundation,
    historyState,
    setPendingPaste: pasteState.setPendingPaste,
    setRichInputActive: richInputState.setRichInputActive,
    setSelectionTooltip: tooltipState.setSelectionTooltip,
    initialFontSize: config.fontSize,
    initialCursorStyle: config.cursorStyle,
  });

  return buildTerminalController({
    foundation,
    contextMenuState,
    pasteState,
    richInputState,
    tooltipState,
    cmdSearchActions,
    handleCopyBlockOutput: useCopyBlockOutput(foundation),
    historyState,
  });
}
