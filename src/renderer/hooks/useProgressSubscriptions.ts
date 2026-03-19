/**
 * useProgressSubscriptions.ts — Subscribes to IPC progress events and feeds
 * them into the toast/notification system as progress notifications.
 *
 * Currently handles:
 * - CLAUDE.md generation (claudeMd:statusChange)
 * - Context layer summarization (contextLayer:progress)
 */

import { useEffect, useRef } from 'react';

import { useToastContext } from '../contexts/ToastContext';

/**
 * Subscribes to all background operation progress events and creates/updates
 * progress notifications in the notification center. Must be called inside
 * a ToastProvider.
 */
export function useProgressSubscriptions(): void {
  const { startProgress, updateProgress, completeProgress } = useToastContext();

  // Track notification IDs for each operation so we can update them
  const claudeMdIdRef = useRef<string | null>(null);
  const contextLayerIdRef = useRef<string | null>(null);

  // ── CLAUDE.md generator ─────────────────────────────────────────────
  useEffect(() => {
    const api = window.electronAPI?.claudeMd;
    if (!api?.onStatusChange) return;

    const cleanup = api.onStatusChange((status) => {
      if (status.running) {
        // Start or update progress
        if (!claudeMdIdRef.current) {
          claudeMdIdRef.current = startProgress('Generating CLAUDE.md files', {
            total: status.progress?.total ?? 0,
          });
        }

        if (status.progress) {
          updateProgress(claudeMdIdRef.current, {
            completed: status.progress.completed,
            total: status.progress.total,
            currentItem: status.currentDir,
          });
        }
      } else if (claudeMdIdRef.current) {
        // Generation finished
        const results = status.lastRun?.results;
        if (results) {
          const created = results.filter((r) => r.status === 'created').length;
          const updated = results.filter((r) => r.status === 'updated').length;
          const errors = results.filter((r) => r.status === 'error').length;
          const parts: string[] = [];
          if (created > 0) parts.push(`${created} created`);
          if (updated > 0) parts.push(`${updated} updated`);
          if (errors > 0) parts.push(`${errors} errors`);
          const summary = parts.length > 0 ? parts.join(', ') : 'No changes';
          const type = errors > 0 ? 'warning' : 'success';
          completeProgress(claudeMdIdRef.current, summary, type);
        } else {
          completeProgress(claudeMdIdRef.current, 'Completed');
        }
        claudeMdIdRef.current = null;
      }
    });

    return cleanup;
  }, [startProgress, updateProgress, completeProgress]);

  // ── Context layer summarization ─────────────────────────────────────
  useEffect(() => {
    const api = window.electronAPI?.contextLayer;
    if (!api?.onProgress) return;

    const cleanup = api.onProgress((payload) => {
      if (payload.type === 'summarizing') {
        if (!contextLayerIdRef.current) {
          contextLayerIdRef.current = startProgress('Summarizing modules', {
            total: payload.total,
          });
        }

        updateProgress(contextLayerIdRef.current, {
          completed: payload.processed,
          total: payload.total,
          currentItem: payload.currentModule ?? undefined,
        });
      } else if (payload.type === 'idle' && contextLayerIdRef.current) {
        // Summarization finished
        if (payload.processed > 0) {
          const summary = payload.failed > 0
            ? `${payload.processed} modules summarized, ${payload.failed} failed`
            : `${payload.processed} modules summarized`;
          const type = payload.failed > 0 ? 'warning' : 'success';
          completeProgress(contextLayerIdRef.current, summary, type);
        } else {
          completeProgress(contextLayerIdRef.current, 'No modules to summarize');
        }
        contextLayerIdRef.current = null;
      }
    });

    return cleanup;
  }, [startProgress, updateProgress, completeProgress]);
}
