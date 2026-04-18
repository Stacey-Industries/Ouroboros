/**
 * sessionDispatchRunnerStatus.ts — Wave 34 Phase C.
 *
 * Broadcast helper for sessionDispatch:status events.
 * Emits to all Electron windows AND the WS bridge so mobile clients receive it.
 */

import { broadcast } from '../web/broadcast';
import type { DispatchJob } from './sessionDispatch';

export const DISPATCH_STATUS_CHANNEL = 'sessionDispatch:status';

/**
 * Broadcasts the full DispatchJob state to every Electron window and every
 * connected WebSocket client. Called on every job status transition.
 */
export function broadcastJobStatus(job: DispatchJob): void {
  broadcast(DISPATCH_STATUS_CHANNEL, job);
}
