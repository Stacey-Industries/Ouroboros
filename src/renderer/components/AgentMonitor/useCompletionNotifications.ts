import log from 'electron-log/renderer';
import { useEffect, useRef } from 'react';

import type { NotificationSettings } from '../../types/electron';
import { buildCompletionNotification } from './notificationBuilder';
import type { AgentSession } from './types';

type ToastFn = (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;

export function useCompletionNotifications(agents: AgentSession[], toast: ToastFn): void {
  const notifiedRef = useRef<Set<string>>(new Set());
  const settingsRef = useRef<NotificationSettings>({ level: 'all', alwaysNotify: false });

  useEffect(() => {
    window.electronAPI?.config
      ?.get('notifications')
      .then((settings) => {
        if (settings) settingsRef.current = settings;
      })
      .catch((error) => {
        log.error('Failed to load notification settings:', error);
      });
  }, []);

  useEffect(() => {
    const { alwaysNotify, level } = settingsRef.current;
    if (level === 'none') return;

    agents.forEach((session) => {
      if (!shouldNotifySession(session, level, notifiedRef.current)) return;

      notifiedRef.current.add(session.id);
      const { body, title } = buildCompletionNotification(session);
      const toastType = session.status === 'error' ? 'error' : 'success';
      toast(`${title}: ${session.taskLabel}`, toastType);
      window.electronAPI?.app?.notify?.({ title, body, force: alwaysNotify }).catch((error) => {
        log.error('Failed to send desktop notification:', error);
      });
    });
  }, [agents, toast]);
}

function shouldNotifySession(
  session: AgentSession,
  level: NotificationSettings['level'],
  notifiedSessions: Set<string>,
): boolean {
  if (session.restored || notifiedSessions.has(session.id)) return false;
  if (session.status !== 'complete' && session.status !== 'error') return false;
  return level !== 'errors-only' || session.status === 'error';
}
