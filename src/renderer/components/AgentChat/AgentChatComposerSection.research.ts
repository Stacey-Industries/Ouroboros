/**
 * AgentChatComposerSection.research.ts — Research-command intercept hook
 * extracted from AgentChatComposerSection.tsx to keep that file under the
 * 300-line ESLint cap.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { buildFollowupPrompt, parseResearchCommand, runResearchAndPin } from './researchCommands';

export interface ResearchInterceptOpts {
  draft: string;
  activeSessionId: string | null | undefined;
  researchEnabled: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => Promise<void>;
}

export interface ResearchInterceptResult {
  isResearching: boolean;
  researchTopic: string;
  wrappedOnSend: () => Promise<void>;
  handleCancel: () => void;
}

function useResearchCancel(
  setIsResearching: (v: boolean) => void,
  setResearchTopic: (v: string) => void,
  cancelledRef: React.MutableRefObject<boolean>,
) {
  useEffect(() => {
    function onCancelEvent(): void {
      cancelledRef.current = true;
      setIsResearching(false);
    }
    window.addEventListener('agent-ide:cancel-research', onCancelEvent);
    return () => window.removeEventListener('agent-ide:cancel-research', onCancelEvent);
  }, [cancelledRef, setIsResearching]);

  return useCallback(() => {
    cancelledRef.current = true;
    setIsResearching(false);
    setResearchTopic('');
  }, [cancelledRef, setIsResearching, setResearchTopic]);
}

export function useResearchIntercept(opts: ResearchInterceptOpts): ResearchInterceptResult {
  const { draft, activeSessionId, researchEnabled, onDraftChange, onSend } = opts;
  const [isResearching, setIsResearching] = useState(false);
  const [researchTopic, setResearchTopic] = useState('');
  const cancelledRef = useRef(false);
  const handleCancel = useResearchCancel(setIsResearching, setResearchTopic, cancelledRef);

  const wrappedOnSend = useCallback(async () => {
    const parsed = researchEnabled ? parseResearchCommand(draft) : null;
    if (!parsed || !activeSessionId) return onSend();
    cancelledRef.current = false;
    setIsResearching(true);
    setResearchTopic(parsed.topic);
    onDraftChange('');
    await runResearchAndPin({ sessionId: activeSessionId, topic: parsed.topic });
    if (cancelledRef.current) {
      setResearchTopic('');
      return;
    }
    setIsResearching(false);
    setResearchTopic('');
    const followup = buildFollowupPrompt(parsed.cmd, parsed.topic);
    if (followup) {
      onDraftChange(followup);
      await onSend();
    }
  }, [draft, activeSessionId, researchEnabled, onDraftChange, onSend]);

  return { isResearching, researchTopic, wrappedOnSend, handleCancel };
}
