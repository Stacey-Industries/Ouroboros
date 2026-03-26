import { useEffect, useRef } from 'react';

import { useToastContext } from '../contexts/ToastContext';
import { subscribeToOrchestrationUiEvents } from './orchestrationEventSubscriptions';

export function useOrchestrationEvents(): void {
  const { toast } = useToastContext();
  const seenStateRef = useRef<Set<string>>(new Set());
  const seenVerificationRef = useRef<Set<string>>(new Set());
  const seenResultRef = useRef<Set<string>>(new Set());
  const seenProviderSessionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return subscribeToOrchestrationUiEvents({
      toast,
      seenProviderSessions: seenProviderSessionsRef.current,
      seenResults: seenResultRef.current,
      seenStates: seenStateRef.current,
      seenVerifications: seenVerificationRef.current,
    });
  }, [toast]);
}
