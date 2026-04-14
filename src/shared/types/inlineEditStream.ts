/**
 * shared/types/inlineEditStream.ts
 *
 * Streaming inline edit protocol types — Wave 6 (#116).
 * Token-by-token edit events delivered over the dedicated
 * `ai:inlineEditStream:<requestId>` IPC channel.
 *
 * Per user auth constraint (OAuth/CLI-only), deltas are parsed from the
 * `claude -p` stream-json output in the main process and forwarded here.
 */

export interface InlineEditStreamRequest {
  requestId: string;
  /** Absolute path of the file being edited — used for context & path validation. */
  filePath: string;
  /** User instruction for the edit, e.g. "convert this to async". */
  instruction: string;
  /** Range to edit, in Monaco's 1-based line/column coordinates. */
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  /** Surrounding code context (prefix/suffix) sent to the model. */
  selectedText: string;
  prefix: string;
  suffix: string;
}

export type InlineEditStreamEvent =
  | { type: 'token'; delta: string }
  | { type: 'done'; finalText: string }
  | { type: 'error'; message: string };

export interface InlineEditStreamCancelRequest {
  requestId: string;
}
