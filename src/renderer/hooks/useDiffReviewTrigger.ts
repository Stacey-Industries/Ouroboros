import { useEffect } from 'react';

import { useDiffReview } from '../components/DiffReview/DiffReviewManager';
import type { DiffReviewReadyEvent } from '../types/electron-agent-events';
import { useClaudeCliSettings } from './useClaudeCliSettings';
import { useOwnedSessionIds } from './useOwnedSessionIds';

/**
 * useDiffReviewTrigger — subscribes to agent events and opens the diff-review
 * panel when a `diff_review_ready` event arrives for an owned session.
 *
 * Gates:
 *  1. event.type must be 'diff_review_ready'
 *  2. enableTerminalDiffReview setting must be true
 *  3. event.sessionId must be in the per-window owned session set
 *
 * Pure side-effect mount — returns void.
 */
export function useDiffReviewTrigger(): void {
  const { openReview } = useDiffReview();
  const { enableTerminalDiffReview } = useClaudeCliSettings();
  const ownedIds = useOwnedSessionIds();

  useEffect(() => {
    if (!window.electronAPI?.hooks?.onAgentEvent) return;

    return window.electronAPI.hooks.onAgentEvent((raw: unknown) => {
      const event = raw as Partial<DiffReviewReadyEvent>;
      if (event.type !== 'diff_review_ready') return;
      if (!enableTerminalDiffReview) return;
      if (!event.sessionId || !ownedIds.has(event.sessionId)) return;

      openReview(
        event.sessionId,
        event.snapshotHash ?? '',
        event.projectRoot ?? '',
        event.filePaths,
      );
    });
  }, [enableTerminalDiffReview, ownedIds, openReview]);
}
