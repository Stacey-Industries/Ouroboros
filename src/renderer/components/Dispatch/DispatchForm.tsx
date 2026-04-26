/**
 * DispatchForm.tsx — form for creating a new dispatch job.
 *
 * Collects: title, prompt, project path (from configured roots), optional
 * worktree name. On submit calls sessions.dispatchTask IPC and notifies the
 * parent via onSuccess / onError callbacks.
 *
 * Wave 34 Phase E. Wave 34 Phase G: offline-queue branch.
 */

import React from 'react';

import { useWebConnectionState } from '../../hooks/useWebConnectionState';
import { useDispatchFormModel } from './DispatchForm.logic';
import { DispatchFormView } from './DispatchForm.parts';

export interface DispatchFormProps {
  projectRoots: string[];
  onSuccess: (jobId: string) => void;
  onError: (msg: string) => void;
}

export function DispatchForm({
  projectRoots,
  onSuccess,
  onError,
}: DispatchFormProps): React.ReactElement {
  const connState = useWebConnectionState();
  const model = useDispatchFormModel(projectRoots, connState, onSuccess, onError);
  return <DispatchFormView model={model} projectRoots={projectRoots} />;
}
