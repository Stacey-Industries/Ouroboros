import type {
  InlineEditStreamCancelRequest,
  InlineEditStreamEvent,
  InlineEditStreamRequest,
} from '@shared/types/inlineEditStream';

import type { IpcResult } from './electron-foundation';

export interface AiStreamAPI {
  /**
   * Starts a streaming inline edit. Deltas arrive via the returned cleanup's
   * sibling subscription — see `onStream`. Resolves with the request id once
   * the main process has accepted the request.
   */
  startInlineEdit: (request: InlineEditStreamRequest) => Promise<IpcResult & { requestId?: string }>;
  cancelInlineEdit: (request: InlineEditStreamCancelRequest) => Promise<IpcResult>;
  onStream: (
    requestId: string,
    callback: (event: InlineEditStreamEvent) => void,
  ) => () => void;
}

export type { InlineEditStreamCancelRequest, InlineEditStreamEvent, InlineEditStreamRequest };
